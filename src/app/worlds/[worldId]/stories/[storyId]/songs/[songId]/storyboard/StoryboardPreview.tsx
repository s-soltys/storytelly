"use client";

import { useMemo } from "react";
import { type SongSectionDto, type SongClipDto } from "@/lib/api";
import { Music } from "lucide-react";

interface StoryboardPreviewProps {
  currentTime: number;
  durationSeconds: number | null;
  sections: SongSectionDto[];
  clips: SongClipDto[];
  activeSubtitle: { start: number; end: number; text: string } | undefined;
}

export function StoryboardPreview({
  currentTime,
  durationSeconds,
  sections,
  clips,
  activeSubtitle,
}: StoryboardPreviewProps) {
  // Find active section
  const activeSectionIndex = useMemo(() => {
    return sections.findIndex(
      (s) => currentTime >= s.startSeconds && currentTime < s.endSeconds
    );
  }, [sections, currentTime]);

  const activeSection = activeSectionIndex !== -1 ? sections[activeSectionIndex] : null;

  // Find active clip by interpolating time within the active section
  const activeClip = useMemo(() => {
    if (activeSectionIndex === -1 || !activeSection) return null;
    const sectionClips = clips.filter((c) => c.sectionIndex === activeSectionIndex);
    if (sectionClips.length === 0) return null;

    const sectionDuration = activeSection.endSeconds - activeSection.startSeconds;
    const offset = currentTime - activeSection.startSeconds;
    const clipDuration = sectionDuration / sectionClips.length;
    
    const clipIndex = Math.min(
      Math.floor(offset / clipDuration),
      sectionClips.length - 1
    );
    return sectionClips[clipIndex];
  }, [clips, activeSectionIndex, activeSection, currentTime]);

  const clipImage = activeClip?.images?.[0];
  const clipVideo = activeClip?.videos?.[0];

  const formatSeconds = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--color-accent)]/20 bg-black/80 shadow-2xl flex flex-col justify-center items-center text-center group transition-all duration-500 glow-accent/5">
      {/* 1. Video Playing */}
      {clipVideo ? (
        <video
          key={clipVideo.url}
          src={clipVideo.url}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover animate-in fade-in duration-500"
        />
      ) : /* 2. Image Display */
      clipImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={clipImage.url}
          src={clipImage.url}
          alt="Active storyboard clip"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover animate-in fade-in duration-500"
        />
      ) : /* 3. Fallback Section Text Card */
      activeSection ? (
        <div className="px-8 py-6 space-y-3 z-10 select-none animate-in fade-in zoom-in-95 duration-500 bg-gradient-to-t from-black/40 via-transparent to-black/20 absolute inset-0 flex flex-col justify-center items-center">
          <div className="inline-block px-3 py-1 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)] font-mono text-[10px] uppercase tracking-[0.2em] mb-1">
            {formatSeconds(activeSection.startSeconds)} — {formatSeconds(activeSection.endSeconds)}
          </div>
          <p className="text-base md:text-lg font-medium leading-relaxed max-w-lg text-[var(--color-fg)]">
            {activeSection.description}
          </p>
          {activeSection.mood && (
            <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-muted)] font-mono">
              Mood: {activeSection.mood}
            </p>
          )}
        </div>
      ) : (
        /* 4. Default State before playing */
        <div className="space-y-2 opacity-60 z-10 px-4">
          <Music className="h-7 w-7 mx-auto text-[var(--color-accent)] mb-2 animate-pulse" />
          <p className="text-xs text-[var(--color-fg)] font-mono uppercase tracking-[0.2em]">
            {currentTime === 0 ? "Press play to preview storyboard" : "Storyboard complete"}
          </p>
          <p className="text-[10px] text-[var(--color-muted)] font-sans">
            Clip media and subtitles will sync with audio playback
          </p>
        </div>
      )}

      {/* Subtitles Overlay */}
      {activeSubtitle && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur-[1px] px-3.5 py-1.5 rounded-md text-[var(--color-fg)] text-xs md:text-sm font-sans tracking-wide max-w-[90%] text-center pointer-events-none border border-white/10 shadow-lg z-20 transition-all">
          {activeSubtitle.text}
        </div>
      )}

      {/* Progress bar overlay at the very bottom */}
      {durationSeconds && (
        <div
          className="absolute bottom-0 left-0 h-1 bg-[var(--color-accent)]/70 transition-all duration-300 ease-linear shadow-[0_0_10px_var(--color-accent)] z-20"
          style={{ width: `${Math.min((currentTime / durationSeconds) * 100, 100)}%` }}
        />
      )}
    </div>
  );
}
