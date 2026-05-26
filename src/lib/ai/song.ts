import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  characters,
  images,
  locations,
  settings as settingsTable,
  stories,
  storyCharacters,
  storyLocations,
  storySongs,
  worlds,
  aiCalls,
} from "@/db/schema";
import { putObject } from "@/lib/storage";
import { imageToDataUrl } from "./images";
import { callOpenRouterAudio, type ChatMessage, type ChatPart } from "./openrouter";
import { getModelForTask } from "./tasks";
import { GenerationError } from "./songScript";

const MAX_IMAGES_PER_CHARACTER = 2;
const MAX_IMAGES_PER_LOCATION = 1;
const GENERATED_MIME = "audio/mpeg";
const GENERATED_EXT = "mp3";

type SongContext = {
  story: {
    id: string;
    name: string;
    description: string;
    lengthSeconds: number;
    lyrics: string | null;
  };
  world: { name: string; artStyle: string; description: string };
  characters: Array<{
    name: string;
    description: string;
    images: Array<{ s3Key: string; mimeType: string | null }>;
  }>;
  locations: Array<{
    name: string;
    description: string;
    images: Array<{ s3Key: string; mimeType: string | null }>;
  }>;
};

export async function generateStorySong(args: {
  worldId: string;
  storyId: string;
  lengthSeconds: number;
  lyrics?: string;
}): Promise<{ id: string }> {
  const ctx = await loadSongContext(args);
  const [config] = await db.select().from(settingsTable).limit(1);
  const apiKey = config?.openrouterApiKey?.trim();
  if (!apiKey) {
    throw new GenerationError(
      400,
      "OpenRouter API key is not configured. Add one in settings.",
    );
  }

  const model = getModelForTask("song", config?.taskModels ?? {});
  const messages = await buildSongMessages(ctx);
  const start = Date.now();
  const result = await callOpenRouterAudio({
    apiKey,
    model,
    messages,
    format: GENERATED_EXT,
  });
  const durationMs = Date.now() - start;

  // Log the call
  await db.insert(aiCalls).values({
    worldId: args.worldId,
    storyId: args.storyId,
    task: "song",
    model,
    prompt: serializePromptForStorage(messages),
    response: result.transcript || "[audio generated]",
    costUsd: result.usage.costUsd != null ? result.usage.costUsd.toString() : null,
    durationMs,
  });

  const s3Key = `stories/${ctx.story.id}/songs/${randomUUID()}.${GENERATED_EXT}`;
  await putObject(s3Key, result.audio, GENERATED_MIME);

  const [row] = await db
    .insert(storySongs)
    .values({
      storyId: ctx.story.id,
      name: `${ctx.story.name} - AI song`,
      source: "generated",
      s3Key,
      mimeType: GENERATED_MIME,
      sizeBytes: result.audio.byteLength,
      lengthSeconds: args.lengthSeconds,
      lyrics: args.lyrics?.trim() || null,
      model,
      prompt: serializePromptForStorage(messages),
      transcript: result.transcript || null,
      costUsd:
        result.usage.costUsd != null ? result.usage.costUsd.toString() : null,
      archived: false,
    })
    .returning({ id: storySongs.id });

  return row;
}

export async function loadSongContext(args: {
  worldId: string;
  storyId: string;
  lengthSeconds?: number;
  lyrics?: string;
}): Promise<SongContext> {
  const [story] = await db
    .select()
    .from(stories)
    .where(
      and(eq(stories.id, args.storyId), eq(stories.worldId, args.worldId)),
    );
  if (!story) throw new GenerationError(404, "Story not found");

  const [world] = await db
    .select()
    .from(worlds)
    .where(eq(worlds.id, story.worldId));
  if (!world) throw new GenerationError(404, "World not found");

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
  const characterIds = charLinks.map((link) => link.characterId);
  const locationIds = locLinks.map((link) => link.locationId);

  const [characterRows, locationRows] = await Promise.all([
    characterIds.length
      ? db.select().from(characters).where(inArray(characters.id, characterIds))
      : Promise.resolve([]),
    locationIds.length
      ? db.select().from(locations).where(inArray(locations.id, locationIds))
      : Promise.resolve([]),
  ]);

  const ownerIds = [...characterIds, ...locationIds];
  const allImages = ownerIds.length
    ? await db
        .select()
        .from(images)
        .where(inArray(images.ownerId, ownerIds))
        .orderBy(asc(images.position), asc(images.createdAt))
    : [];

  const entityImages = (id: string, kind: "character" | "location", max: number) =>
    allImages
      .filter((image) => image.ownerKind === kind && image.ownerId === id)
      .slice(0, max)
      .map((image) => ({ s3Key: image.s3Key, mimeType: image.mimeType }));

  return {
    story: {
      id: story.id,
      name: story.name,
      description: story.description,
      lengthSeconds: args.lengthSeconds ?? 0,
      lyrics: args.lyrics?.trim() || null,
    },
    world: {
      name: world.name,
      artStyle: world.artStyle,
      description: world.description,
    },
    characters: characterRows.map((character) => ({
      name: character.name,
      description: character.description,
      images: entityImages(character.id, "character", MAX_IMAGES_PER_CHARACTER),
    })),
    locations: locationRows.map((location) => ({
      name: location.name,
      description: location.description,
      images: entityImages(location.id, "location", MAX_IMAGES_PER_LOCATION),
    })),
  };
}

