import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { aiCalls } from "@/db/schema";

export async function getAiCalls(storyId: string) {
  return db
    .select()
    .from(aiCalls)
    .where(eq(aiCalls.storyId, storyId))
    .orderBy(desc(aiCalls.createdAt));
}

export async function createAiCall(data: typeof aiCalls.$inferInsert) {
  const [row] = await db.insert(aiCalls).values(data).returning();
  return row;
}
