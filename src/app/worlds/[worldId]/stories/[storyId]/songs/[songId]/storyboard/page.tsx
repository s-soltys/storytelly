"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type StorySongDto, type SongSectionDto, type SongClipDto, type VideoDto } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { Loader2 } from "lucide-react";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { StoryboardToolbar } from "./StoryboardToolbar";
import { StoryboardPreview } from "./StoryboardPreview";
import { SectionCard } from "./SectionCard";

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
  const [clipGenStates, setClipGenStates] = useState<Record<string, { type: "image" | "video"; status: "pending" | "success" | "error"; error?: string }>>({});
  const [isPollingClips, setIsPollingClips] = useState(false);

  const songQuery = useQuery({
    queryKey: queryKeys.story.songs(songId),
    queryFn: () =>
      api.get<StorySongDto>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}`),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 45 * 60 * 1000,
  });
  const song = songQuery.data;

  const clipsQuery = useQuery({
    queryKey: queryKeys.story.songClips(songId),
    queryFn: () =>
      api.get<SongClipDto[]>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips`),
    enabled: !!song,
    staleTime: 30 * 60 * 1000,
    refetchInterval: isPollingClips ? 5000 : 45 * 60 * 1000,
  });
  const clips = clipsQuery.data || [];

  const generateBulkImages = useMutation({
    mutationFn: () =>
      api.post<{ count: number }>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips/generate-all-images`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.story.songClips(songId) });
    },
  });

  const generateSingleImage = useMutation({
    mutationFn: (clipId: string) =>
      api.post<{ url: string }>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips/${clipId}/generate-image`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.story.songClips(songId) });
    },
  });

  const generateVideo = useMutation({
    mutationFn: (clipId: string) =>
      api.post<VideoDto>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips/${clipId}/generate-video`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.story.songClips(songId) });
    },
  });

  const createClip = useMutation({
    mutationFn: (body: { sectionIndex: number; description: string }) =>
      api.post<SongClipDto>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.story.songClips(songId) });
    },
  });

  const updateClip = useMutation({
    mutationFn: ({ id, description }: { id: string; description: string }) =>
      api.patch<SongClipDto>(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips/${id}`, { description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.story.songClips(songId) });
    },
  });

  const deleteClip = useMutation({
    mutationFn: (id: string) =>
      api.del(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/clips/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.story.songClips(songId) });
    },
  });

  const update = useMutation({
    mutationFn: (body: Partial<StorySongDto>) =>
      api.patch(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.story.songs(songId) });
      qc.invalidateQueries({ queryKey: queryKeys.story.songs(storyId) });
    },
  });

  const analyze = useMutation({
    mutationFn: () =>
      api.post(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/analyze`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.story.songs(songId) });
      qc.invalidateQueries({ queryKey: queryKeys.story.songs(storyId) });
      qc.invalidateQueries({ queryKey: queryKeys.story.songClips(songId) });
    },
  });

  const transcribe = useMutation({
    mutationFn: () =>
      api.post(`/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/transcribe`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.story.songs(songId) });
      qc.invalidateQueries({ queryKey: queryKeys.story.songs(storyId) });
    },
  });

  useEffect(() => {
    if (song) {
      setSubtitles(song.subtitles || "");
      setSections(song.sections || []);
    }
  }, [song]);

  useEffect(() => {
    if (!song) return;
    const hasSubtitlesChanged = (song.subtitles || "") !== subtitles;
    const hasSectionsChanged = JSON.stringify(song.sections || []) !== JSON.stringify(sections);

    if (hasSubtitlesChanged || hasSectionsChanged) {
      const timer = setTimeout(() => {
        update.mutate({ subtitles, sections });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [subtitles, sections, song, update.mutate]);

  useEffect(() => {
    if (isPollingClips) {
      const clipsWithoutImages = clips.filter((c) => !c.images || c.images.length === 0);
      if (clipsWithoutImages.length === 0) {
        setIsPollingClips(false);
      }

      setClipGenStates((prev) => {
        let changed = false;
        const next = { ...prev };
        clips.forEach((c) => {
          const hasImage = c.images && c.images.length > 0;
          if (hasImage && next[c.id]?.status === "pending") {
            delete next[c.id];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [clips, isPollingClips]);

  const lastTimeRef = useRef(0);
  const handleTimeUpdate = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const time = e.currentTarget.currentTime;
    if (Math.abs(time - lastTimeRef.current) > 0.35 || time === 0 || Math.abs(time - lastTimeRef.current) > 1.0) {
      setCurrentTime(time);
      lastTimeRef.current = time;
    }
  }, []);

  const parseSRT = useCallback((srt: string) => {
    if (!srt) return [];
    const blocks = srt.trim().split(/\n\s*\n/);
    return blocks
      .map((block) => {
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
      })
      .filter(Boolean) as Array<{ start: number; end: number; text: string }>;
  }, []);

  const parsedSubtitles = useMemo(() => parseSRT(subtitles), [subtitles, parseSRT]);
  
  const activeSubtitle = useMemo(() => {
    return parsedSubtitles.find(
      (s) => currentTime >= s.start && currentTime < s.end
    );
  }, [parsedSubtitles, currentTime]);

  const activeSectionIndex = useMemo(() => {
    return sections.findIndex(
      (s) => currentTime >= s.startSeconds && currentTime < s.endSeconds
    );
  }, [sections, currentTime]);

  const handleAnalyze = useCallback(() => {
    if (
      song?.sections &&
      !confirm(
        "Warning: Re-generating the analysis will overwrite your current storyboard sections. This will also delete ALL existing clips, generated images, and videos associated with this song. This action cannot be undone. Are you sure you want to proceed?"
      )
    ) {
      return;
    }
    analyze.mutate();
  }, [song, analyze]);

  const handleTranscribe = useCallback(() => {
    if (song?.subtitles && !confirm("Re-generate transcription? Current subtitles will be overwritten.")) {
      return;
    }
    transcribe.mutate();
  }, [song, transcribe]);

  const handleUpdateSection = useCallback((index: number, field: keyof SongSectionDto, value: string) => {
    setSections((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const handleUpdateClipDescription = useCallback((clipId: string, description: string) => {
    updateClip.mutate({ id: clipId, description });
  }, [updateClip]);

  const handleDeleteClip = useCallback((clipId: string) => {
    if (confirm("Delete this clip and its generated videos? Existing image objects are not deleted.")) {
      deleteClip.mutate(clipId);
    }
  }, [deleteClip]);

  const handleAddClip = useCallback((sectionIndex: number) => {
    createClip.mutate({ sectionIndex, description: "New clip description..." });
  }, [createClip]);

  const handleGenerateImage = useCallback((clipId: string) => {
    setClipGenStates((prev) => ({
      ...prev,
      [clipId]: { type: "image", status: "pending" },
    }));
    generateSingleImage
      .mutateAsync(clipId)
      .then(() => {
        setClipGenStates((prev) => {
          const next = { ...prev };
          delete next[clipId];
          return next;
        });
      })
      .catch((err) => {
        setClipGenStates((prev) => ({
          ...prev,
          [clipId]: { type: "image", status: "error", error: err.message || "Generation failed" },
        }));
      });
  }, [generateSingleImage]);

  const handleGenerateVideo = useCallback((clipId: string) => {
    setClipGenStates((prev) => ({
      ...prev,
      [clipId]: { type: "video", status: "pending" },
    }));
    generateVideo
      .mutateAsync(clipId)
      .then(() => {
        setClipGenStates((prev) => {
          const next = { ...prev };
          delete next[clipId];
          return next;
        });
      })
      .catch((err) => {
        setClipGenStates((prev) => ({
          ...prev,
          [clipId]: { type: "video", status: "error", error: err.message || "Generation failed" },
        }));
      });
  }, [generateVideo]);

  const handleGenerateBulkImages = useCallback(() => {
    if (
      confirm(
        "This will generate images for all clips that don't have one yet. It may take a while and incur costs. Continue?"
      )
    ) {
      const clipsWithoutImages = clips.filter((c) => !c.images || c.images.length === 0);
      setClipGenStates((prev) => {
        const next = { ...prev };
        clipsWithoutImages.forEach((c) => {
          next[c.id] = { type: "image", status: "pending" };
        });
        return next;
      });
      setIsPollingClips(true);

      generateBulkImages
        .mutateAsync()
        .then(() => {
          // Polling will clear states when they are loaded from API
        })
        .catch((err) => {
          setClipGenStates((prev) => {
            const next = { ...prev };
            clipsWithoutImages.forEach((c) => {
              if (next[c.id]?.status === "pending") {
                next[c.id] = { type: "image", status: "error", error: err.message || "Bulk generation failed" };
              }
            });
            return next;
          });
          setIsPollingClips(false);
        });
    }
  }, [clips, generateBulkImages]);

  const handleExport = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const hasMedia = clips.some((c) => (c.images && c.images.length > 0) || (c.videos && c.videos.length > 0));
    if (!hasMedia) {
      e.preventDefault();
      alert("No storyboard media has been generated yet. Please generate images or videos first before exporting.");
    }
  }, [clips]);

  const handleMediaError = useCallback(() => {
    clipsQuery.refetch();
  }, [clipsQuery]);

  const isSaving = update.isPending;
  const isTranscribing = transcribe.isPending;
  const isAnalyzing = analyze.isPending;
  const isGeneratingBulkImages = generateBulkImages.isPending;
  const exportUrl = `/api/worlds/${worldId}/stories/${storyId}/songs/${songId}/storyboard/export`;

  return (
    <div className="space-y-6">
      {/* Top toolbar and stepper */}
      <StoryboardToolbar
        worldId={worldId}
        storyId={storyId}
        songId={songId}
        subtitles={subtitles}
        sections={sections}
        clips={clips}
        isSaving={isSaving}
        isTranscribing={isTranscribing}
        isAnalyzing={isAnalyzing}
        isGeneratingBulkImages={isGeneratingBulkImages}
        onTranscribe={handleTranscribe}
        onAnalyze={handleAnalyze}
        onGenerateBulkImages={handleGenerateBulkImages}
        onExport={handleExport}
        exportUrl={exportUrl}
      />

      {songQuery.isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-accent)]" />
          <p className="text-xs text-[var(--color-muted)] font-mono uppercase tracking-widest">Loading Storyboard...</p>
        </div>
      ) : song && !song.archived ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (Sticky Preview + Audio Controls + Subtitles) */}
          <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-4">
            <StoryboardPreview
              currentTime={currentTime}
              durationSeconds={song.lengthSeconds}
              sections={sections}
              clips={clips}
              activeSubtitle={activeSubtitle}
            />

            {/* Audio player card */}
            <div className="bg-[var(--color-surface)]/45 border border-[var(--color-border)]/45 rounded-xl p-3.5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest font-semibold text-[var(--color-fg)]">
                    {song.name}
                  </h3>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mt-0.5 font-mono">
                    {song.source} {song.lengthSeconds ? ` · ${song.lengthSeconds}s` : ""}
                  </p>
                </div>
              </div>
              <audio
                controls
                src={song.url}
                className="h-8 w-full accent-[var(--color-accent)] focus:outline-none"
                onTimeUpdate={handleTimeUpdate}
                preload="auto"
              />
            </div>

            {/* Subtitles Accordion */}
            <div className="rounded-xl border border-[var(--color-border)]/45 bg-[var(--color-surface)]/25 overflow-hidden transition-all duration-300">
              <button
                type="button"
                onClick={() => setIsSubtitlesOpen(!isSubtitlesOpen)}
                className="flex w-full items-center justify-between p-3 text-left hover:bg-[var(--color-surface-2)]/10 transition-colors"
                aria-expanded={isSubtitlesOpen}
                aria-controls="subtitles-panel"
              >
                <h2 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest font-semibold text-[var(--color-muted)]">
                  Subtitles (SRT)
                </h2>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)]/70">
                  {isSubtitlesOpen ? "Hide Editor" : "Open Editor"}
                </span>
              </button>
              <div
                id="subtitles-panel"
                className={`transition-all duration-300 ease-in-out ${
                  isSubtitlesOpen ? "max-h-64 border-t border-[var(--color-border)]/20 p-3" : "max-h-0 opacity-0 overflow-hidden"
                }`}
              >
                <textarea
                  value={subtitles}
                  onChange={(e) => setSubtitles(e.target.value)}
                  placeholder="No subtitles generated yet. Run transcription or type subtitles in SRT format here."
                  className="h-44 w-full bg-transparent font-mono text-[11px] leading-relaxed text-[var(--color-fg)]/80 focus:outline-none resize-none"
                  aria-label="SRT Subtitles editor"
                />
              </div>
            </div>

            {/* Errors display */}
            {(analyze.error || transcribe.error || generateVideo.error || generateSingleImage.error || generateBulkImages.error) && (
              <div className="p-3 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-xl text-[11px] text-[var(--color-danger)] space-y-1">
                <p className="font-semibold uppercase tracking-wider font-mono text-[9px]">Operation Failed</p>
                <p>
                  {((analyze.error || transcribe.error || generateVideo.error || generateSingleImage.error || generateBulkImages.error) as Error)?.message || "An error occurred."}
                </p>
              </div>
            )}
          </div>

          {/* Right Column (Scrollable vertical list of section cards) */}
          <div className="lg:col-span-7 space-y-5">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]/85 font-bold border-b border-[var(--color-border)]/20 pb-2">
              Storyboard Timeline
            </h2>
            <div className="space-y-4">
              {sections.length > 0 ? (
                sections.map((section, idx) => (
                  <SectionCard
                    key={idx}
                    section={section}
                    index={idx}
                    isActive={idx === activeSectionIndex}
                    clips={clips}
                    clipGenStates={clipGenStates}
                    onUpdateSection={handleUpdateSection}
                    onAddClip={handleAddClip}
                    onUpdateClipDescription={handleUpdateClipDescription}
                    onDeleteClip={handleDeleteClip}
                    onGenerateImage={handleGenerateImage}
                    onGenerateVideo={handleGenerateVideo}
                    onMediaError={handleMediaError}
                    isAddingClip={createClip.isPending && createClip.variables?.sectionIndex === idx}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-[var(--color-border)]/40 rounded-xl bg-[var(--color-surface)]/10">
                  <p className="text-[11px] text-[var(--color-muted)]/60 italic font-mono uppercase tracking-wider">
                    No sections analyzed yet
                  </p>
                  <p className="text-[10px] text-[var(--color-muted)]/40 mt-1 max-w-xs">
                    Run "Analyze Storyboard" in the pipeline stepper to generate sections.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-[var(--color-border)]/30 rounded-xl bg-[var(--color-surface)]/20">
          <p className="text-xs text-[var(--color-muted)] font-mono uppercase tracking-widest">
            This song is unavailable or archived
          </p>
        </div>
      )}
    </div>
  );
}
