"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type StorySongDto, type SongSectionDto, type SongClipDto, type VideoDto } from "@/lib/api";
import { ArrowLeft, Music, Wand2, FileAudio, FileText, LayoutList, Loader2, Check, ChevronDown, ChevronUp, Plus, Trash2, Image as ImageIcon, Video, Download } from "lucide-react";
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
  const [currentTime, setCurrentTime] = useState(0);

  const songs = useQuery({
    queryKey: ["story-songs", storyId],
    queryFn: () =>
      api.get<StorySongDto[]>(`/api/worlds/${worldId}/stories/${storyId}/songs`),
  });
  const song = songs.data?.find((item) => item.id === songId);

  const clipsQuery = useQuery({
    queryKey: ["story-songs", songId, "clips"],
    queryFn: () =>
      api.get<SongClipDto[]>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips`),
    enabled: !!song,
  });
  const clips = clipsQuery.data || [];

  const generateBulkImages = useMutation({
    mutationFn: () =>
      api.post<{ count: number }>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips/generate-all-images`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-songs", songId, "clips"] });
    },
  });

  const generateSingleImage = useMutation({
    mutationFn: (clipId: string) =>
      api.post<{ url: string }>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips/${clipId}/generate-image`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-songs", songId, "clips"] });
    },
  });

  const generateVideo = useMutation({
    mutationFn: (clipId: string) =>
      api.post<VideoDto>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips/${clipId}/generate-video`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-songs", songId, "clips"] });
    },
  });

  const createClip = useMutation({
    mutationFn: (body: { sectionIndex: number; description: string }) =>
      api.post<SongClipDto>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-songs", songId, "clips"] });
    },
  });

  const updateClip = useMutation({
    mutationFn: ({ id, description }: { id: string; description: string }) =>
      api.patch<SongClipDto>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips/${id}`, { description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-songs", songId, "clips"] });
    },
  });

  const deleteClip = useMutation({
    mutationFn: (id: string) =>
      api.del(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-songs", songId, "clips"] });
    },
  });

  useEffect(() => {
    if (song) {
      setSubtitles(song.subtitles || "");
      setSections(song.sections || []);
    }
  }, [song]);

  const activeSection = sections.find(
    (s) => currentTime >= s.startSeconds && currentTime < s.endSeconds
  );

  // Simple SRT parser to find active subtitle
  const parseSRT = (srt: string) => {
    const blocks = srt.trim().split(/\n\s*\n/);
    return blocks.map((block) => {
      const lines = block.split("\n");
      if (lines.length < 3) return null;
      const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
      if (!timeMatch) return null;

      const toSeconds = (t: string) => {
        const [h, m, s] = t.split(":");
        const [sec, ms] = s.split(",");
        return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(sec) + parseInt(ms) / 1000;
      };

      return {
        start: toSeconds(timeMatch[1]),
        end: toSeconds(timeMatch[2]),
        text: lines.slice(2).join(" "),
      };
    }).filter(Boolean) as Array<{ start: number; end: number; text: string }>;
  };

  const parsedSubtitles = parseSRT(subtitles);
  const activeSubtitle = parsedSubtitles.find(
    (s) => currentTime >= s.start && currentTime < s.end
  );

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

  const transcribe = useMutation({
    mutationFn: () =>
      api.post(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/transcribe`, {}),
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

  const handleTranscribe = () => {
    if (song?.subtitles && !confirm("Re-generate transcription? Current subtitles will be overwritten.")) {
      return;
    }
    transcribe.mutate();
  };

  const updateSection = (index: number, field: keyof SongSectionDto, value: any) => {
    const next = [...sections];
    next[index] = { ...next[index], [field]: value };
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
        <div className="flex items-center gap-2">
          {song && !song.archived && (
            <Button size="sm" variant="secondary" asChild>
              <a
                href={`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/storyboard/export`}
                download
              >
                <Download className="h-4 w-4" />
                Export ZIP
              </a>
            </Button>
          )}
          {clips.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              disabled={generateBulkImages.isPending}
              onClick={() => {
                if (confirm("This will generate images for all clips that don't have one yet. It may take a while and incur costs. Continue?")) {
                  generateBulkImages.mutate();
                }
              }}
            >
              {generateBulkImages.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ImageIcon className="h-4 w-4 mr-2" />
              )}
              {generateBulkImages.isPending ? "Generating..." : "Generate Missing Images"}
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={transcribe.isPending || !song}
            onClick={handleTranscribe}
          >
            <FileAudio className={`h-4 w-4 ${transcribe.isPending ? "animate-spin" : ""}`} />
            {transcribe.isPending ? "Transcribing..." : song?.subtitles ? "Re-transcribe" : "Transcribe Lyrics"}
          </Button>
          <Button
            size="sm"
            disabled={analyze.isPending || !song}
            onClick={handleAnalyze}
          >
            <Wand2 className={`h-4 w-4 ${analyze.isPending ? "animate-spin" : ""}`} />
            {analyze.isPending ? "Analyzing..." : song?.sections ? "Re-analyze Storyboard" : "Analyze Storyboard"}
          </Button>
        </div>
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

            {/* Interactive Preview */}
            <div className="relative aspect-video overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-accent)]/30 bg-black/60 shadow-inner flex flex-col justify-center items-center text-center group">
              {activeSection ? (
                <div className="px-8 space-y-3 animate-in fade-in zoom-in-95 duration-500">
                  <div className="inline-block px-3 py-1 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)] font-mono text-[11px] uppercase tracking-[0.2em] mb-2">
                    {formatSeconds(activeSection.startSeconds)} — {formatSeconds(activeSection.endSeconds)}
                  </div>
                  <p className="text-lg md:text-xl font-medium leading-relaxed max-w-2xl text-[var(--color-fg)]">
                    {activeSection.description}
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--color-muted)] font-mono">
                    Mood: {activeSection.mood}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 opacity-50">
                  <Music className="h-6 w-6 mx-auto text-[var(--color-muted)] mb-2" />
                  <p className="text-xs text-[var(--color-muted)] font-mono uppercase tracking-[0.2em]">
                    {currentTime === 0 ? "Press play to preview storyboard" : "Storyboard complete"}
                  </p>
                </div>
              )}

              {/* Subtle Progress bar overlay */}
              {song?.lengthSeconds && (
                <div className="absolute bottom-0 left-0 h-1 bg-[var(--color-accent)]/40 transition-all duration-100 ease-linear shadow-[0_0_10px_var(--color-accent)]" 
                     style={{ width: `${Math.min((currentTime / song.lengthSeconds) * 100, 100)}%` }} 
                />
              )}
            </div>

            <audio 
              controls 
              src={song.url} 
              className="h-8 w-full"
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />

            {(analyze.error || transcribe.error || generateVideo.error) && (
              <p className="text-xs text-[var(--color-danger)]">
                {((analyze.error || transcribe.error || generateVideo.error) as Error).message}
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
                        <div className="border-b border-[var(--color-border)]/30 pb-1.5 font-mono text-[10px] uppercase tracking-tighter">
                          <span className="text-[var(--color-accent)] font-bold">
                            {formatSeconds(section.startSeconds)} - {formatSeconds(section.endSeconds)}
                          </span>
                        </div>
                        <textarea
                          value={section.description}
                          onChange={(e) => updateSection(i, "description", e.target.value)}
                          placeholder="Section description..."
                          className="h-20 w-full bg-transparent leading-snug text-[var(--color-fg)]/90 focus:outline-none resize-none"
                        />
                        <div className="space-y-1.5 border-t border-[var(--color-border)]/20 pt-2 text-[10px]">
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 font-mono uppercase tracking-widest text-[var(--color-muted)]">Mood:</span>
                            <textarea
                              value={section.mood}
                              onChange={(e) => updateSection(i, "mood", e.target.value)}
                              className="flex-1 bg-transparent focus:outline-none resize-none"
                              rows={1}
                            />
                          </div>
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
                              Generated Clips:
                            </p>
                            <button
                              type="button"
                              onClick={() => createClip.mutate({ sectionIndex: i, description: "New clip description..." })}
                              className="text-[var(--color-accent)] hover:text-[var(--color-accent)]/80 transition-colors"
                              disabled={createClip.isPending}
                              title="Add new clip"
                            >
                              {createClip.isPending && createClip.variables?.sectionIndex === i ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                          <div className="space-y-3">
                            {clips.filter(c => c.sectionIndex === i).map((clip) => {
                              const clipImage = clip.images?.[0];
                              const clipVideo = clip.videos?.[0];
                              const isGeneratingImg = generateSingleImage.variables === clip.id && generateSingleImage.isPending;
                              const isGeneratingVid = generateVideo.variables === clip.id && generateVideo.isPending;

                              return (
                                <div key={clip.id} className="group flex flex-col gap-2 rounded bg-[var(--color-surface)]/40 p-2 text-[10px] border border-transparent hover:border-[var(--color-border)]/30 transition-all">
                                  <div className="flex items-start justify-between gap-2">
                                    <textarea
                                      defaultValue={clip.description}
                                      onBlur={(e) => {
                                        if (e.target.value !== clip.description) {
                                          updateClip.mutate({ id: clip.id, description: e.target.value });
                                        }
                                      }}
                                      placeholder="Clip description..."
                                      className="flex-1 bg-transparent leading-relaxed text-[var(--color-muted)] focus:text-[var(--color-fg)] focus:outline-none resize-none min-h-[40px] transition-colors"
                                      rows={2}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (confirm("Delete this clip and its generated videos? Existing image objects are not deleted.")) {
                                          deleteClip.mutate(clip.id);
                                        }
                                      }}
                                      className="opacity-0 group-hover:opacity-100 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-all p-1"
                                      disabled={deleteClip.isPending}
                                      title="Delete clip"
                                    >
                                      {deleteClip.isPending && deleteClip.variables === clip.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3 w-3" />
                                      )}
                                    </button>
                                  </div>
                                  
                                  {clipVideo ? (
                                    <div className="relative aspect-video w-full overflow-hidden rounded bg-black/50 group/vid shadow-sm">
                                      <video
                                        src={clipVideo.url}
                                        controls
                                        className="absolute inset-0 h-full w-full object-cover"
                                      />
                                      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover/vid:opacity-100">
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="h-7 px-2 font-mono text-[9px] uppercase tracking-widest bg-black/50 hover:bg-black/80 border-white/20"
                                          disabled={isGeneratingVid}
                                          onClick={() => generateVideo.mutate(clip.id)}
                                        >
                                          {isGeneratingVid ? (
                                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                          ) : (
                                            <Video className="h-3 w-3 mr-1" />
                                          )}
                                          Regen Video
                                        </Button>
                                      </div>
                                    </div>
                                  ) : clipImage ? (
                                    <div className="relative aspect-video w-full overflow-hidden rounded bg-black/50 group/img shadow-sm">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img 
                                        src={clipImage.url} 
                                        alt="Clip" 
                                        className="absolute inset-0 h-full w-full object-cover transition-transform group-hover/img:scale-105 duration-700" 
                                      />
                                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                        <Button
                                          size="sm"
                                          className="h-7 px-2 font-mono text-[9px] uppercase tracking-widest"
                                          disabled={isGeneratingVid}
                                          onClick={() => generateVideo.mutate(clip.id)}
                                        >
                                          {isGeneratingVid ? (
                                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                          ) : (
                                            <Video className="h-3 w-3 mr-1" />
                                          )}
                                          Generate Video
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="h-7 text-[9px] px-2 font-mono uppercase tracking-widest bg-black/40 hover:bg-black/80 border-white/20"
                                          disabled={isGeneratingImg}
                                          onClick={() => generateSingleImage.mutate(clip.id)}
                                        >
                                          {isGeneratingImg ? (
                                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                          ) : (
                                            <ImageIcon className="h-3 w-3 mr-1" />
                                          )}
                                          Regen Image
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="h-8 w-full text-[10px] font-mono uppercase tracking-widest"
                                      disabled={isGeneratingImg}
                                      onClick={() => generateSingleImage.mutate(clip.id)}
                                    >
                                      {isGeneratingImg ? (
                                        <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                      ) : (
                                        <ImageIcon className="h-3 w-3 mr-2" />
                                      )}
                                      Generate Image
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                            {clips.filter(c => c.sectionIndex === i).length === 0 && (
                              <p className="text-[10px] text-[var(--color-muted)] italic py-2 px-1">No clips generated.</p>
                            )}
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
