import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { worlds, characters, locations, stories, storySongs, songClips, images, videos, settings as settingsTable, aiCalls, type ImageOwnerKind, type VideoOwnerKind } from "@/db/schema";
import { eq, and, inArray, max, desc } from "drizzle-orm";
import { loadImages } from "@/lib/server";
import { putObject } from "@/lib/storage";
import { imageToDataUrl } from "./images";
import { callOpenRouter, callOpenRouterVideo, type ChatMessage, type ChatPart } from "./openrouter";
import { getModelForTask } from "./tasks";
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

async function saveAiImage(imageUrl: string, ownerKind: ImageOwnerKind, ownerId: string) {
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

function videoDurationForSection(section: { startSeconds: number; endSeconds: number }) {
  const sectionDuration = Math.max(0, section.endSeconds - section.startSeconds);
  return sectionDuration <= 6 ? 5 : 8;
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

  // Load relevant context images
  const imageParts: ChatPart[] = [];
  
  // 1. World Mood
  const moodImages = await loadImages("world_mood", world.id);
  for (const img of moodImages.slice(0, 1)) {
    const dataUrl = await imageToDataUrl({ s3Key: img.s3Key, mimeType: img.mimeType });
    if (dataUrl) imageParts.push({ type: "image_url", image_url: { url: dataUrl } });
  }

  // 2. Character & Location Images (only those mentioned in the section)
  const allChars = await db.select().from(characters).where(eq(characters.worldId, world.id));
  const allLocs = await db.select().from(locations).where(eq(locations.worldId, world.id));

  const mentionedChars = allChars.filter(c => section.characters.toLowerCase().includes(c.name.toLowerCase()));
  const mentionedLocs = allLocs.filter(l => section.scenes.toLowerCase().includes(l.name.toLowerCase()));

  for (const entity of [...mentionedChars, ...mentionedLocs]) {
    const kind: ImageOwnerKind = (entity as any).name ? ("description" in entity && "worldId" in entity && !("storyId" in entity) && (entity as any).id === mentionedChars.find(c=>c.id === entity.id)?.id) ? "character" : "location" : "location";
    const entityImages = await loadImages(kind as ImageOwnerKind, entity.id);
    for (const img of entityImages.slice(0, 1)) {
      const dataUrl = await imageToDataUrl({ s3Key: img.s3Key, mimeType: img.mimeType });
      if (dataUrl) imageParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
  }

  const prompt = [
    `Generate a high-quality storyboard clip image for the world "${world.name}".`,
    `World Art Style: ${world.artStyle}`,
    `Story Context: ${story.description}`,
    "",
    `Scene Mood: ${section.mood}`,
    `Scene Characters: ${mentionedChars.map(c => `${c.name} (${c.description})`).join(", ") || "None"}`,
    `Scene Location: ${mentionedLocs.map(l => `${l.name} (${l.description})`).join(", ") || "None"}`,
    `Scene Overall Description: ${section.description}`,
    "",
    `SPECIFIC CLIP TO RENDER:`,
    `${clip.description}`,
    "",
    "Instructions:",
    `- Maintain strict stylistic consistency with the provided world and entity reference images.`,
    `- Focus heavily on the "SPECIFIC CLIP TO RENDER" action.`,
    `- Output the image in 16:9 aspect ratio.`,
    `- No text overlays or watermarks.`,
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
    response: result.images.length > 0 ? `[${result.images.length} images generated]` : result.text,
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

  const [latestImage] = await db
    .select()
    .from(images)
    .where(and(eq(images.ownerKind, "song_clip"), eq(images.ownerId, clip.id)))
    .orderBy(desc(images.position), desc(images.createdAt))
    .limit(1);
  if (!latestImage) {
    throw new GenerationError(400, "Clip must have an image before generating a video");
  }

  const firstFrameDataUrl = await imageToDataUrl({
    s3Key: latestImage.s3Key,
    mimeType: latestImage.mimeType,
  });
  if (!firstFrameDataUrl) {
    throw new GenerationError(500, "Failed to load clip image context");
  }

  const durationSeconds = videoDurationForSection(section);
  const prompt = [
    `Create an image-to-video storyboard clip for the world "${world.name}".`,
    `World art style: ${world.artStyle}`,
    `Story context: ${story.description}`,
    "",
    `Section context: ${section.description}`,
    `Scene mood: ${section.mood}`,
    `Clip action: ${clip.description}`,
    "",
    "Instructions:",
    "- Use the provided image as the first frame and preserve its characters, environment, composition, and visual style.",
    "- Add natural cinematic motion that supports the clip action without changing identities or location.",
    "- Avoid text overlays, captions, credits, subtitles, logos, or watermarks.",
  ].join("\n");

  const videoModel = getModelForTask("generate_video", config?.taskModels ?? {});
  const start = Date.now();
  const result = await callOpenRouterVideo({
    apiKey,
    model: videoModel,
    prompt,
    firstFrameDataUrl,
    durationSeconds,
    aspectRatio: "16:9",
    resolution: "720p",
  });

  await db.insert(aiCalls).values({
    worldId: args.worldId,
    storyId: args.storyId,
    task: "generate_clip_video",
    model: videoModel,
    prompt: JSON.stringify(
      {
        prompt,
        firstFrame: {
          imageId: latestImage.id,
          s3Key: latestImage.s3Key,
          data: "[image elided]",
        },
      },
      null,
      2,
    ),
    response: `[video generated: ${result.jobId}]`,
    costUsd: result.usage.costUsd != null ? result.usage.costUsd.toString() : null,
    durationMs: Date.now() - start,
  });

  return saveAiVideo({
    buffer: result.video,
    mimeType: result.mimeType,
    durationSeconds,
    ownerKind: "song_clip",
    ownerId: clip.id,
  });
}
