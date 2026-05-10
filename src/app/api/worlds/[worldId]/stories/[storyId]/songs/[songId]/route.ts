import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storySongs } from "@/db/schema";
import { deleteObject, presignedGetUrl } from "@/lib/storage";
import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = {
  params: Promise<{ worldId: string; storyId: string; songId: string }>;
};

async function storyExists(worldId: string, storyId: string) {
  const [story] = await db
    .select({ id: stories.id })
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)));
  return Boolean(story);
}

async function songDto(row: typeof storySongs.$inferSelect) {
  return {
    ...row,
    url: await presignedGetUrl(row.s3Key),
  };
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { worldId, storyId, songId } = await params;
  if (!(await storyExists(worldId, storyId))) {
    return jsonError(404, "Story not found");
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("archived" in body)) {
    return jsonError(400, "Expected archived flag");
  }

  const archived = Boolean((body as { archived: unknown }).archived);
  const [updated] = await db
    .update(storySongs)
    .set({ archived, updatedAt: new Date() })
    .where(and(eq(storySongs.id, songId), eq(storySongs.storyId, storyId)))
    .returning();

  if (!updated) return jsonError(404, "Song not found");
  return Response.json(await songDto(updated));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { worldId, storyId, songId } = await params;
  if (!(await storyExists(worldId, storyId))) {
    return jsonError(404, "Story not found");
  }
  const [row] = await db
    .delete(storySongs)
    .where(and(eq(storySongs.id, songId), eq(storySongs.storyId, storyId)))
    .returning({ s3Key: storySongs.s3Key });
  if (!row) return jsonError(404, "Song not found");
  await deleteObject(row.s3Key).catch(() => {});
  return new Response(null, { status: 204 });
}
