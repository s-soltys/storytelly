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
    lyrics: string | null;
  };
  instructions?: string;
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
  lengthSeconds?: number;
  instructions?: string;
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
  lengthSeconds?: number;
  instructions?: string;
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
      lengthSeconds: args.lengthSeconds ?? story.lengthSeconds,
      lyrics: story.lyrics || null,
    },
    instructions: args.instructions,
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
  const isRevision = Boolean(ctx.story.lyrics && ctx.instructions);

  const system = isRevision
    ? [
        "You are a lyricist revising existing song lyrics for an AI-generated music video.",
        "Your PRIMARY focus is the existing lyrics and the revision instructions — follow them precisely.",
        "The world, character, and location details are SUPPORTING background context only; use them for tone and imagery consistency, not as the main driver of changes.",
        "Output revised lyrics only. Do NOT add prose commentary, explanations, or markdown fences.",
        "Format rules (Lyria / AI Song Generator Guidelines):",
        "- Preserve the song structure but ENSURE every section begins with a detailed meta tag.",
        "- Include TIMING and MUSICAL STYLE in every meta tag. Example: [Verse 1: 0:00-0:15, Upbeat Acoustic, Melancholy] or [Chorus: 0:15-0:35, Epic Orchestral, High Energy].",
        "- Keep stage directions sparse; lyrics should be singable.",
        "- Ensure the pacing and timestamps align exactly with the requested song length.",
      ].join("\n")
    : [
        "You are a lyricist writing lyrics for a short AI-generated music video.",
        "Output lyrics only. Do NOT add prose commentary, explanations, or markdown fences.",
        "Format rules (Lyria / AI Song Generator Guidelines):",
        "- Every single section MUST begin with a detailed structural meta tag.",
        "- Include TIMING and MUSICAL STYLE in every meta tag. Example: [Verse 1: 0:00-0:15, Upbeat Acoustic, Melancholy] or [Chorus: 0:15-0:35, Epic Orchestral, High Energy].",
        "- The style descriptors in the tags should evolve with the emotional arc of the story.",
        "- Keep stage directions sparse; lyrics should be singable.",
        "- Let named characters, locations, and world details influence imagery and voice.",
        "- Calculate the pacing carefully so the timestamps sum up exactly to the requested song length.",
      ].join("\n");

  const userParts: ChatPart[] = [];

  userParts.push({
    type: "text",
    text: [
      "--- The following world, story, and character details are SUPPORTING background context only. ---",
      "--- Your primary focus must be the lyrics and the instructions. ---",
      "",
      `# WORLD: ${ctx.world.name}`,
      `Art style: ${ctx.world.artStyle}`,
      "",
      ctx.world.description,
      "",
      `# STORY BRIEF: ${ctx.story.name}`,
      ctx.story.description,
    ].join("\n"),
  });

  if (ctx.storyLocations.length) {
    const lines = ["# LOCATIONS"];
    for (const loc of ctx.storyLocations) {
      lines.push(`## ${loc.name}`, loc.description, "");
    }
    userParts.push({ type: "text", text: lines.join("\n") });
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
    }
  }

  if (ctx.story.lyrics) {
    userParts.push({
      type: "text",
      text: [
        "# EXISTING LYRICS (primary focus)",
        ctx.story.lyrics,
        "",
        "# INSTRUCTIONS (primary focus)",
        ctx.instructions || "Refine the lyrics.",
        "",
        "Apply the instructions to the existing lyrics. Preserve what works; only change what the instructions ask for.",
        `Target length: ${ctx.story.lengthSeconds} seconds.`,
      ].join("\n"),
    });
  } else {
    userParts.push({
      type: "text",
      text: [
        "# INSTRUCTIONS (primary focus)",
        ctx.instructions || "Write the first draft of the lyrics.",
        "",
        `Target length: ${ctx.story.lengthSeconds} seconds.`,
      ].join("\n"),
    });
  }

  userParts.push({
    type: "text",
    text: "Write the lyrics now. Output lyrics only.",
  });

  return [
    { role: "system", content: system },
    { role: "user", content: userParts },
  ];
}
