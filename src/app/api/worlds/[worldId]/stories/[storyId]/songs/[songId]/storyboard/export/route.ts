import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { images, songClips, stories, storySongs, videos } from "@/db/schema";
import { jsonError } from "@/lib/server";
import { getObjectBuffer } from "@/lib/storage";
import { createZip, type ZipEntry } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = {
  params: Promise<{ worldId: string; storyId: string; songId: string }>;
};

type ExportClip = {
  id: string;
  name: string;
  description: string;
  sectionIndex: number;
  position: number;
  startSeconds: number;
  durationSeconds: number;
  lane: number;
  kind: "video" | "image";
  zipPath: string;
  resourceId: string;
};

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId, storyId, songId } = await params;

  const [story] = await db
    .select()
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)));
  if (!story) return jsonError(404, "Story not found");

  const [song] = await db
    .select()
    .from(storySongs)
    .where(and(eq(storySongs.id, songId), eq(storySongs.storyId, storyId)));
  if (!song || song.archived) return jsonError(404, "Song not found");

  const clips = await db
    .select()
    .from(songClips)
    .where(eq(songClips.songId, song.id))
    .orderBy(asc(songClips.sectionIndex), asc(songClips.position));

  const clipIds = clips.map((clip) => clip.id);
  const [clipImages, clipVideos] =
    clipIds.length > 0
      ? await Promise.all([
          db.select().from(images).where(inArray(images.ownerId, clipIds)),
          db.select().from(videos).where(inArray(videos.ownerId, clipIds)),
        ])
      : [[], []];

  const baseName = safeName(`${story.name}-${song.name}-storyboard`);
  const songExt = extensionFor(song.s3Key, song.mimeType, "mp3");
  const songPath = `music/${safeName(song.name)}.${songExt}`;
  const songDuration = timelineDuration(song);
  const zipEntries: ZipEntry[] = [
    { path: songPath, data: await getObjectBuffer(song.s3Key) },
  ];

  const exportClips: ExportClip[] = [];
  const missingClips: Array<{ id: string; description: string; sectionIndex: number }> = [];
  const lanesByStart = new Map<number, number>();

  for (const clip of clips) {
    const section = song.sections?.[clip.sectionIndex];
    if (!section) {
      missingClips.push({
        id: clip.id,
        description: clip.description,
        sectionIndex: clip.sectionIndex,
      });
      continue;
    }

    const video = clipVideos
      .filter((item) => item.ownerKind === "song_clip" && item.ownerId === clip.id)
      .sort((a, b) => b.position - a.position)[0];
    const image = clipImages
      .filter((item) => item.ownerKind === "song_clip" && item.ownerId === clip.id)
      .sort((a, b) => b.position - a.position)[0];
    const media = video ?? image;

    if (!media) {
      missingClips.push({
        id: clip.id,
        description: clip.description,
        sectionIndex: clip.sectionIndex,
      });
      continue;
    }

    const kind = video ? "video" : "image";
    const blockStart = section.startSeconds;
    const blockDuration = Math.max(1, section.endSeconds - section.startSeconds);
    const mediaDuration =
      kind === "video" ? video?.durationSeconds || Math.min(blockDuration, 8) : blockDuration;
    const lane = (lanesByStart.get(blockStart) ?? 0) + 1;
    lanesByStart.set(blockStart, lane);

    const ext = extensionFor(media.s3Key, media.mimeType, kind === "video" ? "mp4" : "png");
    const fileName = `${String(clip.sectionIndex + 1).padStart(2, "0")}-${String(
      clip.position + 1,
    ).padStart(2, "0")}-${safeName(clip.description).slice(0, 48)}.${ext}`;
    const zipPath = `clips/${fileName}`;

    zipEntries.push({ path: zipPath, data: await getObjectBuffer(media.s3Key) });
    exportClips.push({
      id: clip.id,
      name: fileName,
      description: clip.description,
      sectionIndex: clip.sectionIndex,
      position: clip.position,
      startSeconds: blockStart,
      durationSeconds: mediaDuration,
      lane,
      kind,
      zipPath,
      resourceId: `r${exportClips.length + 3}`,
    });
  }

  const manifest = {
    story: { id: story.id, name: story.name },
    song: {
      id: song.id,
      name: song.name,
      path: songPath,
      durationSeconds: songDuration,
    },
    clips: exportClips.map((clip) => ({
      id: clip.id,
      description: clip.description,
      sectionIndex: clip.sectionIndex,
      position: clip.position,
      startSeconds: clip.startSeconds,
      durationSeconds: clip.durationSeconds,
      lane: clip.lane,
      kind: clip.kind,
      path: clip.zipPath,
    })),
    missingClips,
  };

  zipEntries.push({
    path: "timeline.fcpxml",
    data: buildFcpxml({
      projectName: `${story.name} - ${song.name}`,
      songPath,
      songName: song.name,
      songDuration,
      clips: exportClips,
    }),
  });
  zipEntries.push({ path: "timeline.json", data: JSON.stringify(manifest, null, 2) });
  zipEntries.push({
    path: "README.txt",
    data: [
      "Storyboard export",
      "",
      "Import timeline.fcpxml into DaVinci Resolve.",
      "Media paths are relative to this extracted folder.",
      "Each storyboard clip is placed at the start of its song-analysis block.",
      "When multiple clips share the same block start time, they are placed on separate video lanes.",
      "Clips with generated video use that video; otherwise the latest clip image is used as a still.",
      "",
    ].join("\n"),
  });

  const zip = createZip(zipEntries);
  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${baseName}.zip"`,
      "content-length": zip.length.toString(),
    },
  });
}

