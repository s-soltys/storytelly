"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type StorySongDto, type SongSectionDto } from "@/lib/api";
import { ArrowLeft, Music, Wand2, FileText, LayoutList, Loader2, Check, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useCallback } from "react";

export default function StoryboardPage() {
  const qc = useQueryClient();
  const { worldId, storyId, songId } = useParams<{
    worldId: string;
    storyId: string;
    songId: string;
  }>();

  const [subtitles, setSubtitles] = useState("");
  const [sections, setSections] = useState<SongSectionDto[]>([]);
  const [isSubtitlesOpen, setIsSubtitlesOpen] = useState(false);

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

  const addClipIdea = (sIndex: number) => {
    const next = [...sections];
    next[sIndex] = { ...next[sIndex], clipIdeas: [...next[sIndex].clipIdeas, "New clip idea..."] };
    setSections(next);
  };

  const deleteClipIdea = (sIndex: number, cIndex: number) => {
    const next = [...sections];
    const nextClips = [...next[sIndex].clipIdeas];
    nextClips.splice(cIndex, 1);
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
          <div className="space-y-6">
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

            {/* Subtitles Accordion */}
            <div className="rounded-[var(--radius-control)] border border-[var(--color-border)]/50 bg-[var(--color-surface-2)]/20">
              <button
                type="button"
                onClick={() => setIsSubtitlesOpen(!isSubtitlesOpen)}
                className="flex w-full items-center justify-between p-2 text-left"
              >
                <h2 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
                  <FileText className="h-3 w-3" /> Subtitles (SRT)
                </h2>
                {isSubtitlesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {isSubtitlesOpen && (
                <div className="border-t border-[var(--color-border)]/30 p-2">
                  <textarea
                    value={subtitles}
                    onChange={(e) => setSubtitles(e.target.value)}
                    placeholder="No subtitles generated yet."
                    className="h-48 w-full overflow-auto bg-transparent font-mono text-[11px] leading-relaxed text-[var(--color-fg)]/80 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Timeline Sections */}
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
                <LayoutList className="h-3 w-3" /> Storyboard Timeline
              </h2>
              <div className="relative overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-[var(--color-border)]/50">
                <div className="flex gap-4 min-w-max px-1">
                  {sections.length > 0 ? (
                    sections.map((section, i) => (
                      <div
                        key={i}
                        className="w-80 shrink-0 space-y-3 rounded-[var(--radius-control)] border border-[var(--color-border)]/50 bg-[var(--color-surface-2)]/30 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between border-b border-[var(--color-border)]/30 pb-1.5 font-mono text-[10px] uppercase tracking-tighter">
                          <span className="text-[var(--color-accent)] font-bold">
                            {formatSeconds(section.startSeconds)} - {formatSeconds(section.endSeconds)}
                          </span>
                          <input
                            value={section.mood}
                            onChange={(e) => updateSection(i, "mood", e.target.value)}
                            placeholder="Mood..."
                            className="bg-transparent text-right text-[var(--color-muted)] focus:outline-none w-24"
                          />
                        </div>
                        <textarea
                          value={section.description}
                          onChange={(e) => updateSection(i, "description", e.target.value)}
                          placeholder="Section description..."
                          className="h-20 w-full bg-transparent leading-snug text-[var(--color-fg)]/90 focus:outline-none resize-none"
                        />
                        <div className="space-y-1.5 border-t border-[var(--color-border)]/20 pt-2 text-[10px]">
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 font-mono uppercase tracking-widest text-[var(--color-muted)]">Chars:</span>
                            <textarea
                              value={section.characters}
                              onChange={(e) => updateSection(i, "characters", e.target.value)}
                              className="flex-1 bg-transparent focus:outline-none resize-none"
                              rows={1}
                            />
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 font-mono uppercase tracking-widest text-[var(--color-muted)]">Scenes:</span>
                            <textarea
                              value={section.scenes}
                              onChange={(e) => updateSection(i, "scenes", e.target.value)}
                              className="flex-1 bg-transparent focus:outline-none resize-none"
                              rows={1}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between border-t border-[var(--color-border)]/10 pt-2">
                            <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-accent)]/80">
                              Clip Ideas:
                            </p>
                            <button
                              type="button"
                              onClick={() => addClipIdea(i)}
                              className="text-[var(--color-accent)] hover:text-[var(--color-accent)]/80"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="space-y-2">
                            {section.clipIdeas.map((clip, ci) => (
                              <div key={ci} className="flex gap-2 border-l-2 border-[var(--color-accent)]/30 pl-2 group">
                                <textarea
                                  value={clip}
                                  onChange={(e) => updateClipIdea(i, ci, e.target.value)}
                                  className="h-10 flex-1 bg-transparent text-[10px] text-[var(--color-muted)] focus:outline-none resize-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => deleteClipIdea(i, ci)}
                                  className="opacity-0 group-hover:opacity-100 text-[var(--color-danger)] hover:text-[var(--color-danger)]/80 transition-opacity"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-[var(--color-muted)] italic py-8">
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
