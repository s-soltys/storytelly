import { NextResponse } from "next/server";
import { analyzeSong } from "@/lib/ai/analyze";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ worldId: string; storyId: string; songId: string }> },
) {
  try {
    const { worldId, storyId, songId } = await params;
    await analyzeSong({ worldId, storyId, songId });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Analysis error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to analyze song" },
      { status: err.status || 500 },
    );
  }
}
