import { generateClipVideo } from "@/lib/ai/entityImage";
import { GenerationError } from "@/lib/ai/songScript";
import { jsonError } from "@/lib/server";
import { presignedGetUrl } from "@/lib/storage";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      worldId: string;
      storyId: string;
      songId: string;
      clipId: string;
    }>;
  },
) {
  const { worldId, storyId, songId, clipId } = await params;

  try {
    const video = await generateClipVideo({ worldId, storyId, songId, clipId });
    return Response.json(
      {
        ...video,
        url: await presignedGetUrl(video.s3Key),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to generate clip video:", error);
    if (error instanceof GenerationError) {
      return jsonError(error.status, error.message, error.details);
    }
    return jsonError(500, (error as Error).message || "Generation failed");
  }
}
