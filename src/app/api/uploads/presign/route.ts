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
import { presignedGetUrl, presignedPutUrl } from "@/lib/storage";
import { jsonError } from "@/lib/server";
import { createImage } from "@/lib/services/images";

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
  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "Invalid JSON body");

  const { ownerKind, ownerId, fileType, fileSize } = body;

  const ownerKindParse = imageOwnerKindSchema.safeParse(ownerKind);
  if (!ownerKindParse.success) return jsonError(400, "Invalid ownerKind");
  if (typeof ownerId !== "string" || !ownerId) {
    return jsonError(400, "Invalid ownerId");
  }
  if (typeof fileType !== "string" || !ALLOWED.includes(fileType)) {
    return jsonError(415, `Unsupported file type: ${fileType}`);
  }
  if (typeof fileSize !== "number" || fileSize > MAX_BYTES) {
    return jsonError(413, `File too large or invalid size`);
  }

  const kind = ownerKindParse.data;
  if (!(await ownerExists(kind, ownerId))) {
    return jsonError(404, "Owner not found");
  }

  // Get position
  const [{ value: maxPos }] = await db
    .select({ value: max(images.position) })
    .from(images)
    .where(and(eq(images.ownerKind, kind), eq(images.ownerId, ownerId)));
  const position = (maxPos ?? -1) + 1;

  const key = keyFor(kind, ownerId, extFromMime(fileType));

  // Insert database record
  const row = await createImage({
    s3Key: key,
    mimeType: fileType,
    sizeBytes: fileSize,
    ownerKind: kind,
    ownerId,
    position,
  });

  // Generate presigned URLs
  const uploadUrl = await presignedPutUrl(key, fileType);
  const getUrl = await presignedGetUrl(key);

  return Response.json(
    {
      uploadUrl,
      image: {
        ...row,
        url: getUrl,
      },
    },
    { status: 201 },
  );
}
