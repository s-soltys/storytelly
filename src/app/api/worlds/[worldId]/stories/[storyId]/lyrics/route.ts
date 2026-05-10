import { generateLyrics, GenerationError } from "@/lib/ai/songScript";
import { OpenRouterError } from "@/lib/ai/openrouter";
import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ worldId: string; storyId: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  try {
    const result = await generateLyrics({ worldId, storyId });
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
