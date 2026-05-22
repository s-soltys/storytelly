import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storyLyricsVersions } from "@/db/schema";
import { generateLyrics, GenerationError } from "@/lib/ai/songScript";
import { OpenRouterError } from "@/lib/ai/openrouter";
import { jsonError } from "@/lib/server";
import { songGenerateSchema } from "@/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ worldId: string; storyId: string }> };

const lyricsPostSchema = z.object({
  lengthSeconds: songGenerateSchema.shape.lengthSeconds,
  instructions: z.string().trim().optional(),
});

export async function POST(req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = lyricsPostSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const { lengthSeconds, instructions } = parsed.data;

  const [story] = await db
    .select()
    .from(stories)
    .where(eq(stories.id, storyId));
  if (!story) {
    return jsonError(404, "Story not found");
  }

  try {
    const result = await generateLyrics({
      worldId,
      storyId,
      lengthSeconds: lengthSeconds ?? story.lengthSeconds,
      instructions,
    });

    const isRegenerating = Boolean(story.lyrics && story.lyrics.trim());
    const promptText = instructions?.trim() || (isRegenerating ? "Re-generate lyrics" : "Generate lyrics");

    await db.transaction(async (tx) => {
      await tx
        .update(stories)
        .set({
          lyrics: result.lyrics,
          lengthSeconds: lengthSeconds ?? story.lengthSeconds,
          updatedAt: new Date(),
        })
        .where(eq(stories.id, storyId));

      await tx.insert(storyLyricsVersions).values({
        storyId,
        lyrics: result.lyrics,
        prompt: promptText,
      });
    });

    return Response.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof GenerationError) {
      return jsonError(err.status, err.message, err.details);
    }
    if (err instanceof OpenRouterError) {
      return jsonError(502, err.message, { providerStatus: err.status });
    }
    console.error("lyrics generation failed", err);
    return jsonError(
      500,
      err instanceof Error ? err.message : "Generation failed",
    );
  }
}
