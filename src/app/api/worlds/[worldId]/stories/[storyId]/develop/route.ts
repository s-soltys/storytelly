import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { stories, worlds, settings as settingsTable } from "@/db/schema";
import { generateLyrics, GenerationError } from "@/lib/ai/songScript";
import { OpenRouterError } from "@/lib/ai/openrouter";
import { jsonError } from "@/lib/server";
import { STORY_LENGTHS } from "@/lib/validation";
import type { DevelopResponse, ConversationPhase } from "@/components/story/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ worldId: string; storyId: string }> };

const developSchema = z.object({
  message: z.string().trim().min(1),
  phase: z.enum(["foundation", "lyrics", "refine"]),
  currentState: z.object({
    characterIds: z.array(z.string().uuid()).default([]),
    locationIds: z.array(z.string().uuid()).default([]),
    lengthSeconds: z.number().int().default(60),
    description: z.string().default(""),
    lyrics: z.string().default(""),
  }),
});

export async function POST(req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = developSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const { message, phase, currentState } = parsed.data;

  // Load story + world for context
  const [story] = await db
    .select()
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)));
  if (!story) return jsonError(404, "Story not found");

  const [world] = await db.select().from(worlds).where(eq(worlds.id, worldId));
  if (!world) return jsonError(404, "World not found");

  // Check API key availability for AI calls
  const [config] = await db.select().from(settingsTable).limit(1);
  const apiKeyConfigured = Boolean(config?.openrouterApiKey?.trim());

  // ─── Foundation phase ─────────────────────────────────────────────────────
  // Parse structured data from user's free-text message.
  // We don't make an AI call here — we use deterministic parsing + stored context.
  if (phase === "foundation") {
    return handleFoundation({ message, currentState, story, world, apiKeyConfigured });
  }

  // ─── Lyrics phase ─────────────────────────────────────────────────────────
  // User is selecting a length and requesting a first lyrics draft.
  if (phase === "lyrics") {
    if (!apiKeyConfigured) {
      return jsonError(400, "OpenRouter API key is not configured. Add one in settings.");
    }
    const parsedLength = parseInt(message.replace(/[^0-9]/g, ""), 10);
    const lengthSeconds = STORY_LENGTHS.includes(parsedLength)
      ? parsedLength
      : currentState.lengthSeconds;

    try {
      const result = await generateLyrics({ worldId, storyId, lengthSeconds });
      const response: DevelopResponse = {
        reply:
          `Here's a first draft for ${lengthSeconds}s. Read through it — then tell me anything you'd like to change, or just say "looks good" to move on.`,
        lyrics: result.lyrics,
        storyUpdates: { lengthSeconds },
        nextPhase: "refine",
      };
      return Response.json(response, { status: 200 });
    } catch (err) {
      return handleAiError(err);
    }
  }

  // ─── Refine phase ─────────────────────────────────────────────────────────
  // Free-form chat: each message is sent as instructions to the lyrics revision AI.
  if (!apiKeyConfigured) {
    return jsonError(400, "OpenRouter API key is not configured. Add one in settings.");
  }

  // Detect "no more changes" intent — skip AI call, respond encouragingly
  const donePatterns = /^(looks? good|done|perfect|great|that'?s? it|generate( the)? song|ready)/i;
  if (donePatterns.test(message.trim())) {
    const response: DevelopResponse = {
      reply:
        "Great! Your lyrics are locked in. Use the Songs panel below to generate the audio — or keep refining anytime.",
      nextPhase: "refine",
    };
    return Response.json(response, { status: 200 });
  }

  try {
    const result = await generateLyrics({
      worldId,
      storyId,
      lengthSeconds: currentState.lengthSeconds,
      instructions: message,
    });
    const response: DevelopResponse = {
      reply: "Updated. Take a look — anything else you'd like to adjust?",
      lyrics: result.lyrics,
      nextPhase: "refine",
    };
    return Response.json(response, { status: 200 });
  } catch (err) {
    return handleAiError(err);
  }
}

// ─── Foundation handler (no AI call) ─────────────────────────────────────────
function handleFoundation(args: {
  message: string;
  currentState: z.infer<typeof developSchema>["currentState"];
  story: { name: string; description: string };
  world: { name: string; artStyle: string };
  apiKeyConfigured: boolean;
}): Response {
  const { message, currentState, story, world, apiKeyConfigured } = args;
  const trimmed = message.trim();

  // Determine what's still missing to build a complete brief.
  const hasDescription = currentState.description.trim().length > 10;
  const hasCharacters = currentState.characterIds.length > 0;

  // If the user answered a mood/theme question — merge into description.
  if (!hasDescription) {
    const newDesc = trimmed;
    const response: DevelopResponse = {
      reply: hasCharacters
        ? `Got it — "${newDesc.slice(0, 80)}${newDesc.length > 80 ? "…" : ""}". Now, what length would you like for the song?`
        : `Got it. I've noted the story direction. When you're ready, pick a song length to generate your first lyrics draft.`,
      storyUpdates: {
        description: newDesc,
      },
      nextPhase: hasCharacters ? "lyrics" : "foundation",
      chips: hasCharacters
        ? STORY_LENGTHS.map((s) => ({ id: String(s), label: `${s}s` }))
        : [],
    };
    return Response.json(response, { status: 200 });
  }

  // Story has enough context — move to lyrics phase.
  const response: DevelopResponse = {
    reply: apiKeyConfigured
      ? `Thanks! I have everything I need about "${story.name}" in the world of "${world.name}". What length do you want the song to be?`
      : `Thanks! When you've added an OpenRouter API key in Settings, I'll be able to generate lyrics for you.`,
    nextPhase: "lyrics",
    chips: apiKeyConfigured
      ? STORY_LENGTHS.map((s) => ({ id: String(s), label: `${s}s` }))
      : [],
  };
  return Response.json(response, { status: 200 });
}

function handleAiError(err: unknown): Response {
  if (err instanceof GenerationError) {
    return jsonError(err.status, err.message, err.details);
  }
  if (err instanceof OpenRouterError) {
    return jsonError(502, err.message, { providerStatus: err.status });
  }
  console.error("develop endpoint error", err);
  return jsonError(500, err instanceof Error ? err.message : "Generation failed");
}
