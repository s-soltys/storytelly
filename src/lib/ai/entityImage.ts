import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { worlds, characters, locations, stories, storyCharacters, storyLocations, storySongs, songClips, images, videos, settings as settingsTable, aiCalls, type ImageOwnerKind, type VideoOwnerKind } from "@/db/schema";
import { eq, and, inArray, max, desc } from "drizzle-orm";
import { loadImages } from "@/lib/server";
import { putObject } from "@/lib/storage";
import { imageToDataUrl, MAX_DATA_URL_IMAGE_BYTES } from "./images";
import { callOpenRouter, callOpenRouterVideo, isOpenRouterImageSafetyError, type ChatMessage, type ChatPart } from "./openrouter";
import { chooseVideoDuration, getModelForTask, getVideoModelConfig } from "./tasks";
import { serializePromptForStorage } from "./song";
import { GenerationError } from "./songScript";

const GENERATED_VIDEO_EXT = "mp4";

async function saveAiVideo(args: {
  buffer: Buffer;
  mimeType: string;
  durationSeconds: number;
  ownerKind: VideoOwnerKind;
  ownerId: string;
}) {
  const ext = extensionFromMime(args.mimeType, GENERATED_VIDEO_EXT);
  const key = `clips/${args.ownerId}/videos/${randomUUID()}.${ext}`;

  await putObject(key, args.buffer, args.mimeType);

  const [{ value: maxPos }] = await db
    .select({ value: max(videos.position) })
    .from(videos)
    .where(and(eq(videos.ownerKind, args.ownerKind), eq(videos.ownerId, args.ownerId)));
  const position = (maxPos ?? -1) + 1;

  const [row] = await db
    .insert(videos)
    .values({
      s3Key: key,
      mimeType: args.mimeType,
      sizeBytes: args.buffer.length,
      durationSeconds: args.durationSeconds,
      ownerKind: args.ownerKind,
      ownerId: args.ownerId,
      position,
    })
    .returning();

  return row;
}

