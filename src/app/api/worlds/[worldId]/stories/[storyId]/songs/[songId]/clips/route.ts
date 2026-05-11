import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { songClips, images, videos } from "@/db/schema";
import { eq, asc, inArray, and, max } from "drizzle-orm";
import { presignedGetUrl } from "@/lib/storage";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ worldId: string; storyId: string; songId: string }>;
  },
) {
  const { songId } = await params;

  try {
    const clips = await db
      .select()
      .from(songClips)
      .where(eq(songClips.songId, songId))
      .orderBy(asc(songClips.sectionIndex), asc(songClips.position));

    const clipIds = clips.map(c => c.id);
    let allImages: typeof images.$inferSelect[] = [];
    let allVideos: typeof videos.$inferSelect[] = [];

    if (clipIds.length > 0) {
      allImages = await db
        .select()
        .from(images)
        .where(
          inArray(images.ownerId, clipIds)
        );

      allVideos = await db
        .select()
        .from(videos)
        .where(
          inArray(videos.ownerId, clipIds)
        );
    }

    const clipsWithMedia = await Promise.all(clips.map(async (clip) => {
      const clipImages = allImages
        .filter(img => img.ownerId === clip.id && img.ownerKind === 'song_clip')
        .sort((a, b) => b.position - a.position);

      const hydratedImages = await Promise.all(clipImages.map(async (img) => ({
        ...img,
        url: await presignedGetUrl(img.s3Key),
      })));

      const clipVideos = allVideos
        .filter(vid => vid.ownerId === clip.id && vid.ownerKind === 'song_clip')
        .sort((a, b) => b.position - a.position);

      const hydratedVideos = await Promise.all(clipVideos.map(async (vid) => ({
        ...vid,
        url: await presignedGetUrl(vid.s3Key),
      })));

      return {
        ...clip,
        images: hydratedImages,
        videos: hydratedVideos,
      };
    }));

    return NextResponse.json(clipsWithMedia);
  } catch (error) {
    console.error("Failed to fetch song clips:", error);
    return NextResponse.json(
      { error: "Failed to fetch song clips" },
      { status: 500 },
    );
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
      return NextResponse.json({ error: "Missing sectionIndex or description" }, { status: 400 });
    }

    const [{ value: maxPos }] = await db
      .select({ value: max(songClips.position) })
      .from(songClips)
      .where(and(eq(songClips.songId, songId), eq(songClips.sectionIndex, sectionIndex)));
      
    const position = (maxPos ?? -1) + 1;

    const [newClip] = await db
      .insert(songClips)
      .values({
        songId,
        sectionIndex,
        description,
        position,
      })
      .returning();

    return NextResponse.json(newClip, { status: 201 });
  } catch (error) {
    console.error("Failed to create song clip:", error);
    return NextResponse.json(
      { error: "Failed to create song clip" },
      { status: 500 },
    );
  }
}
