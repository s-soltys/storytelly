import { presignedGetUrl } from "@/lib/storage";
import { generateClipImage, saveAiImage } from "@/lib/ai/entityImage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(
  request: Request,
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
    const imageUrl = await generateClipImage({ worldId, storyId, songId, clipId });
    const row = await saveAiImage(imageUrl, "song_clip", clipId);

    return Response.json({
      ...row,
      url: await presignedGetUrl(row.s3Key),
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to generate clip image:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Generation failed" },
      { status: 500 },
    );
  }
}

