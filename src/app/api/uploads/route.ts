import { deleteObject } from "@/lib/storage";
import { jsonError } from "@/lib/server";
import { deleteImage } from "@/lib/services/images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonError(400, "id query param required");
  const row = await deleteImage(id);
  if (!row) return jsonError(404, "Image not found");
  await deleteObject(row.s3Key).catch(() => {});
  return new Response(null, { status: 204 });
}
