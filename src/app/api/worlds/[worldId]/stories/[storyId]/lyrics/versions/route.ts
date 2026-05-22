import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storyLyricsVersions } from "@/db/schema";
import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ worldId: string; storyId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;

  const [story] = await db
    .select({ id: stories.id })
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)));

  if (!story) {
    return jsonError(404, "Story not found");
  }

  const versions = await db
    .select()
    .from(storyLyricsVersions)
    .where(eq(storyLyricsVersions.storyId, storyId))
    .orderBy(desc(storyLyricsVersions.createdAt));

  return Response.json(versions);
}
