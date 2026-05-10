import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storyScripts } from "@/db/schema";
import {
  GenerationError,
  generateSongScript,
} from "@/lib/ai/songScript";
import { OpenRouterError } from "@/lib/ai/openrouter";
import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ worldId: string; storyId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const [story] = await db
    .select({ id: stories.id })
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)));
  if (!story) return jsonError(404, "Story not found");

  const rows = await db
    .select()
    .from(storyScripts)
    .where(eq(storyScripts.storyId, storyId))
    .orderBy(desc(storyScripts.createdAt));
  return Response.json(rows);
}

export async function POST(_req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  try {
    const { id } = await generateSongScript({ worldId, storyId });
    const [row] = await db
      .select()
      .from(storyScripts)
      .where(eq(storyScripts.id, id));
    return Response.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof GenerationError) {
      return jsonError(err.status, err.message, err.details);
    }
    if (err instanceof OpenRouterError) {
      return jsonError(502, err.message, { providerStatus: err.status });
    }
    console.error("song-script generation failed", err);
    return jsonError(
      500,
      err instanceof Error ? err.message : "Generation failed",
    );
  }
}
