import { and, asc, eq, inArray } from "drizzle-orm";
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
  ownerId: string;
};

// Simple in-memory cache for presigned URLs (1-hour TTL)
const urlCache = new Map<string, { url: string; expires: number }>();
const CACHE_TTL = 3_600_000; // 1 hour

function getCachedUrl(s3Key: string): string | null {
  const entry = urlCache.get(s3Key);
  if (entry && entry.expires > Date.now()) return entry.url;
  urlCache.delete(s3Key);
  return null;
}

function setCachedUrl(s3Key: string, url: string) {
  urlCache.set(s3Key, { url, expires: Date.now() + CACHE_TTL });
  // Evict stale entries if cache grows too large
  if (urlCache.size > 1000) {
    const now = Date.now();
    for (const [key, entry] of urlCache) {
      if (entry.expires <= now) urlCache.delete(key);
    }
  }
}

export async function loadImages(
  ownerKind: ImageOwnerKind,
  ownerIds: string | string[],
): Promise<HydratedImage[]> {
  const ids = Array.isArray(ownerIds) ? ownerIds : [ownerIds];
  if (ids.length === 0) return [];

  const rows = await db
    .select()
    .from(images)
    .where(
      and(eq(images.ownerKind, ownerKind), inArray(images.ownerId, ids)),
    )
    .orderBy(asc(images.position), asc(images.createdAt));

  return Promise.all(
    rows.map(async (r) => {
      const cached = getCachedUrl(r.s3Key);
      const url = cached ?? await presignedGetUrl(r.s3Key);
      if (!cached) setCachedUrl(r.s3Key, url);
      return {
        id: r.id,
        url,
        s3Key: r.s3Key,
        position: r.position,
        mimeType: r.mimeType,
        width: r.width,
        height: r.height,
        ownerId: r.ownerId,
      };
    }),
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
