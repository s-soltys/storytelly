import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { worlds, characters, locations, stories, storySongs, songClips, images, videos, settings as settingsTable, aiCalls, type ImageOwnerKind, type VideoOwnerKind } from "@/db/schema";
import { eq, and, inArray, max } from "drizzle-orm";
import { loadImages } from "@/lib/server";
import { putObject } from "@/lib/storage";
import { imageToDataUrl } from "./images";
import { callOpenRouter, type ChatMessage, type ChatPart } from "./openrouter";
import { getModelForTask } from "./tasks";
import { serializePromptForStorage } from "./song";
import { GenerationError } from "./songScript";

async function saveAiVideo(videoUrl: string, ownerKind: VideoOwnerKind, ownerId: string) {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Failed to download video from ${videoUrl}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = res.headers.get("content-type") || "video/mp4";

  const ext = contentType.split("/")[1]?.split("+")[0] || "mp4";
  const folder = ownerKind === "song_clip" ? "clips" : "misc";
  const key = `${folder}/${ownerId}/videos/${randomUUID()}.${ext}`;

  await putObject(key, buffer, contentType);

  const [{ value: maxPos }] = await db
    .select({ value: max(videos.position) })
    .from(videos)
    .where(and(eq(videos.ownerKind, ownerKind), eq(videos.ownerId, ownerId)));
  const position = (maxPos ?? -1) + 1;

  const [row] = await db
    .insert(videos)
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

  // Load the clip's image as the reference
  const [latestImage] = await db
    .select()
    .from(images)
    .where(and(eq(images.ownerKind, "song_clip"), eq(images.ownerId, clip.id)))
    .orderBy(images.position.desc())
    .limit(1);

  if (!latestImage) throw new Error("Clip must have an image before generating a video.");

  const dataUrl = await imageToDataUrl({ s3Key: latestImage.s3Key, mimeType: latestImage.mimeType });
  if (!dataUrl) throw new Error("Failed to load clip image context.");

  const duration = section.endSeconds - section.startSeconds;
  
  const prompt = [
    `Generate a high-quality cinematic video based on this image for the world "${world.name}".`,
    `World Art Style: ${world.artStyle}`,
    "",
    `Section Context: ${section.description}`,
    `Scene Mood: ${section.mood}`,
    `Clip Narrative: ${clip.description}`,
    "",
    "Instructions:",
    `- The video MUST follow the visual style, characters, and environment shown in the provided image.`,
    `- The motion should be cinematic and natural.`,
    `- Aim for a duration of approximately ${Math.min(duration, 10)} seconds.`,
    `- No text overlays or watermarks.`,
  ].filter(Boolean).join("\n");

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: dataUrl } },
        { type: "text", text: prompt }
      ]
    }
  ];

  const videoModel = getModelForTask("generate_video", config?.taskModels ?? {});
  const start = Date.now();
  
  const result = await callOpenRouter({
    apiKey,
    model: videoModel,
    messages,
    modalities: ["video", "text"],
  });

  await db.insert(aiCalls).values({
    worldId: args.worldId,
    storyId: args.storyId,
    task: `generate_clip_video`,
    model: videoModel,
    prompt: serializePromptForStorage(messages),
    response: result.videos.length > 0 ? `[${result.videos.length} videos generated]` : result.text,
    costUsd: result.usage.costUsd?.toString(),
    durationMs: Date.now() - start,
  });

  if (result.videos.length === 0) {
    throw new Error("AI failed to generate a video. Response: " + result.text);
  }

  const videoRow = await saveAiVideo(result.videos[0], "song_clip", clip.id);
  return videoRow;
}


