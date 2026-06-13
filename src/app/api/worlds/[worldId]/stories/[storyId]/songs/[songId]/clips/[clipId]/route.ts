import { db } from "@/db/client";
import { videos } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { deleteObject } from "@/lib/storage";
import { jsonError } from "@/lib/server";
import { updateClip, deleteClip } from "@/lib/services/clips";

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
  const { worldId, storyId, songId, clipId } = await params;

  try {
    const body = await request.json();
    const { description } = body;

    if (!description) {
      return jsonError(400, "Missing description");
    }

    const updated = await updateClip(worldId, storyId, songId, clipId, { description });
    if (!updated) return jsonError(404, "Clip not found");

    return Response.json(updated);
  } catch (error) {
    console.error("Failed to update clip:", error);
    return jsonError(500, "Failed to update clip");
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
  const { worldId, storyId, songId, clipId } = await params;

  try {
    const clipVideos = await db
      .select()
      .from(videos)
      .where(and(eq(videos.ownerKind, "song_clip"), eq(videos.ownerId, clipId)));

    if (clipVideos.length > 0) {
      await db
        .delete(videos)
        .where(and(eq(videos.ownerKind, "song_clip"), eq(videos.ownerId, clipId)));
    }

    const deleted = await deleteClip(worldId, storyId, songId, clipId);
    if (!deleted) return jsonError(404, "Clip not found");

    await Promise.all(
      clipVideos.map((video) =>
        deleteObject(video.s3Key).catch((error) => {
          console.error("Failed to delete clip video object:", error);
        }),
      ),
    );

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete clip:", error);
    return jsonError(500, "Failed to delete clip");
  }
}
