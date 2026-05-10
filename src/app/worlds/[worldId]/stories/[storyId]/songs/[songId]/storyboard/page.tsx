"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type StorySongDto } from "@/lib/api";
import { ArrowLeft, Music, Wand2, FileText, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StoryboardPage() {
  const qc = useQueryClient();
  const { worldId, storyId, songId } = useParams<{
    worldId: string;
    storyId: string;
    songId: string;
  }>();

  const songs = useQuery({
    queryKey: ["story-songs", storyId],
    queryFn: () =>
      api.get<StorySongDto[]>(`/api/worlds/${worldId}/stories/${storyId}/songs`),
  });
  const song = songs.data?.find((item) => item.id === songId);

  const analyze = useMutation({
    mutationFn: () =>
      api.post(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/analyze`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-songs", storyId] });
    },
  });

  const handleAnalyze = () => {
    if (song?.sections && !confirm("Re-generate analysis? Current sections will be overwritten.")) {
      return;
    }
    analyze.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/worlds/${worldId}/stories/${storyId}`}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to story
        </Link>
        <Button
          size="sm"
          disabled={analyze.isPending || !song}
          onClick={handleAnalyze}
        >
          <Wand2 className={`h-4 w-4 ${analyze.isPending ? "animate-spin" : ""}`} />
          {analyze.isPending ? "Analyzing..." : song?.sections ? "Re-analyze Song" : "Analyze Song"}
        </Button>
      </div>

      <section className="rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/45 p-3">
        <h1 className="mb-3 flex items-center gap-2 font-mono text-sm uppercase tracking-widest">
          <Music className="h-4 w-4" /> Storyboard
        </h1>
        {songs.isLoading ? (
          <p className="text-xs text-[var(--color-muted)]">Loading song…</p>
        ) : song && !song.archived ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs uppercase tracking-widest">
                  {song.name}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                  {song.source}
                  {song.lengthSeconds ? ` · ${song.lengthSeconds}s` : ""}
                </p>
              </div>
            </div>
            <audio controls src={song.url} className="h-8 w-full" />

            {analyze.error && (
              <p className="text-xs text-[var(--color-danger)]">
                {(analyze.error as Error).message}
              </p>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Subtitles Display */}
              <div className="space-y-2">
                <h2 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
                  <FileText className="h-3 w-3" /> Subtitles
                </h2>
                <div className="h-64 overflow-auto rounded-[var(--radius-control)] border border-[var(--color-border)]/50 bg-[var(--color-surface-2)]/30 p-2 font-mono text-[11px] leading-relaxed whitespace-pre text-[var(--color-fg)]/80">
                  {song.subtitles || "No subtitles generated yet."}
                </div>
              </div>

              {/* Sections Display */}
              <div className="space-y-2">
                <h2 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
                  <LayoutList className="h-3 w-3" /> Song Sections
                </h2>
                <div className="h-64 space-y-2 overflow-auto pr-1">
                  {song.sections && song.sections.length > 0 ? (
                    song.sections.map((section, i) => (
                      <div
                        key={i}
                        className="rounded-[var(--radius-control)] border border-[var(--color-border)]/50 bg-[var(--color-surface-2)]/30 p-2 text-xs"
                      >
                        <div className="mb-1 flex items-center justify-between border-b border-[var(--color-border)]/30 pb-1 font-mono text-[10px] uppercase tracking-tighter">
                          <span className="text-[var(--color-accent)]">
                            {section.startSeconds}s - {section.endSeconds}s
                          </span>
                          <span className="text-[var(--color-muted)]">{section.mood}</span>
                        </div>
                        <p className="mb-2 leading-tight text-[var(--color-fg)]/90">
                          {section.description}
                        </p>
                        {section.characters && (
                          <p className="mb-1 text-[10px] text-[var(--color-muted)]">
                            <span className="uppercase tracking-widest">Characters:</span> {section.characters}
                          </p>
                        )}
                        {section.scenes && (
                          <p className="mb-2 text-[10px] text-[var(--color-muted)]">
                            <span className="uppercase tracking-widest">Scenes:</span> {section.scenes}
                          </p>
                        )}
                        <div className="space-y-1">
                          <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-accent)]/80">
                            Clip Ideas:
                          </p>
                          {section.clipIdeas.map((clip, ci) => (
                            <div key={ci} className="border-l-2 border-[var(--color-accent)]/30 pl-2">
                              <p className="text-[10px] text-[var(--color-muted)]">{clip}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-[var(--color-muted)] italic">
                      No sections analyzed yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--color-muted)]">
            This song is unavailable or archived.
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
