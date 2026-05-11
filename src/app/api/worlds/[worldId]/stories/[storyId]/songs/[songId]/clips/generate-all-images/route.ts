import { NextResponse } from "next/server";
import { generateAllClipImages } from "@/lib/ai/entityImage";

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
    }>;
  },
) {
  const { worldId, storyId, songId } = await params;
  try {
    const count = await generateAllClipImages({ worldId, storyId, songId });
    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("Failed to generate all clip images:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Generation failed" },
      { status: 500 },
    );
  }
}
