"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type StorySongDto } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Music, Radio, RotateCw, Trash2, Upload } from "lucide-react";

export function StorySongsPanel({
  worldId,
  storyId,
}: {
  worldId: string;
  storyId: string;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadName, setUploadName] = useState("");

  const songs = useQuery({
    queryKey: ["story-songs", storyId],
    queryFn: () =>
      api.get<StorySongDto[]>(`/api/worlds/${worldId}/stories/${storyId}/songs`),
  });

  const generate = useMutation({
    mutationFn: () =>
      api.post<StorySongDto>(
        `/api/worlds/${worldId}/stories/${storyId}/songs/generate`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-songs", storyId] });
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      if (uploadName.trim()) form.append("name", uploadName.trim());
      return api.upload<StorySongDto>(
        `/api/worlds/${worldId}/stories/${storyId}/songs`,
        form,
      );
    },
    onSuccess: () => {
      setUploadName("");
      if (inputRef.current) inputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["story-songs", storyId] });
    },
  });

  const select = useMutation({
    mutationFn: (songId: string) =>
      api.patch<StorySongDto>(
        `/api/worlds/${worldId}/stories/${storyId}/songs/${songId}`,
        { selected: true },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-songs", storyId] });
    },
  });

  const remove = useMutation({
    mutationFn: (songId: string) =>
      api.del<void>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-songs", storyId] });
    },
  });

  const items = songs.data ?? [];
  const selected = items.find((song) => song.selected);

  return (
    <section className="space-y-2.5 rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/45 p-3">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)]/70 pb-2">
        <div>
          <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
            <Music className="h-4 w-4" /> Songs
          </h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Generate with Lyria or upload an MP3.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <>
                <RotateCw className="h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Music className="h-4 w-4" /> Generate
              </>
            )}
          </Button>
          {selected && (
            <Button asChild size="sm" variant="secondary">
              <Link
                href={`/worlds/${worldId}/stories/${storyId}/storyboard`}
              >
                <Radio className="h-4 w-4" /> Open storyboard
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          value={uploadName}
          onChange={(e) => setUploadName(e.target.value)}
          placeholder="Optional upload name"
          className="h-9 border-transparent bg-[var(--color-surface-2)]/35"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" /> {upload.isPending ? "Uploading…" : "Upload MP3"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,.mp3"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
          }}
        />
      </div>

      {(generate.error || upload.error || select.error || remove.error) && (
        <p className="text-xs text-[var(--color-danger)]">
          {
            (
              (generate.error || upload.error || select.error || remove.error) as Error
            ).message
          }
        </p>
      )}

      {songs.isLoading ? (
        <p className="text-xs text-[var(--color-muted)]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)]">
          No songs yet.
        </p>
      ) : (
        <div className="space-y-2.5">
          {items.map((song) => (
            <SongRow
              key={song.id}
              song={song}
              selecting={select.isPending}
              removing={remove.isPending}
              onSelect={() => select.mutate(song.id)}
              onDelete={() => {
                if (confirm("Delete this song?")) remove.mutate(song.id);
              }}
              storyboardHref={`/worlds/${worldId}/stories/${storyId}/storyboard`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SongRow({
  song,
  selecting,
  removing,
  onSelect,
  onDelete,
  storyboardHref,
}: {
  song: StorySongDto;
  selecting: boolean;
  removing: boolean;
  onSelect: () => void;
  onDelete: () => void;
  storyboardHref: string;
}) {
  return (
    <article className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-border)]/80 bg-[var(--color-surface)]/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-mono text-xs uppercase tracking-widest">
            {song.name}
          </h3>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
            {song.source} {song.model ? `· ${song.model}` : ""}
            {song.sizeBytes ? ` · ${formatBytes(song.sizeBytes)}` : ""}
            {song.costUsd ? ` · $${song.costUsd}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {song.selected ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={storyboardHref}>
                <Radio className="h-4 w-4" /> Open storyboard
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={selecting}
              onClick={onSelect}
            >
              Select
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={removing}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <audio controls src={song.url} className="w-full" />
    </article>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
