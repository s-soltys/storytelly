import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { locations } from "@/db/schema";
import { loadImages } from "@/lib/server";

export async function getLocations(worldId: string) {
  const rows = await db
    .select()
    .from(locations)
    .where(eq(locations.worldId, worldId))
    .orderBy(asc(locations.name));
  const locationIds = rows.map((l) => l.id);
  const allImages = locationIds.length > 0 ? await loadImages("location", locationIds) : [];
  const imageMap = new Map<string, typeof allImages>();
  for (const img of allImages) {
    if (!imageMap.has(img.ownerId)) imageMap.set(img.ownerId, []);
    imageMap.get(img.ownerId)!.push(img);
  }
  return rows.map((l) => ({ ...l, images: imageMap.get(l.id) || [] }));
}

export async function getLocationById(worldId: string, locationId: string) {
  const [row] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.worldId, worldId)));
  if (!row) return null;
  const images = await loadImages("location", row.id);
  return { ...row, images };
}

export async function createLocation(worldId: string, data: { name: string; description: string }) {
  const [row] = await db
    .insert(locations)
    .values({ worldId, ...data })
    .returning();
  return row;
}

export async function updateLocation(worldId: string, locationId: string, data: { description?: string }) {
  const [row] = await db
    .update(locations)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(locations.id, locationId), eq(locations.worldId, worldId)))
    .returning();
  return row ?? null;
}

export async function deleteLocation(worldId: string, locationId: string) {
  const [row] = await db
    .delete(locations)
    .where(and(eq(locations.id, locationId), eq(locations.worldId, worldId)))
    .returning({ id: locations.id });
  return Boolean(row);
}
