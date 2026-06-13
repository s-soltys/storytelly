import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  characters,
  locations,
  stories,
  storyCharacters,
  storyLocations,
  storyLyricsVersions,
} from "@/db/schema";
import { loadImages } from "@/lib/server";

export async function getStoriesByWorldId(worldId: string) {
  const rows = await db
    .select()
    .from(stories)
    .where(eq(stories.worldId, worldId))
    .orderBy(desc(stories.createdAt));
  const storyIds = rows.map((s) => s.id);
  const allMoodImages = storyIds.length > 0 ? await loadImages("story_mood", storyIds) : [];
  const imageMap = new Map<string, typeof allMoodImages>();
  for (const img of allMoodImages) {
    if (!imageMap.has(img.ownerId)) imageMap.set(img.ownerId, []);
    imageMap.get(img.ownerId)!.push(img);
  }
  return rows.map((s) => ({ ...s, moodImages: imageMap.get(s.id) || [] }));
}

export async function getStoryById(worldId: string, storyId: string) {
  const [story] = await db
    .select()
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)));
  if (!story) return null;

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

  return {
    ...story,
    characterIds: chars.map((c) => c.characterId),
    locationIds: locs.map((l) => l.locationId),
    moodImages,
  };
}

export async function createStory(
  worldId: string,
  data: {
    name: string;
    description: string;
    lengthSeconds: number;
    lyrics: string;
    characterIds: string[];
    locationIds: string[];
  },
) {
  const { characterIds, locationIds, ...storyFields } = data;

  // Validate characters
  const validChars = await db
    .select({ id: characters.id })
    .from(characters)
    .where(
      inArray(characters.id, characterIds.length ? characterIds : ["__none__"]),
    );
  if (validChars.length !== characterIds.length) {
    throw new Error("Some characters do not exist");
  }

  const charsBelong = await db
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.worldId, worldId));
  const allowedCharIds = new Set(charsBelong.map((c) => c.id));
  if (!characterIds.every((id) => allowedCharIds.has(id))) {
    throw new Error("Characters must belong to this world");
  }

  // Validate locations
  if (locationIds.length) {
    const locsBelong = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.worldId, worldId));
    const allowedLocIds = new Set(locsBelong.map((l) => l.id));
    if (!locationIds.every((id) => allowedLocIds.has(id))) {
      throw new Error("Locations must belong to this world");
    }
  }

  return db.transaction(async (tx) => {
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
}

export async function updateStory(
  worldId: string,
  storyId: string,
  data: {
    name?: string;
    description?: string;
    lengthSeconds?: number;
    lyrics?: string;
    characterIds?: string[];
    locationIds?: string[];
    selectedSongId?: string | null;
  },
) {
  const { characterIds, locationIds, ...storyFields } = data;

  const result = await db.transaction(async (tx) => {
    if (Object.keys(storyFields).length > 0) {
      const [updated] = await tx
        .update(stories)
        .set({ ...storyFields, updatedAt: new Date() })
        .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)))
        .returning();
      if (!updated) return null;

      if (storyFields.lyrics !== undefined) {
        const [lastVersion] = await tx
          .select()
          .from(storyLyricsVersions)
          .where(eq(storyLyricsVersions.storyId, storyId))
          .orderBy(desc(storyLyricsVersions.createdAt))
          .limit(1);

        if (!lastVersion || lastVersion.lyrics !== storyFields.lyrics) {
          const oneMinuteAgo = new Date(Date.now() - 60000);
          if (
            lastVersion &&
            lastVersion.createdAt >= oneMinuteAgo &&
            lastVersion.prompt === "Manual edit"
          ) {
            await tx
              .update(storyLyricsVersions)
              .set({ lyrics: storyFields.lyrics, createdAt: new Date() })
              .where(eq(storyLyricsVersions.id, lastVersion.id));
          } else {
            await tx.insert(storyLyricsVersions).values({
              storyId,
              lyrics: storyFields.lyrics,
              prompt: "Manual edit",
            });
          }
        }
      }
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

  return result;
}

export async function deleteStory(worldId: string, storyId: string) {
  const deleted = await db
    .delete(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)))
    .returning({ id: stories.id });
  return deleted.length > 0;
}
