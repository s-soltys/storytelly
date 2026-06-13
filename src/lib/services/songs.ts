import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storySongs } from "@/db/schema";
import { presignedGetUrl, deleteObject } from "@/lib/storage";

async function storyExists(worldId: string, storyId: string) {
  const [story] = await db
    .select({ id: stories.id })
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)));
  return Boolean(story);
}

async function enrichSong(song: typeof storySongs.$inferSelect) {
  return {
    ...song,
    url: await presignedGetUrl(song.s3Key),
  };
}

export async function getSongs(worldId: string, storyId: string) {
  if (!(await storyExists(worldId, storyId))) return null;
  const rows = await db
    .select()
    .from(storySongs)
    .where(eq(storySongs.storyId, storyId))
    .orderBy(storySongs.createdAt);
  return Promise.all(rows.map(enrichSong));
}

export async function getSongById(worldId: string, storyId: string, songId: string) {
  if (!(await storyExists(worldId, storyId))) return null;
  const [row] = await db
    .select()
    .from(storySongs)
    .where(and(eq(storySongs.id, songId), eq(storySongs.storyId, storyId)));
  if (!row) return null;
  return enrichSong(row);
}

export async function updateSong(worldId: string, storyId: string, songId: string, data: Record<string, unknown>) {
  if (!(await storyExists(worldId, storyId))) return null;
  const [row] = await db
    .update(storySongs)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(storySongs.id, songId), eq(storySongs.storyId, storyId)))
    .returning();
  if (!row) return null;
  return enrichSong(row);
}

export async function deleteSong(worldId: string, storyId: string, songId: string) {
  if (!(await storyExists(worldId, storyId))) return false;
  const [row] = await db
    .delete(storySongs)
    .where(and(eq(storySongs.id, songId), eq(storySongs.storyId, storyId)))
    .returning({ s3Key: storySongs.s3Key });
  if (!row) return false;
  await deleteObject(row.s3Key).catch(() => {});
  return true;
}

export async function createSong(data: typeof storySongs.$inferInsert) {
  const [row] = await db.insert(storySongs).values(data).returning();
  return enrichSong(row);
}
