import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { songClips, storySongs, stories } from "@/db/schema";
import { loadImages } from "@/lib/server";

async function songExists(worldId: string, storyId: string, songId: string) {
  const [song] = await db
    .select({ id: storySongs.id })
    .from(storySongs)
    .innerJoin(stories, eq(stories.id, storySongs.storyId))
    .where(and(
      eq(storySongs.id, songId),
      eq(storySongs.storyId, storyId),
      eq(stories.worldId, worldId),
    ));
  return Boolean(song);
}

export async function getClips(worldId: string, storyId: string, songId: string) {
  if (!(await songExists(worldId, storyId, songId))) return null;
  const rows = await db
    .select()
    .from(songClips)
    .where(eq(songClips.songId, songId))
    .orderBy(songClips.sectionIndex, songClips.position);
  const clipIds = rows.map((c) => c.id);
  const allImages = clipIds.length > 0 ? await loadImages("song_clip", clipIds) : [];
  const imageMap = new Map<string, typeof allImages>();
  for (const img of allImages) {
    if (!imageMap.has(img.ownerId)) imageMap.set(img.ownerId, []);
    imageMap.get(img.ownerId)!.push(img);
  }
  return rows.map((c) => ({ ...c, images: imageMap.get(c.id) || [] }));
}

export async function getClipById(worldId: string, storyId: string, songId: string, clipId: string) {
  if (!(await songExists(worldId, storyId, songId))) return null;
  const [row] = await db
    .select()
    .from(songClips)
    .where(and(eq(songClips.id, clipId), eq(songClips.songId, songId)));
  if (!row) return null;
  const images = await loadImages("song_clip", row.id);
  return { ...row, images };
}

export async function createClip(data: typeof songClips.$inferInsert) {
  const [row] = await db.insert(songClips).values(data).returning();
  return row;
}

export async function updateClip(worldId: string, storyId: string, songId: string, clipId: string, data: Record<string, unknown>) {
  if (!(await songExists(worldId, storyId, songId))) return null;
  const [row] = await db
    .update(songClips)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(songClips.id, clipId), eq(songClips.songId, songId)))
    .returning();
  return row ?? null;
}

export async function deleteClip(worldId: string, storyId: string, songId: string, clipId: string) {
  if (!(await songExists(worldId, storyId, songId))) return false;
  const [row] = await db
    .delete(songClips)
    .where(and(eq(songClips.id, clipId), eq(songClips.songId, songId)))
    .returning({ id: songClips.id });
  return Boolean(row);
}