export async function saveAiImage(imageUrl: string, ownerKind: ImageOwnerKind, ownerId: string) {
  let buffer: Buffer;
  let contentType: string;

  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid data URL format from AI");
    contentType = match[1];
    buffer = Buffer.from(match[2], "base64");
  } else {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to download image from ${imageUrl}`);
    const arrayBuffer = await res.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    contentType = res.headers.get("content-type") || "image/png";
  }

  const ext = contentType.split("/")[1]?.split("+")[0] || "png";
  const folder = ownerKind === "song_clip" ? "clips" : ownerKind === "character" ? "characters" : "locations";
  const key = `${folder}/${ownerId}/images/${randomUUID()}.${ext}`;

  await putObject(key, buffer, contentType);

  const [{ value: maxPos }] = await db
    .select({ value: max(images.position) })
    .from(images)
    .where(and(eq(images.ownerKind, ownerKind), eq(images.ownerId, ownerId)));
  const position = (maxPos ?? -1) + 1;

  const [row] = await db
    .insert(images)
    .values({
      s3Key: key,
      mimeType: contentType,
      sizeBytes: buffer.length,
      ownerKind,
      ownerId,
      position,
    })
    .returning();

  return row;
}

function extensionFromMime(mimeType: string | null, fallback: string): string {
  if (!mimeType) return fallback;
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase();
  if (normalized === "video/mp4" || normalized === "application/mp4") return "mp4";
  if (normalized === "video/webm") return "webm";
  if (normalized === "video/quicktime") return "mov";
  return normalized?.split("/")[1]?.split("+")[0] || fallback;
}

export async function generateEntityImage(args: {
//... existing code ...
  worldId: string;
  entityId: string;
  kind: "character" | "location";
}) {
  const [world] = await db.select().from(worlds).where(eq(worlds.id, args.worldId));
  if (!world) throw new GenerationError(404, "World not found");

  let entityName = "";
  let entityDescription = "";

  if (args.kind === "character") {
    const [char] = await db.select().from(characters).where(eq(characters.id, args.entityId));
    if (!char) throw new GenerationError(404, "Character not found");
    entityName = char.name;
    entityDescription = char.description;
  } else {
    const [loc] = await db.select().from(locations).where(eq(locations.id, args.entityId));
    if (!loc) throw new GenerationError(404, "Location not found");
    entityName = loc.name;
    entityDescription = loc.description;
  }

  const [config] = await db.select().from(settingsTable).limit(1);
  const apiKey = config?.openrouterApiKey?.trim();
  if (!apiKey) throw new GenerationError(400, "OpenRouter API key missing");

  const moodImages = await loadImages("world_mood", world.id);
  const imageModel = getModelForTask("generate_image", config?.taskModels ?? {});

  const imageParts: ChatPart[] = await Promise.all(
    moodImages.slice(0, 3).map(async (img) => {
      const dataUrl = await imageToDataUrl({ s3Key: img.s3Key, mimeType: img.mimeType });
      return { type: "image_url", image_url: { url: dataUrl || "" } } as ChatPart;
    })
  );

  const prompt = [
    `Generate a high-quality ${args.kind} image for the world "${world.name}".`,
    `World Art Style: ${world.artStyle}`,
    `World Description: ${world.description}`,
    `Entity Name: ${entityName}`,
    `Entity Description: ${entityDescription}`,
    "",
    "Instructions:",
    `- Maintain strict stylistic consistency with the provided world mood images.`,
    `- Focus on the ${args.kind} specifically.`,
    `- If it's a character, show a clear cinematic portrait.`,
    `- If it's a location, show a wide cinematic view.`,
    `- Output the image in 16:9 aspect ratio.`,
    `- No text overlays or watermarks.`,
  ].filter(Boolean).join("\n");

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        ...imageParts.filter(p => (p as any).image_url.url),
        { type: "text", text: prompt }
      ]
    }
  ];

  const start = Date.now();
  const result = await callOpenRouter({
    apiKey,
    model: imageModel,
    messages,
    modalities: ["image", "text"],
    imageConfig: {
      aspect_ratio: "16:9",
    },
  });

  // Log the AI call
  await db.insert(aiCalls).values({
    worldId: args.worldId,
    storyId: null,
    task: `generate_${args.kind}_image`,
    model: imageModel,
    prompt: serializePromptForStorage(messages),
    response: result.images.length > 0 ? `[${result.images.length} images generated]` : result.text,
    costUsd: result.usage.costUsd?.toString(),
    durationMs: Date.now() - start,
  });

  if (result.images.length === 0) {
    throw new Error("AI failed to generate an image.");
  }

  return result.images[0];
}

