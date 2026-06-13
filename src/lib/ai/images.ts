import { getObjectBuffer } from "@/lib/storage";

export const MAX_DATA_URL_IMAGE_BYTES = 4_000_000;
const TARGET_DATA_URL_IMAGE_BYTES = 1_200_000;
const MAX_IMAGE_DIMENSION = 1280;
const REFERENCE_IMAGE_MIME = "image/jpeg";

export async function imageToDataUrl(args: {
  s3Key: string;
  mimeType: string | null;
}): Promise<string | null> {
  const bytes = await getObjectBuffer(args.s3Key);
  let buffer: Buffer<ArrayBufferLike> = Buffer.from(bytes);
  let mime = args.mimeType?.trim() || guessMime(args.s3Key);

  if (buffer.byteLength > TARGET_DATA_URL_IMAGE_BYTES) {
    const resized = await resizeReferenceImage(buffer).catch((error) => {
      console.error("Failed to resize image context:", error);
      return null;
    });
    if (resized) {
      buffer = resized;
      mime = REFERENCE_IMAGE_MIME;
    }
  }

  if (buffer.byteLength > MAX_DATA_URL_IMAGE_BYTES) {
    const resized = await resizeReferenceImage(buffer, 70).catch((error) => {
      console.error("Failed to resize oversized image context:", error);
      return null;
    });
    if (!resized || resized.byteLength > MAX_DATA_URL_IMAGE_BYTES) return null;
    buffer = resized;
    mime = REFERENCE_IMAGE_MIME;
  }

  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function resizeReferenceImage(
  buffer: Buffer<ArrayBufferLike>,
  quality = 82,
): Promise<Buffer<ArrayBufferLike>> {
  const sharp = (await import("sharp")).default;
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

export function guessMime(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}
