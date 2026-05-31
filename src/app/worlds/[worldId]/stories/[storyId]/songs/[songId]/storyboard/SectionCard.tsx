"use client";

import React, { useState, useEffect } from "react";
import { type SongSectionDto, type SongClipDto } from "@/lib/api";
import { Plus, Loader2 } from "lucide-react";
import { ClipCard } from "./ClipCard";

interface SectionCardProps {
  section: SongSectionDto;
  index: number;
  isActive: boolean;
  clips: SongClipDto[];
  clipGenStates: Record<string, { type: "image" | "video"; status: "pending" | "success" | "error"; error?: string }>;
  onUpdateSection: (index: number, field: keyof SongSectionDto, value: any) => void;
  onAddClip: (index: number) => void;
  onUpdateClipDescription: (clipId: string, desc: string) => void;
  onDeleteClip: (clipId: string) => void;
  onGenerateImage: (clipId: string) => void;
  onGenerateVideo: (clipId: string) => void;
  onMediaError: () => void;
  isAddingClip: boolean;
}

export const SectionCard = React.memo(function SectionCard({
  section,
  index,
  isActive,
  clips,
  clipGenStates,
  onUpdateSection,
  onAddClip,
  onUpdateClipDescription,
  onDeleteClip,
  onGenerateImage,
  onGenerateVideo,
  onMediaError,
  isAddingClip,
}: SectionCardProps) {
  const [description, setDescription] = useState(section.description);
  const [mood, setMood] = useState(section.mood);
  const [characters, setCharacters] = useState(section.characters);
  const [scenes, setScenes] = useState(section.scenes);

  useEffect(() => {
    setDescription(section.description);
    setMood(section.mood);
    setCharacters(section.characters);
    setScenes(section.scenes);
  }, [section.description, section.mood, section.characters, section.scenes]);

  const formatSeconds = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleBlur = (field: keyof SongSectionDto, localVal: string, originalVal: string) => {
    if (localVal !== originalVal) {
      onUpdateSection(index, field, localVal);
    }
  };

  return (
    <div
      className={`space-y-4 rounded-xl border p-4 text-xs transition-all duration-300 ${
        isActive
          ? "border-[var(--color-accent)] bg-[var(--color-surface-2)]/60 shadow-lg shadow-[var(--color-accent)]/5"
          : "border-[var(--color-border)]/40 bg-[var(--color-surface)]/25 hover:bg-[var(--color-surface-2)]/10"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)]/20 pb-2">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight uppercase ${
              isActive
                ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                : "bg-[var(--color-surface-2)]/80 text-[var(--color-muted)]"
            }`}
          >
            Section {index + 1}
          </span>
          <span className="font-mono text-[10px] font-semibold text-[var(--color-muted)]/80">
            {formatSeconds(section.startSeconds)} — {formatSeconds(section.endSeconds)}
          </span>
        </div>
      </div>

      {/* Editable Fields Layout: Two column layout on larger viewports */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Description Field */}
        <div className="md:col-span-6 space-y-1">
          <label className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-muted)]">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => handleBlur("description", description, section.description)}
            placeholder="Section description..."
            className="w-full h-24 bg-[var(--color-surface-2)]/30 rounded border border-[var(--color-border)]/20 p-2 text-[11px] leading-relaxed text-[var(--color-fg)] placeholder-[var(--color-muted)]/40 focus:outline-none focus:border-[var(--color-accent)]/50 resize-none transition-colors"
          />
        </div>

        {/* Technical Prompts Fields */}
        <div className="md:col-span-6 grid grid-cols-1 gap-2.5">
          <div className="space-y-1">
            <label className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-muted)]">Mood</label>
            <input
              type="text"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              onBlur={() => handleBlur("mood", mood, section.mood)}
              placeholder="E.g., cinematic, dark, warm, neon-lit..."
              className="w-full bg-[var(--color-surface-2)]/30 rounded border border-[var(--color-border)]/20 px-2 py-1.5 text-[11px] text-[var(--color-fg)] placeholder-[var(--color-muted)]/40 focus:outline-none focus:border-[var(--color-accent)]/50 transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-muted)]">Characters</label>
            <input
              type="text"
              value={characters}
              onChange={(e) => setCharacters(e.target.value)}
              onBlur={() => handleBlur("characters", characters, section.characters)}
              placeholder="Characters in this section..."
              className="w-full bg-[var(--color-surface-2)]/30 rounded border border-[var(--color-border)]/20 px-2 py-1.5 text-[11px] text-[var(--color-fg)] placeholder-[var(--color-muted)]/40 focus:outline-none focus:border-[var(--color-accent)]/50 transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-muted)]">Scenes / Locations</label>
            <input
              type="text"
              value={scenes}
              onChange={(e) => setScenes(e.target.value)}
              onBlur={() => handleBlur("scenes", scenes, section.scenes)}
              placeholder="Background settings or camera movement..."
              className="w-full bg-[var(--color-surface-2)]/30 rounded border border-[var(--color-border)]/20 px-2 py-1.5 text-[11px] text-[var(--color-fg)] placeholder-[var(--color-muted)]/40 focus:outline-none focus:border-[var(--color-accent)]/50 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Generated Clips */}
      <div className="space-y-2 border-t border-[var(--color-border)]/10 pt-3">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-accent)]/90 font-semibold">
            Section Clips
          </p>
          <button
            type="button"
            onClick={() => onAddClip(index)}
            className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-[var(--color-accent)] hover:text-[var(--color-accent)]/80 transition-colors px-1 py-0.5"
            disabled={isAddingClip}
            title="Add new clip"
            aria-label="Add new clip"
          >
            {isAddingClip ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Plus className="h-3 w-3" />
                Add Clip
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {clips.length > 0 ? (
            clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                genState={clipGenStates[clip.id]}
                onUpdateDescription={onUpdateClipDescription}
                onDelete={onDeleteClip}
                onGenerateImage={onGenerateImage}
                onGenerateVideo={onGenerateVideo}
                onMediaError={onMediaError}
              />
            ))
          ) : (
            <p className="col-span-full text-[10px] text-[var(--color-muted)]/60 italic py-2 px-1 text-center bg-[var(--color-surface-2)]/10 rounded border border-[var(--color-border)]/10 border-dashed">
              No clips for this section. Click "Add Clip" to add one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
});
