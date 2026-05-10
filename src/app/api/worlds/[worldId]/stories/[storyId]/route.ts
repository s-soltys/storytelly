import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storyCharacters, storyLocations } from "@/db/schema";
import { storyUpdateSchema } from "@/lib/validation";
import { jsonError, loadImages } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ worldId: string; storyId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const [story] = await db
    .select()
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)));
  if (!story) return jsonError(404, "Story not found");

  const [chars, locs, moodImages] = await Promise.all([
    db
      .select({ characterId: storyCharacters.characterId })
      .from(storyCharacters)
      .where(eq(storyCharacters.storyId, story.id)),
    db
      .select({ locationId: storyLocations.locationId })
      .from(storyLocations)
      .where(eq(storyLocations.storyId, story.id)),
    loadImages("story_mood", story.id),
  ]);

  return Response.json({
    ...story,
    characterIds: chars.map((c) => c.characterId),
    locationIds: locs.map((l) => l.locationId),
    moodImages,
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = storyUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }
  const { characterIds, locationIds, ...storyFields } = parsed.data;

  const result = await db.transaction(async (tx) => {
    if (Object.keys(storyFields).length > 0) {
      const [updated] = await tx
        .update(stories)
        .set({ ...storyFields, updatedAt: new Date() })
        .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)))
        .returning();
      if (!updated) return null;
    } else {
      const [exists] = await tx
        .select({ id: stories.id })
        .from(stories)
        .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)));
      if (!exists) return null;
    }
    if (characterIds) {
      await tx
        .delete(storyCharacters)
        .where(eq(storyCharacters.storyId, storyId));
      if (characterIds.length) {
        await tx.insert(storyCharacters).values(
          characterIds.map((characterId) => ({ storyId, characterId })),
        );
      }
    }
    if (locationIds) {
      await tx.delete(storyLocations).where(eq(storyLocations.storyId, storyId));
      if (locationIds.length) {
        await tx.insert(storyLocations).values(
          locationIds.map((locationId) => ({ storyId, locationId })),
        );
      }
    }
    return true;
  });

  if (!result) return jsonError(404, "Story not found");
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const deleted = await db
    .delete(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)))
    .returning({ id: stories.id });
  if (deleted.length === 0) return jsonError(404, "Story not found");
  return new Response(null, { status: 204 });
}