function buildFcpxml(args: {
  projectName: string;
  songPath: string;
  songName: string;
  songDuration: number;
  clips: ExportClip[];
}) {
  const audioId = "r2";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormat1080p30" frameDuration="1/30s" width="1920" height="1080"/>
    <asset id="${audioId}" name="${xmlEscape(args.songName)}" src="${xmlEscape(
      uriPath(args.songPath),
    )}" start="0s" duration="${fcpxTime(args.songDuration)}" hasAudio="1" audioSources="1" audioChannels="2" audioRate="48000"/>
${args.clips
  .map(
    (clip) =>
      `    <asset id="${clip.resourceId}" name="${xmlEscape(clip.name)}" src="${xmlEscape(
        uriPath(clip.zipPath),
      )}" start="0s" duration="${fcpxTime(clip.durationSeconds)}" hasVideo="1" format="r1"/>`,
  )
  .join("\n")}
  </resources>
  <library>
    <event name="${xmlEscape(args.projectName)}">
      <project name="${xmlEscape(args.projectName)}">
        <sequence format="r1" duration="${fcpxTime(args.songDuration)}" tcStart="0s" tcFormat="NDF">
          <spine>
            <asset-clip name="${xmlEscape(args.songName)}" ref="${audioId}" offset="0s" start="0s" duration="${fcpxTime(
              args.songDuration,
            )}" lane="-1"/>
${args.clips
  .map(
    (clip) =>
      `            <asset-clip name="${xmlEscape(clip.name)}" ref="${clip.resourceId}" offset="${fcpxTime(
        clip.startSeconds,
      )}" start="0s" duration="${fcpxTime(clip.durationSeconds)}" lane="${clip.lane}"/>`,
  )
  .join("\n")}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

function timelineDuration(song: typeof storySongs.$inferSelect) {
  const sectionsEnd = Math.max(0, ...(song.sections || []).map((section) => section.endSeconds));
  return Math.max(1, song.lengthSeconds || sectionsEnd);
}

function fcpxTime(seconds: number) {
  if (seconds <= 0) return "0s";
  return `${Math.max(1, Math.round(seconds * 1000))}/1000s`;
}

function safeName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "storyboard"
  );
}

function extensionFor(s3Key: string, mimeType: string | null, fallback: string) {
  const fromKey = s3Key.split(".").pop()?.toLowerCase();
  if (fromKey && /^[a-z0-9]{2,5}$/.test(fromKey)) return fromKey;
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  if (normalized === "audio/mpeg") return "mp3";
  if (normalized === "video/mp4") return "mp4";
  if (normalized === "video/webm") return "webm";
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  return fallback;
}

function uriPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
