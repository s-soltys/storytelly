import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { storySongs } from "@/db/schema";
import { generateStorySong } from "@/lib/ai/song";
import { GenerationError } from "@/lib/ai/songScript";
import { OpenRouterError } from "@/lib/ai/openrouter";
import { presignedGetUrl } from "@/lib/storage";
import { songGenerateSchema } from "@/lib/validation";
import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ worldId: string; storyId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = songGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  try {
    const { id } = await generateStorySong({
      worldId,
      storyId,
      lengthSeconds: parsed.data.lengthSeconds,
      lyrics: parsed.data.lyrics,
    });
    const [row] = await db.select().from(storySongs).where(eq(storySongs.id, id));
    return Response.json(
      {
        ...row,
        url: await presignedGetUrl(row.s3Key),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof GenerationError) {
      return jsonError(err.status, err.message, err.details);
    }
    if (err instanceof OpenRouterError) {
      return jsonError(502, err.message, { providerStatus: err.status });
    }
    console.error("song generation failed", err);
    return jsonError(
      500,
      err instanceof Error ? err.message : "Song generation failed",
    );
  }
}
