import { getObjectBuffer } from "@/lib/storage";

const MAX_BASE64_BYTES = 1_500_000;

export async function imageToDataUrl(args: {
  s3Key: string;
  mimeType: string | null;
}): Promise<string | null> {
  const bytes = await getObjectBuffer(args.s3Key);
  if (bytes.byteLength > MAX_BASE64_BYTES) {
    // Skip images that would balloon the request; better to drop than fail.
    return null;
  }
  const buffer = Buffer.from(bytes);
  const mime = args.mimeType?.trim() || guessMime(args.s3Key);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function guessMime(key: string): string {
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
