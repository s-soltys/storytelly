import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { images as imagesTable, type ImageOwnerKind } from "@/db/schema";

export async function getImages(ownerKind: ImageOwnerKind, ownerIds: string | string[]) {
  const ids = Array.isArray(ownerIds) ? ownerIds : [ownerIds];
  if (ids.length === 0) return [];
  return db
    .select()
    .from(imagesTable)
    .where(
      and(
        eq(imagesTable.ownerKind, ownerKind),
        inArray(imagesTable.ownerId, ids),
      ),
    )
    .orderBy(imagesTable.position, imagesTable.createdAt);
}

export async function createImage(data: typeof imagesTable.$inferInsert) {
  const [row] = await db.insert(imagesTable).values(data).returning();
  return row;
}

export async function deleteImage(imageId: string) {
  const [row] = await db
    .delete(imagesTable)
    .where(eq(imagesTable.id, imageId))
    .returning({ s3Key: imagesTable.s3Key });
  return row ?? null;
}
