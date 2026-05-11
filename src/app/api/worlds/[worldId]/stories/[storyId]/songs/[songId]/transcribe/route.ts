import { NextResponse } from "next/server";
import { transcribeSong } from "@/lib/ai/analyze";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ worldId: string; storyId: string; songId: string }> },
) {
  try {
    const { worldId, storyId, songId } = await params;
    await transcribeSong({ worldId, storyId, songId });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Transcription error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to transcribe song" },
      { status: err.status || 500 },
    );
  }
}