/** Format seconds as mm:ss */
function toTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Build a timestamp-based song structure scaffold so Lyria understands the
 * required duration from the structure itself, not just a text hint.
 * Sections are proportional to the requested length.
 */
function buildSongTimeline(totalSeconds: number): string {
  // Proportional section layout: intro 10%, verse1 20%, chorus 20%,
  // verse2 20%, chorus2 20%, outro 10% — clamped to integer seconds.
  const proportions: Array<{ name: string; weight: number }> = [
    { name: "Intro", weight: 0.1 },
    { name: "Verse 1", weight: 0.2 },
    { name: "Chorus", weight: 0.2 },
    { name: "Verse 2", weight: 0.2 },
    { name: "Chorus", weight: 0.2 },
    { name: "Outro", weight: 0.1 },
  ];

  const lines: string[] = [];
  let cursor = 0;
  for (const section of proportions) {
    const dur = Math.round(section.weight * totalSeconds);
    const start = cursor;
    const end = Math.min(cursor + dur, totalSeconds);
    lines.push(`[${toTimestamp(start)} - ${toTimestamp(end)}] ${section.name}`);
    cursor = end;
    if (cursor >= totalSeconds) break;
  }
  return lines.join("\n");
}

async function buildSongMessages(ctx: SongContext): Promise<ChatMessage[]> {
  const durationMmSs = toTimestamp(ctx.story.lengthSeconds);
  const system = [
    "You compose complete songs for AI music videos.",
    `Generate a polished full song as MP3 audio. The song MUST be exactly ${ctx.story.lengthSeconds} seconds long (${durationMmSs}). Do not cut short or exceed this duration.`,
    "Use the provided world, story, characters, locations, and lyrics if present.",
    "Do not mimic a named real artist. Use descriptive musical traits instead.",
    "Follow the provided song timeline structure precisely — each section occupies the stated time range.",
  ].join("\n");

  const parts: ChatPart[] = [
    {
      type: "text",
      text: [
        `# WORLD: ${ctx.world.name}`,
        `Visual/music style: ${ctx.world.artStyle}`,
        ctx.world.description,
        "",
        `# STORY: ${ctx.story.name}`,
        `Required duration: ${ctx.story.lengthSeconds} seconds (${durationMmSs}) — this is a hard requirement.`,
        ctx.story.description,
        "",
        "# SONG TIMELINE",
        `Total length: ${durationMmSs}`,
        buildSongTimeline(ctx.story.lengthSeconds),
        "",
        "# LYRICS",
        ctx.story.lyrics?.trim() || "No fixed lyrics. Compose fitting original lyrics that fill the full timeline above.",
      ].join("\n"),
    },
  ];

  if (ctx.characters.length) {
    parts.push({
      type: "text",
      text: [
        "# CHARACTERS",
        ...ctx.characters.flatMap((character) => [
          `## ${character.name}`,
          character.description,
          "",
        ]),
      ].join("\n"),
    });
    for (const character of ctx.characters) {
      for (const image of character.images) {
        const url = await imageToDataUrl(image);
        if (!url) continue;
        parts.push({ type: "text", text: `Reference image for ${character.name}:` });
        parts.push({ type: "image_url", image_url: { url } });
      }
    }
  }

  if (ctx.locations.length) {
    parts.push({
      type: "text",
      text: [
        "# LOCATIONS",
        ...ctx.locations.flatMap((location) => [
          `## ${location.name}`,
          location.description,
          "",
        ]),
      ].join("\n"),
    });
    for (const location of ctx.locations) {
      for (const image of location.images) {
        const url = await imageToDataUrl(image);
        if (!url) continue;
        parts.push({ type: "text", text: `Reference image for ${location.name}:` });
        parts.push({ type: "image_url", image_url: { url } });
      }
    }
  }

  parts.push({
    type: "text",
    text: `Create the complete song audio now. The final audio MUST be exactly ${ctx.story.lengthSeconds} seconds (${durationMmSs}) as specified in the timeline above.`,
  });

  return [
    { role: "system", content: system },
    { role: "user", content: parts },
  ];
}

export function serializePromptForStorage(messages: ChatMessage[]): string {
  const safe = messages.map((message) => {
    if (message.role === "user" && Array.isArray(message.content)) {
      return {
        role: message.role,
        content: message.content.map((part) => {
          if (part.type === "image_url") {
            return { type: "image_url", image_url: { url: "[image elided]" } };
          }
          if (part.type === "input_audio") {
            return {
              type: "input_audio",
              input_audio: { data: "[audio elided]", format: part.input_audio.format },
            };
          }
          return part;
        }),
      };
    }
    return message;
  });
  return JSON.stringify(safe, null, 2);
}