export async function generateClipImage(args: {
  worldId: string;
  storyId: string;
  songId: string;
  clipId: string;
}) {
  const [config] = await db.select().from(settingsTable).limit(1);
  const apiKey = config?.openrouterApiKey?.trim();
  if (!apiKey) throw new GenerationError(400, "OpenRouter API key missing");

  const [world] = await db.select().from(worlds).where(eq(worlds.id, args.worldId));
  if (!world) throw new GenerationError(404, "World not found");

  const [story] = await db.select().from(stories).where(eq(stories.id, args.storyId));
  if (!story) throw new GenerationError(404, "Story not found");

  const [song] = await db.select().from(storySongs).where(eq(storySongs.id, args.songId));
  if (!song) throw new GenerationError(404, "Song not found");

  const [clip] = await db.select().from(songClips).where(eq(songClips.id, args.clipId));
  if (!clip) throw new GenerationError(404, "Clip not found");

  const sections: any[] = (song.sections as any[]) || [];
  const section = sections[clip.sectionIndex];
  if (!section) throw new GenerationError(404, "Parent section not found for clip");

  // Load the story's linked characters and locations via join tables
  // (reliable — does not depend on AI-generated free-text name matching)
  const [charLinks, locLinks] = await Promise.all([
    db
      .select({ characterId: storyCharacters.characterId })
      .from(storyCharacters)
      .where(eq(storyCharacters.storyId, story.id)),
    db
      .select({ locationId: storyLocations.locationId })
      .from(storyLocations)
      .where(eq(storyLocations.storyId, story.id)),
  ]);
  const charIds = charLinks.map((l) => l.characterId);
  const locIds = locLinks.map((l) => l.locationId);

  const [storyChars, storyLocs] = await Promise.all([
    charIds.length
      ? db.select().from(characters).where(inArray(characters.id, charIds))
      : Promise.resolve([]),
    locIds.length
      ? db.select().from(locations).where(inArray(locations.id, locIds))
      : Promise.resolve([]),
  ]);

  // Try to narrow to entities mentioned in this section, falling back to all story entities
  const sectionCharsText = (section.characters || "").toLowerCase();
  const sectionScenesText = (section.scenes || "").toLowerCase();

  const mentionedChars = storyChars.filter(
    (c) => sectionCharsText.includes(c.name.toLowerCase()),
  );
  const mentionedLocs = storyLocs.filter(
    (l) => sectionScenesText.includes(l.name.toLowerCase()),
  );

  // If name matching found nothing, fall back to all story entities so we always have references
  const effectiveChars = mentionedChars.length > 0 ? mentionedChars : storyChars;
  const effectiveLocs = mentionedLocs.length > 0 ? mentionedLocs : storyLocs;

  console.log(
    `[generateClipImage] clip=${args.clipId} section=${clip.sectionIndex}` +
    ` | storyChars=${storyChars.length} matched=${mentionedChars.length} effective=${effectiveChars.length}` +
    ` | storyLocs=${storyLocs.length} matched=${mentionedLocs.length} effective=${effectiveLocs.length}`,
  );

  // Collect labelled image parts: world mood, then each character, then each location
  const imageParts: ChatPart[] = [];
  const imageLabels: string[] = [];

  // 1. World Mood
  const moodImages = await loadImages("world_mood", world.id);
  for (const img of moodImages.slice(0, 2)) {
    const dataUrl = await imageToDataUrl({ s3Key: img.s3Key, mimeType: img.mimeType });
    if (dataUrl) {
      imageParts.push({ type: "image_url", image_url: { url: dataUrl } });
      imageLabels.push(`[World Mood Reference for "${world.name}"]`);
    }
  }

  // 2. Character reference images
  const charIdSet = new Set(effectiveChars.map((c) => c.id));
  for (const char of effectiveChars) {
    const charImages = await loadImages("character", char.id);
    for (const img of charImages.slice(0, 2)) {
      const dataUrl = await imageToDataUrl({ s3Key: img.s3Key, mimeType: img.mimeType });
      if (dataUrl) {
        imageParts.push({ type: "image_url", image_url: { url: dataUrl } });
        imageLabels.push(`[CHARACTER REFERENCE: "${char.name}" — the generated image MUST depict this character with the same visual identity, face, and appearance]`);
      }
    }
  }

  // 3. Location reference images
  for (const loc of effectiveLocs) {
    const locImages = await loadImages("location", loc.id);
    for (const img of locImages.slice(0, 1)) {
      const dataUrl = await imageToDataUrl({ s3Key: img.s3Key, mimeType: img.mimeType });
      if (dataUrl) {
        imageParts.push({ type: "image_url", image_url: { url: dataUrl } });
        imageLabels.push(`[LOCATION REFERENCE: "${loc.name}" — use this as the visual basis for the environment]`);
      }
    }
  }

  console.log(
    `[generateClipImage] clip=${args.clipId} | total reference images: ${imageParts.length}` +
    ` (mood=${moodImages.length}, chars=${effectiveChars.length}, locs=${effectiveLocs.length})`,
  );

  const prompt = [
    `Generate a high-quality storyboard clip image for the world "${world.name}".`,
    `World Art Style: ${world.artStyle}`,
    `Story Context: ${story.description}`,
    "",
    "REFERENCE IMAGES PROVIDED (in order):",
    ...imageLabels.map((label, i) => `  Image ${i + 1}: ${label}`),
    "",
    `Scene Mood: ${section.mood}`,
    `Scene Characters: ${effectiveChars.map((c) => `${c.name} (${c.description})`).join(", ") || "None"}`,
    `Scene Location: ${effectiveLocs.map((l) => `${l.name} (${l.description})`).join(", ") || "None"}`,
    `Scene Overall Description: ${section.description}`,
    "",
    `SPECIFIC CLIP TO RENDER:`,
    `${clip.description}`,
    "",
    "CRITICAL INSTRUCTIONS:",
    "- CHARACTER IDENTITY: Each character in the generated image MUST look like their reference photo. Reproduce their face, build, hair, skin tone, and distinguishing features faithfully. Do NOT invent a new appearance.",
    "- LOCATION IDENTITY: If a location reference is provided, use its architecture, colors, and atmosphere as the environment basis.",
    "- STYLE CONSISTENCY: Maintain the world art style and mood shown in the world mood reference images.",
    "- Focus heavily on the \"SPECIFIC CLIP TO RENDER\" action.",
    "- Output the image in 16:9 aspect ratio.",
    "- No text overlays or watermarks.",
  ].filter(Boolean).join("\n");

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        ...imageParts,
        { type: "text", text: prompt }
      ]
    }
  ];

  const imageModel = getModelForTask("generate_image", config?.taskModels ?? {});
  const start = Date.now();
  
  const result = await callOpenRouter({
    apiKey,
    model: imageModel,
    messages,
    modalities: ["image", "text"],
    imageConfig: {
      aspect_ratio: "16:9",
    },
  });

  await db.insert(aiCalls).values({
    worldId: args.worldId,
    storyId: args.storyId,
    task: `generate_clip_image`,
    model: imageModel,
    prompt: serializePromptForStorage(messages),
    response: result.images.length > 0
      ? `[${result.images.length} images generated | refs: ${imageParts.length} (chars=${effectiveChars.length}, locs=${effectiveLocs.length})]`
      : result.text,
    costUsd: result.usage.costUsd?.toString(),
    durationMs: Date.now() - start,
  });

  if (result.images.length === 0) {
    throw new Error("AI failed to generate an image.");
  }

  return result.images[0];
}

