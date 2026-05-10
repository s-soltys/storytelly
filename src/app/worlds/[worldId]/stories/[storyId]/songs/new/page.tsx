"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type StorySongDto } from "@/lib/api";
import { STORY_LENGTHS } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ArrowLeft, Music, RotateCw } from "lucide-react";
import { useState } from "react";

export default function NewSongPage() {
  const { worldId, storyId } = useParams<{
    worldId: string;
    storyId: string;
  }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [lengthSeconds, setLengthSeconds] = useState(60);
  const [lyrics, setLyrics] = useState("");

  const generateLyrics = useMutation({
    mutationFn: () =>
      api.post<{ lyrics: string }>(
        `/api/worlds/${worldId}/stories/${storyId}/songs/lyrics`,
        { lengthSeconds },
      ),
    onSuccess: (data) => setLyrics(data.lyrics),
  });

  const generateSong = useMutation({
    mutationFn: () =>
      api.post<StorySongDto>(
        `/api/worlds/${worldId}/stories/${storyId}/songs/generate`,
        {
          lengthSeconds,
          lyrics: lyrics.trim() || undefined,
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-songs", storyId] });
      router.push(`/worlds/${worldId}/stories/${storyId}`);
    },
  });

  return (
    <div className="space-y-4">
      <Link
        href={`/worlds/${worldId}/stories/${storyId}`}
        className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to story
      </Link>

      <section className="space-y-3 rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/45 p-3">
        <header className="border-b border-[var(--color-border)]/70 pb-2">
          <h1 className="flex items-center gap-2 font-mono text-sm uppercase tracking-widest">
            <Music className="h-4 w-4" /> Generate song
          </h1>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Choose a length, optionally generate or edit lyrics, then create the MP3.
          </p>
        </header>

        <div className="grid gap-1.5 sm:grid-cols-[5.25rem_minmax(0,1fr)] sm:items-start">
          <label className="pt-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
            Length
          </label>
          <select
            value={lengthSeconds}
            onChange={(e) => setLengthSeconds(Number(e.target.value))}
            className="h-9 rounded-[var(--radius-control)] border border-transparent bg-[var(--color-surface-2)]/35 px-2 text-sm text-[var(--color-fg)] outline-none hover:bg-[var(--color-surface-2)]/55 focus:border-[var(--color-border)] focus:bg-[var(--color-surface)]"
          >
            {STORY_LENGTHS.map((value) => (
              <option key={value} value={value}>
                {value}s
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5 sm:grid-cols-[5.25rem_minmax(0,1fr)] sm:items-start">
          <label className="pt-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
            Lyrics
          </label>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--color-muted)]">
                Optional. Leave blank to let Lyria compose its own words.
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={generateLyrics.isPending}
                onClick={() => generateLyrics.mutate()}
              >
                {generateLyrics.isPending ? (
                  <>
                    <RotateCw className="h-4 w-4 animate-spin" /> Writing…
                  </>
                ) : (
                  "Generate lyrics"
                )}
              </Button>
            </div>
            <Textarea
              rows={10}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Optional lyrics for this song..."
              className="min-h-64 border-transparent bg-[var(--color-surface-2)]/35 font-mono text-xs leading-relaxed"
            />
          </div>
        </div>

        {(generateLyrics.error || generateSong.error) && (
          <p className="text-xs text-[var(--color-danger)]">
            {((generateLyrics.error || generateSong.error) as Error).message}
          </p>
        )}

        <div className="flex justify-end border-t border-[var(--color-border)]/70 pt-3">
          <Button
            type="button"
            size="sm"
            disabled={generateSong.isPending}
            onClick={() => generateSong.mutate()}
          >
            {generateSong.isPending ? (
              <>
                <RotateCw className="h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Music className="h-4 w-4" /> Generate song
              </>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
