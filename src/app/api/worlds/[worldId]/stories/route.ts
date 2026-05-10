import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  characters,
  locations,
  stories,
  storyCharacters,
  storyLocations,
  worlds,
} from "@/db/schema";
import { storyCreateSchema } from "@/lib/validation";
import { jsonError, loadImages } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ worldId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const rows = await db
    .select()
    .from(stories)
    .where(eq(stories.worldId, worldId))
    .orderBy(desc(stories.createdAt));
  return Response.json(
    await Promise.all(
      rows.map(async (s) => ({
        ...s,
        moodImages: await loadImages("story_mood", s.id),
      })),
    ),
  );
}

export async function POST(req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const [world] = await db.select().from(worlds).where(eq(worlds.id, worldId));
  if (!world) return jsonError(404, "World not found");

  const body = await req.json().catch(() => null);
  const parsed = storyCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }
  const { characterIds, locationIds, ...storyFields } = parsed.data;

  const validChars = await db
    .select({ id: characters.id })
    .from(characters)
    .where(
      inArray(characters.id, characterIds.length ? characterIds : ["__none__"]),
    );
  if (validChars.length !== characterIds.length) {
    return jsonError(400, "Some characters do not exist");
  }
  const charsBelong = await db
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.worldId, worldId));
  const allowedCharIds = new Set(charsBelong.map((c) => c.id));
  if (!characterIds.every((id) => allowedCharIds.has(id))) {
    return jsonError(400, "Characters must belong to this world");
  }
  if (locationIds.length) {
    const locsBelong = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.worldId, worldId));
    const allowedLocIds = new Set(locsBelong.map((l) => l.id));
    if (!locationIds.every((id) => allowedLocIds.has(id))) {
      return jsonError(400, "Locations must belong to this world");
    }
  }

  const created = await db.transaction(async (tx) => {
    const [story] = await tx
      .insert(stories)
      .values({ ...storyFields, worldId })
      .returning();
    if (characterIds.length) {
      await tx.insert(storyCharacters).values(
        characterIds.map((characterId) => ({ storyId: story.id, characterId })),
      );
    }
    if (locationIds.length) {
      await tx.insert(storyLocations).values(
        locationIds.map((locationId) => ({ storyId: story.id, locationId })),
      );
    }
    return story;
  });

  return Response.json(created, { status: 201 });
}
