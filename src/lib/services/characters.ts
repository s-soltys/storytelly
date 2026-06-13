import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { characters } from "@/db/schema";
import { loadImages } from "@/lib/server";

export async function getCharacters(worldId: string) {
  const rows = await db
    .select()
    .from(characters)
    .where(eq(characters.worldId, worldId))
    .orderBy(asc(characters.name));
  const characterIds = rows.map((c) => c.id);
  const allImages = characterIds.length > 0 ? await loadImages("character", characterIds) : [];
  const imageMap = new Map<string, typeof allImages>();
  for (const img of allImages) {
    if (!imageMap.has(img.ownerId)) imageMap.set(img.ownerId, []);
    imageMap.get(img.ownerId)!.push(img);
  }
  return rows.map((c) => ({ ...c, images: imageMap.get(c.id) || [] }));
}

export async function getCharacterById(worldId: string, characterId: string) {
  const [row] = await db
    .select()
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.worldId, worldId)));
  if (!row) return null;
  const images = await loadImages("character", row.id);
  return { ...row, images };
}

export async function createCharacter(worldId: string, data: { name: string; description: string }) {
  const [row] = await db
    .insert(characters)
    .values({ worldId, ...data })
    .returning();
  return row;
}

export async function updateCharacter(worldId: string, characterId: string, data: { description?: string }) {
  const [row] = await db
    .update(characters)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(characters.id, characterId), eq(characters.worldId, worldId)))
    .returning();
  return row ?? null;
}

export async function deleteCharacter(worldId: string, characterId: string) {
  const [row] = await db
    .delete(characters)
    .where(and(eq(characters.id, characterId), eq(characters.worldId, worldId)))
    .returning({ id: characters.id });
  return Boolean(row);
}
