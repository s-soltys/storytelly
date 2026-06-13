import { randomUUID } from "node:crypto";
import { deleteObject, putObject } from "@/lib/storage";
import { jsonError } from "@/lib/server";
import { getSongs, createSong } from "@/lib/services/songs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED = ["audio/mpeg", "audio/mp3"];

type Ctx = { params: Promise<{ worldId: string; storyId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const songs = await getSongs(worldId, storyId);
  if (songs === null) return jsonError(404, "Story not found");
  return Response.json(songs);
}

export async function POST(req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const songs = await getSongs(worldId, storyId);
  if (songs === null) return jsonError(404, "Story not found");

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError(400, "Expected multipart/form-data");
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "MP3 file is required");
  if (!ALLOWED.includes(file.type)) {
    return jsonError(415, "Only MP3 uploads are supported");
  }
  if (file.size > MAX_BYTES) {
    return jsonError(413, `File too large: ${file.name}`);
  }

  const nameRaw = form.get("name");
  const name =
    typeof nameRaw === "string" && nameRaw.trim()
      ? nameRaw.trim()
      : file.name.replace(/\.mp3$/i, "") || "Uploaded song";
  
  const lengthSecondsRaw = form.get("lengthSeconds");
  const lengthSeconds = typeof lengthSecondsRaw === "string" ? parseInt(lengthSecondsRaw, 10) : null;

  const key = `stories/${storyId}/songs/${randomUUID()}.mp3`;
  const buf = Buffer.from(await file.arrayBuffer());

  await putObject(key, buf, "audio/mpeg");
  try {
    const song = await createSong({
      storyId,
      name,
      source: "uploaded",
      s3Key: key,
      mimeType: "audio/mpeg",
      sizeBytes: file.size,
      lengthSeconds: !isNaN(Number(lengthSeconds)) ? lengthSeconds : null,
      archived: false,
    });
    return Response.json(song, { status: 201 });
  } catch (err) {
    await deleteObject(key).catch(() => {});
    throw err;
  }
}
