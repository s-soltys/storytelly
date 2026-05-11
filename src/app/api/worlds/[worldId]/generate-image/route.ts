import { randomUUID } from "node:crypto";
import { and, eq, max } from "drizzle-orm";
import { db } from "@/db/client";
import { images, type ImageOwnerKind } from "@/db/schema";
import { jsonError } from "@/lib/server";
import { putObject, presignedGetUrl } from "@/lib/storage";
import { generateEntityImage } from "@/lib/ai/entityImage";
import { imageOwnerKindSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow more time for image generation

type Ctx = { params: Promise<{ worldId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const body = await req.json().catch(() => null);
  
  const kind = body?.kind; // "character" or "location"
  const entityId = body?.id;

  if (!kind || !entityId) {
    return jsonError(400, "Missing kind or id");
  }

  if (kind !== "character" && kind !== "location") {
    return jsonError(400, "Invalid kind");
  }

  try {
    const imageUrl = await generateEntityImage({
      worldId,
      entityId,
      kind,
    });

    // Download or decode the image
    let buffer: Buffer;
    let contentType: string;

    if (imageUrl.startsWith("data:")) {
      const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Invalid data URL format from AI");
      contentType = match[1];
      buffer = Buffer.from(match[2], "base64");
    } else {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`Failed to download image from ${imageUrl}`);
      const arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      contentType = res.headers.get("content-type") || "image/png";
    }

    const ext = contentType.split("/")[1]?.split("+")[0] || "png";

    // Determine S3 key
    const folder = kind === "character" ? "characters" : "locations";
    const key = `${folder}/${entityId}/images/${randomUUID()}.${ext}`;

    // Upload to S3
    await putObject(key, buffer, contentType);

    // Get max position
    const ownerKind: ImageOwnerKind = kind;
    const [{ value: maxPos }] = await db
      .select({ value: max(images.position) })
      .from(images)
      .where(and(eq(images.ownerKind, ownerKind), eq(images.ownerId, entityId)));
    const position = (maxPos ?? -1) + 1;

    // Save to DB
    const [row] = await db
      .insert(images)
      .values({
        s3Key: key,
        mimeType: contentType,
        sizeBytes: buffer.length,
        ownerKind,
        ownerId: entityId,
        position,
      })
      .returning();

    return Response.json({
      ...row,
      url: await presignedGetUrl(row.s3Key),
    }, { status: 201 });

  } catch (error) {
    console.error("Image generation failed:", error);
    return jsonError(500, (error as Error).message);
  }
}
