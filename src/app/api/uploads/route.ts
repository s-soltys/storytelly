import { randomUUID } from "node:crypto";
import { and, eq, max } from "drizzle-orm";
import { db } from "@/db/client";
import {
  characters,
  images,
  locations,
  stories,
  worlds,
  type ImageOwnerKind,
} from "@/db/schema";
import { imageOwnerKindSchema } from "@/lib/validation";
import {
  deleteObject,
  presignedGetUrl,
  putObject,
} from "@/lib/storage";
import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB / file
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function ownerExists(kind: ImageOwnerKind, id: string): Promise<boolean> {
  if (kind === "world_mood") {
    const [r] = await db.select({ id: worlds.id }).from(worlds).where(eq(worlds.id, id));
    return Boolean(r);
  }
  if (kind === "character") {
    const [r] = await db.select({ id: characters.id }).from(characters).where(eq(characters.id, id));
    return Boolean(r);
  }
  if (kind === "location") {
    const [r] = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, id));
    return Boolean(r);
  }
  if (kind === "story_mood") {
    const [r] = await db.select({ id: stories.id }).from(stories).where(eq(stories.id, id));
    return Boolean(r);
  }
  return false;
}

function keyFor(kind: ImageOwnerKind, ownerId: string, ext: string) {
  const folder = {
    world_mood: "worlds",
    character: "characters",
    location: "locations",
    story_mood: "stories",
    song_clip: "clips",
  }[kind];
  const sub = kind.endsWith("_mood") ? "mood" : "images";
  return `${folder}/${ownerId}/${sub}/${randomUUID()}.${ext}`;
}

function extFromMime(mime: string): string {
  return (
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    }[mime] ?? "bin"
  );
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return jsonError(400, "Expected multipart/form-data");

  const ownerKindRaw = form.get("ownerKind");
  const ownerId = form.get("ownerId");
  const ownerKindParse = imageOwnerKindSchema.safeParse(ownerKindRaw);
  if (!ownerKindParse.success) return jsonError(400, "Invalid ownerKind");
  if (typeof ownerId !== "string" || !ownerId) {
    return jsonError(400, "Invalid ownerId");
  }
  const ownerKind = ownerKindParse.data;
  if (!(await ownerExists(ownerKind, ownerId))) {
    return jsonError(404, "Owner not found");
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return jsonError(400, "No files provided");

  const [{ value: maxPos }] = await db
    .select({ value: max(images.position) })
    .from(images)
    .where(and(eq(images.ownerKind, ownerKind), eq(images.ownerId, ownerId)));
  let position = (maxPos ?? -1) + 1;

  const inserted: Array<{
    id: string;
    s3Key: string;
    url: string;
    position: number;
  }> = [];

  for (const file of files) {
    if (!ALLOWED.includes(file.type)) {
      return jsonError(415, `Unsupported file type: ${file.type}`);
    }
    if (file.size > MAX_BYTES) {
      return jsonError(413, `File too large: ${file.name}`);
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const key = keyFor(ownerKind, ownerId, extFromMime(file.type));
    await putObject(key, buf, file.type);
    try {
      const [row] = await db
        .insert(images)
        .values({
          s3Key: key,
          mimeType: file.type,
          sizeBytes: file.size,
          ownerKind,
          ownerId,
          position: position++,
        })
        .returning({
          id: images.id,
          s3Key: images.s3Key,
          position: images.position,
        });
      inserted.push({ ...row, url: await presignedGetUrl(row.s3Key) });
    } catch (err) {
      // best-effort cleanup of orphaned object
      await deleteObject(key).catch(() => {});
      throw err;
    }
  }

  return Response.json(inserted, { status: 201 });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonError(400, "id query param required");
  const [row] = await db
    .delete(images)
    .where(eq(images.id, id))
    .returning({ s3Key: images.s3Key });
  if (!row) return jsonError(404, "Image not found");
  await deleteObject(row.s3Key).catch(() => {});
  return new Response(null, { status: 204 });
}
