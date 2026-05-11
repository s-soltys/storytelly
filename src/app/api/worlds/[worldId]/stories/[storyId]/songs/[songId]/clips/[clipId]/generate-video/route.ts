import { db } from "@/db/client";
import { generateClipVideo } from "@/lib/ai/entityImage";
import { presignedGetUrl } from "@/lib/storage";
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
    const video = await generateClipVideo({ worldId, storyId, songId, clipId });
    
    return Response.json({
      ...video,
      url: await presignedGetUrl(video.s3Key),
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to generate clip video:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Generation failed" },
      { status: 500 },
    );
  }
}
