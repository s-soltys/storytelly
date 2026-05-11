import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { songClips, videos } from "@/db/schema";
import { deleteObject } from "@/lib/storage";
import { eq, and } from "drizzle-orm";

export async function PATCH(
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
  const { songId, clipId } = await params;

  try {
    const body = await request.json();
    const { description } = body;

    if (!description) {
      return NextResponse.json({ error: "Missing description" }, { status: 400 });
    }

    const [updatedClip] = await db
      .update(songClips)
      .set({ description })
      .where(and(eq(songClips.id, clipId), eq(songClips.songId, songId)))
      .returning();

    if (!updatedClip) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    return NextResponse.json(updatedClip);
  } catch (error) {
    console.error("Failed to update clip:", error);
    return NextResponse.json(
      { error: "Failed to update clip" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
  const { songId, clipId } = await params;

  try {
    const [existingClip] = await db
      .select({ id: songClips.id })
      .from(songClips)
      .where(and(eq(songClips.id, clipId), eq(songClips.songId, songId)));

    if (!existingClip) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    const clipVideos = await db
      .select()
      .from(videos)
      .where(and(eq(videos.ownerKind, "song_clip"), eq(videos.ownerId, clipId)));

    if (clipVideos.length > 0) {
      await db
        .delete(videos)
        .where(and(eq(videos.ownerKind, "song_clip"), eq(videos.ownerId, clipId)));
    }

    const [deletedClip] = await db
      .delete(songClips)
      .where(and(eq(songClips.id, clipId), eq(songClips.songId, songId)))
      .returning();

    await Promise.all(
      clipVideos.map((video) =>
        deleteObject(video.s3Key).catch((error) => {
          console.error("Failed to delete clip video object:", error);
        }),
      ),
    );

    return NextResponse.json({ success: Boolean(deletedClip) });
  } catch (error) {
    console.error("Failed to delete clip:", error);
    return NextResponse.json(
      { error: "Failed to delete clip" },
      { status: 500 },
    );
  }
}
