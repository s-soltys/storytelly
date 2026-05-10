"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type StorySongDto, type SongSectionDto } from "@/lib/api";
import { ArrowLeft, Music, Wand2, FileText, LayoutList, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useCallback } from "react";
import { useDebounce } from "@/lib/utils";

export default function StoryboardPage() {
  const qc = useQueryClient();
  const { worldId, storyId, songId } = useParams<{
    worldId: string;
    storyId: string;
    songId: string;
  }>();

  const [subtitles, setSubtitles] = useState("");
  const [sections, setSections] = useState<SongSectionDto[]>([]);

  const songs = useQuery({
    queryKey: ["story-songs", storyId],
    queryFn: () =>
      api.get<StorySongDto[]>(`/api/worlds/${worldId}/stories/${storyId}/songs`),
  });
  const song = songs.data?.find((item) => item.id === songId);

  useEffect(() => {
    if (song) {
      setSubtitles(song.subtitles || "");
      setSections(song.sections || []);
    }
  }, [song]);

  const update = useMutation({
    mutationFn: (body: Partial<StorySongDto>) =>
      api.patch(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-songs", storyId] });
    },
  });

  const debouncedUpdate = useCallback(
    (body: Partial<StorySongDto>) => {
      update.mutate(body);
    },
    [update]
  );

  // We'll use a manual debounce since we need to handle two different fields
  useEffect(() => {
    if (!song) return;
    const hasSubtitlesChanged = (song.subtitles || "") !== subtitles;
    const hasSectionsChanged = JSON.stringify(song.sections || []) !== JSON.stringify(sections);

    if (hasSubtitlesChanged || hasSectionsChanged) {
      const timer = setTimeout(() => {
        debouncedUpdate({ subtitles, sections });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [subtitles, sections, song, debouncedUpdate]);

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

  const updateSection = (index: number, field: keyof SongSectionDto, value: any) => {
    const next = [...sections];
    next[index] = { ...next[index], [field]: value };
    setSections(next);
  };

  const updateClipIdea = (sIndex: number, cIndex: number, value: string) => {
    const next = [...sections];
    const nextClips = [...next[sIndex].clipIdeas];
    nextClips[cIndex] = value;
    next[sIndex] = { ...next[sIndex], clipIdeas: nextClips };
    setSections(next);
  };

  const formatSeconds = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href={`/worlds/${worldId}/stories/${storyId}`}
            className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to story
          </Link>
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[var(--color-muted)]">
            {update.isPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Check className="h-3 w-3" /> Saved
              </>
            )}
          </div>
        </div>
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
                  <FileText className="h-3 w-3" /> Subtitles (SRT)
                </h2>
                <textarea
                  value={subtitles}
                  onChange={(e) => setSubtitles(e.target.value)}
                  placeholder="No subtitles generated yet."
                  className="h-96 w-full overflow-auto rounded-[var(--radius-control)] border border-[var(--color-border)]/50 bg-[var(--color-surface-2)]/30 p-2 font-mono text-[11px] leading-relaxed text-[var(--color-fg)]/80 focus:border-[var(--color-accent)]/50 focus:outline-none"
                />
              </div>

              {/* Sections Display */}
              <div className="space-y-2">
                <h2 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
                  <LayoutList className="h-3 w-3" /> Song Sections
                </h2>
                <div className="h-96 space-y-3 overflow-auto pr-1">
                  {sections.length > 0 ? (
                    sections.map((section, i) => (
                      <div
                        key={i}
                        className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-border)]/50 bg-[var(--color-surface-2)]/30 p-2 text-xs"
                      >
                        <div className="flex items-center justify-between border-b border-[var(--color-border)]/30 pb-1 font-mono text-[10px] uppercase tracking-tighter">
                          <span className="text-[var(--color-accent)]">
                            {formatSeconds(section.startSeconds)} - {formatSeconds(section.endSeconds)}
                          </span>
                          <input
                            value={section.mood}
                            onChange={(e) => updateSection(i, "mood", e.target.value)}
                            className="bg-transparent text-right text-[var(--color-muted)] focus:outline-none"
                          />
                        </div>
                        <textarea
                          value={section.description}
                          onChange={(e) => updateSection(i, "description", e.target.value)}
                          className="h-16 w-full bg-transparent leading-tight text-[var(--color-fg)]/90 focus:outline-none"
                        />
                        <div className="space-y-1 border-t border-[var(--color-border)]/20 pt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-muted)]">Chars:</span>
                            <input
                              value={section.characters}
                              onChange={(e) => updateSection(i, "characters", e.target.value)}
                              className="flex-1 bg-transparent text-[10px] focus:outline-none"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-muted)]">Scenes:</span>
                            <input
                              value={section.scenes}
                              onChange={(e) => updateSection(i, "scenes", e.target.value)}
                              className="flex-1 bg-transparent text-[10px] focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-accent)]/80">
                            Clip Ideas:
                          </p>
                          {section.clipIdeas.map((clip, ci) => (
                            <div key={ci} className="flex gap-2 border-l-2 border-[var(--color-accent)]/30 pl-2">
                              <textarea
                                value={clip}
                                onChange={(e) => updateClipIdea(i, ci, e.target.value)}
                                className="h-8 flex-1 bg-transparent text-[10px] text-[var(--color-muted)] focus:outline-none"
                                rows={1}
                              />
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
