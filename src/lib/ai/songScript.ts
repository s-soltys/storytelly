import { and, eq, inArray, asc } from "drizzle-orm";
import { db } from "@/db/client";
import {
  characters,
  images,
  locations,
  settings as settingsTable,
  stories,
  storyCharacters,
  storyLocations,
  worlds,
  aiCalls,
} from "@/db/schema";
import { callOpenRouter, type ChatMessage, type ChatPart } from "./openrouter";
import { imageToDataUrl } from "./images";
import { getModelForTask } from "./tasks";
import { serializePromptForStorage } from "./song";

const MAX_IMAGES_PER_CHARACTER = 3;
const MAX_IMAGES_PER_LOCATION = 1;

export type GenerationContext = {
  story: {
    id: string;
    name: string;
    description: string;
    lengthSeconds: number;
  };
  world: { name: string; artStyle: string; description: string };
  storyCharacters: Array<{
    name: string;
    description: string;
    images: Array<{ s3Key: string; mimeType: string | null }>;
  }>;
  storyLocations: Array<{
    name: string;
    description: string;
    images: Array<{ s3Key: string; mimeType: string | null }>;
  }>;
};

export class GenerationError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function generateLyrics(args: {
  worldId: string;
  storyId: string;
  lengthSeconds: number;
}): Promise<{ lyrics: string }> {
  const ctx = await loadContext(args);

  const [config] = await db.select().from(settingsTable).limit(1);
  const apiKey = config?.openrouterApiKey?.trim();
  if (!apiKey) {
    throw new GenerationError(
      400,
      "OpenRouter API key is not configured. Add one in settings.",
    );
  }
  const model = getModelForTask("lyrics", config?.taskModels ?? {});

  const messages = await buildLyricsMessages(ctx);

  const start = Date.now();
  const result = await callOpenRouter({ apiKey, model, messages });
  const durationMs = Date.now() - start;

  // Log the call
  await db.insert(aiCalls).values({
    worldId: args.worldId,
    storyId: args.storyId,
    task: "lyrics",
    model,
    prompt: serializePromptForStorage(messages),
    response: result.text,
    costUsd: result.usage.costUsd != null ? result.usage.costUsd.toString() : null,
    durationMs,
  });

  return { lyrics: result.text };
}

async function loadContext(args: {
  worldId: string;
  storyId: string;
  lengthSeconds: number;
}): Promise<GenerationContext> {
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

  const charLinks = await db
    .select({ characterId: storyCharacters.characterId })
    .from(storyCharacters)
    .where(eq(storyCharacters.storyId, story.id));
  const characterIds = charLinks.map((l) => l.characterId);

  const locLinks = await db
    .select({ locationId: storyLocations.locationId })
    .from(storyLocations)
    .where(eq(storyLocations.storyId, story.id));
  const locationIds = locLinks.map((l) => l.locationId);

  const [characterRows, locationRows] = await Promise.all([
    characterIds.length
      ? db
          .select()
          .from(characters)
          .where(inArray(characters.id, characterIds))
      : Promise.resolve([]),
    locationIds.length
      ? db.select().from(locations).where(inArray(locations.id, locationIds))
      : Promise.resolve([]),
  ]);

  const allOwnerIds = [...characterIds, ...locationIds];
  const allImages = allOwnerIds.length
    ? await db
        .select()
        .from(images)
        .where(inArray(images.ownerId, allOwnerIds))
        .orderBy(asc(images.position), asc(images.createdAt))
    : [];

  const charImages = (id: string, max: number) =>
    allImages
      .filter((i) => i.ownerKind === "character" && i.ownerId === id)
      .slice(0, max)
      .map((i) => ({ s3Key: i.s3Key, mimeType: i.mimeType }));
  const locImages = (id: string, max: number) =>
    allImages
      .filter((i) => i.ownerKind === "location" && i.ownerId === id)
      .slice(0, max)
      .map((i) => ({ s3Key: i.s3Key, mimeType: i.mimeType }));

  return {
    story: {
      id: story.id,
      name: story.name,
      description: story.description,
      lengthSeconds: args.lengthSeconds,
    },
    world: {
      name: world.name,
      artStyle: world.artStyle,
      description: world.description,
    },
    storyCharacters: characterRows.map((c) => ({
      name: c.name,
      description: c.description,
      images: charImages(c.id, MAX_IMAGES_PER_CHARACTER),
    })),
    storyLocations: locationRows.map((l) => ({
      name: l.name,
      description: l.description,
      images: locImages(l.id, MAX_IMAGES_PER_LOCATION),
    })),
  };
}

export async function buildLyricsMessages(
  ctx: GenerationContext,
): Promise<ChatMessage[]> {
  const system = [
    "You are a lyricist writing lyrics for a short AI-generated music video.",
    "Output lyrics only. Do NOT add prose commentary, explanations, or markdown fences.",
    "Format rules:",
    "- Use compact song sections like [Verse], [Pre-Chorus], [Chorus], [Bridge], or [Outro] where useful.",
    "- Keep stage directions sparse; lyrics should be singable, not a screenplay.",
    "- Let named characters, locations, and world details influence imagery and voice.",
    "- Pace the lyrics for the requested song length.",
    "- Keep the emotional tone consistent with the world's art style and the story.",
  ].join("\n");

  const userParts: ChatPart[] = [];

  userParts.push({
    type: "text",
    text: [
      `# WORLD: ${ctx.world.name}`,
      `Art style: ${ctx.world.artStyle}`,
      "",
      ctx.world.description,
    ].join("\n"),
  });

  if (ctx.storyLocations.length) {
    const lines = ["# LOCATIONS"];
    for (const loc of ctx.storyLocations) {
      lines.push(`## ${loc.name}`, loc.description, "");
    }
    userParts.push({ type: "text", text: lines.join("\n") });

    for (const loc of ctx.storyLocations) {
      for (const img of loc.images) {
        const url = await imageToDataUrl(img);
        if (url) {
          userParts.push({
            type: "text",
            text: `Reference image for location "${loc.name}":`,
          });
          userParts.push({ type: "image_url", image_url: { url } });
        }
      }
    }
  }

  if (ctx.storyCharacters.length) {
    userParts.push({
      type: "text",
      text: `# CHARACTERS (${ctx.storyCharacters.length})`,
    });
    for (const ch of ctx.storyCharacters) {
      userParts.push({
        type: "text",
        text: `## ${ch.name}\n${ch.description}`,
      });
      for (const img of ch.images) {
        const url = await imageToDataUrl(img);
        if (url) {
          userParts.push({
            type: "text",
            text: `Reference image for ${ch.name}:`,
          });
          userParts.push({ type: "image_url", image_url: { url } });
        }
      }
    }
  }

  userParts.push({
    type: "text",
    text: [
      "# STORY BRIEF",
      `Title: ${ctx.story.name}`,
      "",
      ctx.story.description,
      "",
      `Target length: ${ctx.story.lengthSeconds} seconds.`,
    ].join("\n"),
  });

  userParts.push({
    type: "text",
    text: "Write the lyrics now. Output lyrics only.",
  });

  return [
    { role: "system", content: system },
    { role: "user", content: userParts },
  ];
}
