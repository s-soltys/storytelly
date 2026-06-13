import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { storyMessages } from "@/db/schema";

export async function getMessages(storyId: string) {
  return db
    .select()
    .from(storyMessages)
    .where(eq(storyMessages.storyId, storyId))
    .orderBy(storyMessages.createdAt);
}

export async function createMessage(data: typeof storyMessages.$inferInsert) {
  const [row] = await db.insert(storyMessages).values(data).returning();
  return row;
}
