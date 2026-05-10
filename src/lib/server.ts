import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { images, type ImageOwnerKind } from "@/db/schema";
import { presignedGetUrl } from "@/lib/storage";

export type HydratedImage = {
  id: string;
  url: string;
  s3Key: string;
  position: number;
  mimeType: string | null;
  width: number | null;
  height: number | null;
};

export async function loadImages(
  ownerKind: ImageOwnerKind,
  ownerId: string,
): Promise<HydratedImage[]> {
  const rows = await db
    .select()
    .from(images)
    .where(and(eq(images.ownerKind, ownerKind), eq(images.ownerId, ownerId)))
    .orderBy(asc(images.position), asc(images.createdAt));
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      s3Key: r.s3Key,
      url: await presignedGetUrl(r.s3Key),
      position: r.position,
      mimeType: r.mimeType,
      width: r.width,
      height: r.height,
    })),
  );
}

export function jsonError(status: number, message: string, details?: unknown) {
  return new Response(JSON.stringify({ error: message, details }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  );
}
