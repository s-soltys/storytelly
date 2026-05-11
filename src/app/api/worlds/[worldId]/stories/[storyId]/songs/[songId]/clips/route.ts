import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { songClips, images } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
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
    
    if (clipIds.length > 0) {
      allImages = await db
        .select()
        .from(images)
        .where(
          inArray(images.ownerId, clipIds)
        );
    }

    const clipsWithImages = await Promise.all(clips.map(async (clip) => {
      const clipImages = allImages.filter(img => img.ownerId === clip.id && img.ownerKind === 'song_clip');
      const hydratedImages = await Promise.all(clipImages.map(async (img) => ({
        ...img,
        url: await presignedGetUrl(img.s3Key),
      })));
      return {
        ...clip,
        images: hydratedImages,
      };
    }));

    return NextResponse.json(clipsWithImages);
  } catch (error) {
    console.error("Failed to fetch song clips:", error);
    return NextResponse.json(
      { error: "Failed to fetch song clips" },
      { status: 500 },
    );
  }
}

