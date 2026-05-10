"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, type StorySongDto } from "@/lib/api";
import { ArrowLeft, Music } from "lucide-react";

export default function StoryboardPage() {
  const { worldId, storyId } = useParams<{
    worldId: string;
    storyId: string;
  }>();
  const songs = useQuery({
    queryKey: ["story-songs", storyId],
    queryFn: () =>
      api.get<StorySongDto[]>(`/api/worlds/${worldId}/stories/${storyId}/songs`),
  });
  const selected = songs.data?.find((song) => song.selected);

  return (
    <div className="space-y-4">
      <Link
        href={`/worlds/${worldId}/stories/${storyId}`}
        className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to story
      </Link>

      <section className="rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/45 p-3">
        <h1 className="mb-3 flex items-center gap-2 font-mono text-sm uppercase tracking-widest">
          <Music className="h-4 w-4" /> Storyboard
        </h1>
        {songs.isLoading ? (
          <p className="text-xs text-[var(--color-muted)]">Loading song…</p>
        ) : selected ? (
          <div className="space-y-2">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest">
                {selected.name}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                Selected {selected.source} song
              </p>
            </div>
            <audio controls src={selected.url} className="w-full" />
          </div>
        ) : (
          <p className="text-xs text-[var(--color-muted)]">
            Select a song on the story page before opening the storyboard.
          </p>
        )}
      </section>

      <section className="min-h-64 rounded-[var(--radius-control)] border border-dashed border-[var(--color-border)]/80 bg-[var(--color-surface)]/25 p-3">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
          TODO: storyboard editor
        </p>
      </section>
    </div>
  );
}
