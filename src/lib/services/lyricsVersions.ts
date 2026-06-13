import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { storyLyricsVersions } from "@/db/schema";

export async function getLyricsVersions(storyId: string) {
  return db
    .select()
    .from(storyLyricsVersions)
    .where(eq(storyLyricsVersions.storyId, storyId))
    .orderBy(desc(storyLyricsVersions.createdAt));
}

export async function createLyricsVersion(data: typeof storyLyricsVersions.$inferInsert) {
  const [row] = await db.insert(storyLyricsVersions).values(data).returning();
  return row;
}
