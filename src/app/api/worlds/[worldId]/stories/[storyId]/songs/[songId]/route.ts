import { z } from "zod";
import { deleteObject } from "@/lib/storage";
import { jsonError } from "@/lib/server";
import { getSongById, updateSong, deleteSong } from "@/lib/services/songs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = {
  params: Promise<{ worldId: string; storyId: string; songId: string }>;
};

const songUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  archived: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId, storyId, songId } = await params;
  const song = await getSongById(worldId, storyId, songId);
  if (song === null) return jsonError(404, "Song not found");
  return Response.json(song);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { worldId, storyId, songId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonError(400, "Expected JSON body");
  }

  const parsed = songUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid fields", parsed.error.flatten());

  const updated = await updateSong(worldId, storyId, songId, parsed.data);
  if (!updated) return jsonError(404, "Song not found");
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { worldId, storyId, songId } = await params;
  const deleted = await deleteSong(worldId, storyId, songId);
  if (!deleted) return jsonError(404, "Song not found");
  return new Response(null, { status: 204 });
}
