import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { worlds } from "@/db/schema";
import type { NewWorld } from "@/db/schema";
import { loadImages } from "@/lib/server";

export async function getWorlds() {
  const rows = await db.select().from(worlds).orderBy(desc(worlds.createdAt));
  const worldIds = rows.map((w) => w.id);
  const allMoodImages = worldIds.length > 0 ? await loadImages("world_mood", worldIds) : [];
  const imageMap = new Map<string, typeof allMoodImages>();
  for (const img of allMoodImages) {
    if (!imageMap.has(img.ownerId)) imageMap.set(img.ownerId, []);
    imageMap.get(img.ownerId)!.push(img);
  }
  return rows.map((w) => ({ ...w, moodImages: imageMap.get(w.id) || [] }));
}

export async function getWorldById(worldId: string) {
  const [world] = await db.select().from(worlds).where(eq(worlds.id, worldId));
  if (!world) return null;
  const moodImages = await loadImages("world_mood", world.id);
  return { ...world, moodImages };
}

export async function createWorld(data: Omit<NewWorld, "id" | "createdAt" | "updatedAt">) {
  const [created] = await db.insert(worlds).values(data).returning();
  return created;
}

export async function updateWorld(worldId: string, data: Partial<Omit<NewWorld, "id" | "createdAt" | "updatedAt">>) {
  const [updated] = await db
    .update(worlds)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(worlds.id, worldId))
    .returning();
  return updated || null;
}

export async function deleteWorld(worldId: string) {
  const deleted = await db
    .delete(worlds)
    .where(eq(worlds.id, worldId))
    .returning({ id: worlds.id });
  return deleted.length > 0;
}
