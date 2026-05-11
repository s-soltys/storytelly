import { randomUUID } from "node:crypto";
import { and, eq, max } from "drizzle-orm";
import { db } from "@/db/client";
import { images, type ImageOwnerKind } from "@/db/schema";
import { jsonError } from "@/lib/server";
import { putObject, presignedGetUrl } from "@/lib/storage";
import { generateClipImage } from "@/lib/ai/entityImage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      worldId: string;
      storyId: string;
      songId: string;
      clipId: string;
    }>;
  },
) {
  const { worldId, storyId, songId, clipId } = await params;
  
  try {
    const imageUrl = await generateClipImage({ worldId, storyId, songId, clipId });
    
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
    const key = `clips/${clipId}/images/${randomUUID()}.${ext}`;

    // Upload to S3
    await putObject(key, buffer, contentType);

    const ownerKind: ImageOwnerKind = "song_clip";
    const [{ value: maxPos }] = await db
      .select({ value: max(images.position) })
      .from(images)
      .where(and(eq(images.ownerKind, ownerKind), eq(images.ownerId, clipId)));
    const position = (maxPos ?? -1) + 1;

    // Save to DB
    const [row] = await db
      .insert(images)
      .values({
        s3Key: key,
        mimeType: contentType,
        sizeBytes: buffer.length,
        ownerKind,
        ownerId: clipId,
        position,
      })
      .returning();

    return Response.json({
      ...row,
      url: await presignedGetUrl(row.s3Key),
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to generate clip image:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Generation failed" },
      { status: 500 },
    );
  }
}

