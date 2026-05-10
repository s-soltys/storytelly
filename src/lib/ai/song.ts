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
  const result = await callOpenRouterAudio({
    apiKey,
    model,
    messages,
    format: GENERATED_EXT,
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

async function loadSongContext(args: {
  worldId: string;
  storyId: string;
  lengthSeconds: number;
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
      lengthSeconds: args.lengthSeconds,
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

async function buildSongMessages(ctx: SongContext): Promise<ChatMessage[]> {
  const system = [
    "You compose complete songs for AI music videos.",
    "Generate a polished full song as MP3 audio.",
    "Use the provided world, story, characters, locations, and lyrics if present.",
    "Do not mimic a named real artist. Use descriptive musical traits instead.",
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
        `Target length: ${ctx.story.lengthSeconds} seconds`,
        ctx.story.description,
        "",
        "# LYRICS",
        ctx.story.lyrics?.trim() || "No fixed lyrics. Compose fitting original lyrics.",
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
    text: "Create the complete song audio now.",
  });

  return [
    { role: "system", content: system },
    { role: "user", content: parts },
  ];
}

function serializePromptForStorage(messages: ChatMessage[]): string {
  const safe = messages.map((message) => {
    if (message.role === "user" && Array.isArray(message.content)) {
      return {
        role: message.role,
        content: message.content.map((part) =>
          part.type === "image_url"
            ? { type: "image_url", image_url: { url: "[image elided]" } }
            : part,
        ),
      };
    }
    return message;
  });
  return JSON.stringify(safe, null, 2);
}
