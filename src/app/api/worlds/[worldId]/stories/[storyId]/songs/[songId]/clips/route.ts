import { db } from "@/db/client";
import { songClips, videos } from "@/db/schema";
import { and, eq, inArray, max } from "drizzle-orm";
import { presignedGetUrl } from "@/lib/storage";
import { jsonError } from "@/lib/server";
import { getClips, createClip } from "@/lib/services/clips";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ worldId: string; storyId: string; songId: string }>;
  },
) {
  const { worldId, storyId, songId } = await params;

  try {
    const clips = await getClips(worldId, storyId, songId);
    if (clips === null) return jsonError(404, "Song not found");

    const clipIds = clips.map(c => c.id);
    let allVideos: typeof videos.$inferSelect[] = [];

    if (clipIds.length > 0) {
      allVideos = await db
        .select()
        .from(videos)
        .where(inArray(videos.ownerId, clipIds));
    }

    const clipsWithMedia = await Promise.all(clips.map(async (clip) => {
      const clipVideos = allVideos
        .filter(vid => vid.ownerId === clip.id && vid.ownerKind === 'song_clip')
        .sort((a, b) => b.position - a.position);

      const hydratedVideos = await Promise.all(clipVideos.map(async (vid) => ({
        ...vid,
        url: await presignedGetUrl(vid.s3Key),
      })));

      return {
        ...clip,
        videos: hydratedVideos,
      };
    }));

    return Response.json(clipsWithMedia);
  } catch (error) {
    console.error("Failed to fetch song clips:", error);
    return jsonError(500, "Failed to fetch song clips");
  }
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ worldId: string; storyId: string; songId: string }>;
  },
) {
  const { songId } = await params;
  
  try {
    const body = await request.json();
    const { sectionIndex, description } = body;
    
    if (sectionIndex === undefined || !description) {
      return jsonError(400, "Missing sectionIndex or description");
    }

    const [{ value: maxPos }] = await db
      .select({ value: max(songClips.position) })
      .from(songClips)
      .where(and(eq(songClips.songId, songId), eq(songClips.sectionIndex, sectionIndex)));
      
    const position = (maxPos ?? -1) + 1;

    const newClip = await createClip({
      songId,
      sectionIndex,
      description,
      position,
    });

    return Response.json(newClip, { status: 201 });
  } catch (error) {
    console.error("Failed to create song clip:", error);
    return jsonError(500, "Failed to create song clip");
  }
}
