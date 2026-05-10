import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storySongs } from "@/db/schema";
import { deleteObject, presignedGetUrl, putObject } from "@/lib/storage";
import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED = ["audio/mpeg", "audio/mp3"];

type Ctx = { params: Promise<{ worldId: string; storyId: string }> };

async function storyExists(worldId: string, storyId: string) {
  const [story] = await db
    .select({ id: stories.id })
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)));
  return Boolean(story);
}

async function songDto(row: typeof storySongs.$inferSelect) {
  return {
    id: row.id,
    storyId: row.storyId,
    name: row.name,
    source: row.source,
    url: await presignedGetUrl(row.s3Key),
    s3Key: row.s3Key,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    model: row.model,
    transcript: row.transcript,
    costUsd: row.costUsd,
    selected: row.selected,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  if (!(await storyExists(worldId, storyId))) {
    return jsonError(404, "Story not found");
  }
  const rows = await db
    .select()
    .from(storySongs)
    .where(eq(storySongs.storyId, storyId))
    .orderBy(desc(storySongs.selected), desc(storySongs.createdAt));
  return Response.json(await Promise.all(rows.map(songDto)));
}

export async function POST(req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  if (!(await storyExists(worldId, storyId))) {
    return jsonError(404, "Story not found");
  }

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError(400, "Expected multipart/form-data");
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "MP3 file is required");
  if (!ALLOWED.includes(file.type)) {
    return jsonError(415, "Only MP3 uploads are supported");
  }
  if (file.size > MAX_BYTES) {
    return jsonError(413, `File too large: ${file.name}`);
  }

  const nameRaw = form.get("name");
  const name =
    typeof nameRaw === "string" && nameRaw.trim()
      ? nameRaw.trim()
      : file.name.replace(/\.mp3$/i, "") || "Uploaded song";
  const key = `stories/${storyId}/songs/${randomUUID()}.mp3`;
  const buf = Buffer.from(await file.arrayBuffer());

  await putObject(key, buf, "audio/mpeg");
  try {
    const existing = await db
      .select({ id: storySongs.id })
      .from(storySongs)
      .where(eq(storySongs.storyId, storyId))
      .limit(1);
    const [row] = await db
      .insert(storySongs)
      .values({
        storyId,
        name,
        source: "uploaded",
        s3Key: key,
        mimeType: "audio/mpeg",
        sizeBytes: file.size,
        selected: existing.length === 0,
      })
      .returning();
    return Response.json(await songDto(row), { status: 201 });
  } catch (err) {
    await deleteObject(key).catch(() => {});
    throw err;
  }
}
