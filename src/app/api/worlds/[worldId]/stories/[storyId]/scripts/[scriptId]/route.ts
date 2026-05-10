import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storyScripts } from "@/db/schema";
import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ worldId: string; storyId: string; scriptId: string }>;
};

export async function DELETE(_req: Request, { params }: Ctx) {
  const { worldId, storyId, scriptId } = await params;
  const [story] = await db
    .select({ id: stories.id })
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)));
  if (!story) return jsonError(404, "Story not found");

  const deleted = await db
    .delete(storyScripts)
    .where(
      and(eq(storyScripts.id, scriptId), eq(storyScripts.storyId, storyId)),
    )
    .returning({ id: storyScripts.id });
  if (deleted.length === 0) return jsonError(404, "Script not found");
  return new Response(null, { status: 204 });
}