export async function generateAllClipImages(args: {
  worldId: string;
  storyId: string;
  songId: string;
}) {
  const allClips = await db
    .select()
    .from(songClips)
    .where(eq(songClips.songId, args.songId));
    
  if (allClips.length === 0) return 0;

  // Find clips that don't have images yet
  const clipIds = allClips.map(c => c.id);
  const existingImages = await db
    .select({ ownerId: images.ownerId })
    .from(images)
    .where(
      and(
        eq(images.ownerKind, "song_clip"),
        inArray(images.ownerId, clipIds)
      )
    );
  
  const clipsWithImages = new Set(existingImages.map(img => img.ownerId));
  const clipsToGenerate = allClips.filter(c => !clipsWithImages.has(c.id));

  let count = 0;
  for (const clip of clipsToGenerate) {
    try {
      const url = await generateClipImage({
        worldId: args.worldId,
        storyId: args.storyId,
        songId: args.songId,
        clipId: clip.id,
      });
      
      await saveAiImage(url, "song_clip", clip.id);
      count++;
    } catch (err) {
      console.error(`Failed to generate image for clip ${clip.id}`, err);
    }
  }

  return count;
}

export async function generateClipVideo(args: {
  worldId: string;
  storyId: string;
  songId: string;
  clipId: string;
}) {
  const [config] = await db.select().from(settingsTable).limit(1);
  const apiKey = config?.openrouterApiKey?.trim();
  if (!apiKey) throw new GenerationError(400, "OpenRouter API key missing");

  const [story] = await db
    .select()
    .from(stories)
    .where(and(eq(stories.id, args.storyId), eq(stories.worldId, args.worldId)));
  if (!story) throw new GenerationError(404, "Story not found");

  const [world] = await db.select().from(worlds).where(eq(worlds.id, story.worldId));
  if (!world) throw new GenerationError(404, "World not found");

  const [song] = await db
    .select()
    .from(storySongs)
    .where(and(eq(storySongs.id, args.songId), eq(storySongs.storyId, story.id)));
  if (!song || song.archived) throw new GenerationError(404, "Song not found");

  const [clip] = await db
    .select()
    .from(songClips)
    .where(and(eq(songClips.id, args.clipId), eq(songClips.songId, song.id)));
  if (!clip) throw new GenerationError(404, "Clip not found");

  const sections = song.sections || [];
  const section = sections[clip.sectionIndex];
  if (!section) throw new GenerationError(404, "Parent section not found for clip");

  const clipImages = await db
    .select()
    .from(images)
    .where(and(eq(images.ownerKind, "song_clip"), eq(images.ownerId, clip.id)))
    .orderBy(desc(images.position), desc(images.createdAt));
  const [latestImage] = clipImages;
  if (!latestImage) {
    throw new GenerationError(400, "Clip must have an image before generating a video");
  }

  const videoModel = getModelForTask("generate_video", config?.taskModels ?? {});
  const videoConfig = getVideoModelConfig(videoModel);
  const durationSeconds = chooseVideoDuration(
    videoModel,
    Math.max(1, section.endSeconds - section.startSeconds),
  );
  const prompt = [
    "Create an image-to-video storyboard clip from the provided first frame.",
    "",
    "Motion direction: add gentle natural movement to the visible subjects and environment.",
    "Use subtle camera movement, soft ambient motion, and preserve the exact look of the first frame.",
    "Keep the tone cinematic and adventurous.",
    "",
    "Instructions:",
    "- Use the provided image as the first frame and preserve the visible subjects, environment, composition, and visual style.",
    "- Do not change identities, location, clothing, lighting, or scene layout.",
    "- Avoid text overlays, captions, credits, subtitles, logos, or watermarks.",
  ].join("\n");

  const start = Date.now();
  let lastSafetyError: unknown = null;
  let lastAttemptLog = "";

  for (const image of clipImages) {
    const firstFrameDataUrl = await imageToDataUrl({
      s3Key: image.s3Key,
      mimeType: image.mimeType,
    });
    const promptLog = JSON.stringify(
      {
        clipId: clip.id,
        prompt,
        firstFrame: {
          imageId: image.id,
          s3Key: image.s3Key,
          data: "[image elided]",
        },
      },
      null,
      2,
    );
    lastAttemptLog = promptLog;

    if (!firstFrameDataUrl) {
      lastSafetyError = new GenerationError(
        413,
        `Clip image is too large for video generation. Regenerate the clip image or upload an image under ${Math.round(
          MAX_DATA_URL_IMAGE_BYTES / 1_000_000,
        )} MB.`,
        { imageId: image.id, sizeBytes: image.sizeBytes },
      );
      continue;
    }

    try {
      const result = await callOpenRouterVideo({
        apiKey,
        model: videoModel,
        prompt,
        firstFrameDataUrl,
        durationSeconds,
        aspectRatio: videoConfig.aspectRatio,
        resolution: videoConfig.resolution,
      });

      const video = await saveAiVideo({
        buffer: result.video,
        mimeType: result.mimeType,
        durationSeconds,
        ownerKind: "song_clip",
        ownerId: clip.id,
      });

      await db.insert(aiCalls).values({
        worldId: args.worldId,
        storyId: args.storyId,
        task: "generate_clip_video",
        model: videoModel,
        prompt: promptLog,
        response: `[video generated: ${result.jobId}]`,
        costUsd: result.usage.costUsd != null ? result.usage.costUsd.toString() : null,
        durationMs: Date.now() - start,
      });

      return video;
    } catch (error) {
      if (isOpenRouterImageSafetyError(error)) {
        lastSafetyError = error;
        await logClipVideoFailure({
          worldId: args.worldId,
          storyId: args.storyId,
          model: videoModel,
          prompt: promptLog,
          response: `[failed:image-safety-retrying] ${(error as Error).message}`,
          durationMs: Date.now() - start,
        });
        continue;
      }

      await logClipVideoFailure({
        worldId: args.worldId,
        storyId: args.storyId,
        model: videoModel,
        prompt: promptLog,
        response: `[failed] ${(error as Error).message}`,
        durationMs: Date.now() - start,
      });
      throw error;
    }
  }

  await logClipVideoFailure({
    worldId: args.worldId,
    storyId: args.storyId,
    model: videoModel,
    prompt: lastAttemptLog,
    response: `[failed] ${(lastSafetyError as Error | null)?.message || "No usable clip image"}`,
    durationMs: Date.now() - start,
  });
  throw new GenerationError(
    422,
    "Veo rejected the available clip image(s) for person/face safety. Try regenerating the clip image with fewer visible faces, use a wider/environmental shot, or use a non-Google video model for this clip.",
  );
}

async function logClipVideoFailure(args: {
  worldId: string;
  storyId: string;
  model: string;
  prompt: string;
  response: string;
  durationMs: number;
}) {
  await db
    .insert(aiCalls)
    .values({
      worldId: args.worldId,
      storyId: args.storyId,
      task: "generate_clip_video",
      model: args.model,
      prompt: args.prompt,
      response: args.response,
      durationMs: args.durationMs,
    })
    .catch((logError) => {
      console.error("Failed to log clip video generation error:", logError);
    });
}
