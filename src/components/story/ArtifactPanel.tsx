"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { ImageIcon, Terminal, History, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ImageUploader } from "@/components/ImageUploader";
import { StorySongsPanel } from "@/components/StorySongsPanel";
import type { CharacterDto, LocationDto, StoryLyricsVersionDto } from "@/lib/api";
import { STORY_LENGTHS } from "@/lib/validation";

const quietField =
  "border-transparent bg-[var(--color-surface-2)]/35 shadow-none hover:bg-[var(--color-surface-2)]/55 focus:bg-[var(--color-surface)] focus:border-[var(--color-border)]";

interface ArtifactPanelProps {
  worldId: string;
  storyId: string;
  story: {
    name: string;
    description: string;
    characterIds: string[];
    locationIds: string[];
    lengthSeconds: number;
    lyrics: string;
  };
  characters: CharacterDto[];
  locations: LocationDto[];
  versions: StoryLyricsVersionDto[];
  moodImages: { id: string; url: string; s3Key: string; position: number }[];
  onStoryUpdate: (updates: {
    description?: string;
    characterIds?: string[];
    locationIds?: string[];
    lengthSeconds?: number;
    lyrics?: string;
  }) => void;
  saveState: "idle" | "saving" | "saved" | "error" | "invalid";
}

export function ArtifactPanel({
  worldId,
  storyId,
  story,
  characters,
  locations,
  versions,
  moodImages,

  onStoryUpdate,
  saveState,
}: ArtifactPanelProps) {
  const [activeTab, setActiveTab] = useState<"story" | "songs" | "assets">("story");
  const selectedChars = characters.filter((c) => story.characterIds.includes(c.id));
  const selectedLocs = locations.filter((l) => story.locationIds.includes(l.id));

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-8rem)]">
      {/* Tabs Header */}
      <div className="flex items-center gap-4 border-b border-[var(--color-border)]/50 pb-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab("story")}
          className={cn("font-mono text-[10px] uppercase tracking-widest transition cursor-pointer", activeTab === "story" ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)] pb-2 -mb-[9px]" : "text-[var(--color-muted)] hover:text-[var(--color-fg)] pb-2 -mb-[9px]")}
        >
          Story & Lyrics
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("songs")}
          className={cn("font-mono text-[10px] uppercase tracking-widest transition cursor-pointer", activeTab === "songs" ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)] pb-2 -mb-[9px]" : "text-[var(--color-muted)] hover:text-[var(--color-fg)] pb-2 -mb-[9px]")}
        >
          Songs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("assets")}
          className={cn("font-mono text-[10px] uppercase tracking-widest transition cursor-pointer", activeTab === "assets" ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)] pb-2 -mb-[9px]" : "text-[var(--color-muted)] hover:text-[var(--color-fg)] pb-2 -mb-[9px]")}
        >
          Assets & Logs
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-4" style={{ scrollbarWidth: "thin" }}>
        {activeTab === "story" && (
          <>
      {/* Story Brief */}
      <section className="rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/45 p-3 space-y-3">
        {characters.length > 0 && (
          <BriefRow label="Characters">
            <div className="flex flex-wrap gap-1">
              {characters.map((c) => {
                const isSelected = story.characterIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      const next = isSelected
                        ? story.characterIds.filter((id) => id !== c.id)
                        : [...story.characterIds, c.id];
                      onStoryUpdate({ characterIds: next });
                    }}
                    className={cn(
                      "rounded-[var(--radius-control)] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider cursor-pointer transition",
                      isSelected
                        ? "border-[var(--color-accent)]/40 bg-[color-mix(in_oklch,var(--color-accent)_10%,transparent)] text-[var(--color-accent)]"
                        : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)] bg-transparent",
                    )}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </BriefRow>
        )}

        {locations.length > 0 && (
          <BriefRow label="Locations">
            <div className="flex flex-wrap gap-1">
              {locations.map((l) => {
                const isSelected = story.locationIds.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      const next = isSelected
                        ? story.locationIds.filter((id) => id !== l.id)
                        : [...story.locationIds, l.id];
                      onStoryUpdate({ locationIds: next });
                    }}
                    className={cn(
                      "rounded-[var(--radius-control)] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider cursor-pointer transition",
                      isSelected
                        ? "border-[var(--color-border)] text-[var(--color-fg)] bg-[var(--color-surface-2)]/50"
                        : "border-[var(--color-border)]/50 text-[var(--color-muted)] hover:text-[var(--color-fg)] bg-transparent",
                    )}
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
          </BriefRow>
        )}

        <BriefRow label="Length">
          <select
            value={story.lengthSeconds || 60}
            onChange={(e) => onStoryUpdate({ lengthSeconds: Number(e.target.value) })}
            className="bg-transparent text-xs font-mono text-[var(--color-fg)] outline-none border-b border-transparent hover:border-[var(--color-border)] cursor-pointer pb-0.5"
          >
            {STORY_LENGTHS.map((s) => (
              <option key={s} value={s} className="bg-[var(--color-surface)]">
                {s}s
              </option>
            ))}
          </select>
        </BriefRow>

        <BriefRow label="Story">
          <Textarea
            value={story.description}
            onChange={(e) => onStoryUpdate({ description: e.target.value })}
            placeholder="What happens in this story? The AI will read this."
            className={`${quietField} min-h-24 text-xs leading-relaxed w-full resize-y`}
          />
        </BriefRow>
      </section>

      {/* Lyrics */}
      <section className="rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/45 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
            Lyrics Draft
          </h2>
          {saveState !== "idle" && (
            <span
              className={cn(
                "font-mono text-[9px] uppercase tracking-wider",
                saveState === "error" || saveState === "invalid"
                  ? "text-[var(--color-danger)]"
                  : "text-[var(--color-muted)]",
              )}
            >
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved." : saveState === "error" ? "Error saving." : "Invalid."}
            </span>
          )}
        </div>

        <Textarea
          rows={14}
          placeholder="Lyrics will appear here once generated via the conversation…"
          className={`${quietField} min-h-48 font-mono text-xs leading-relaxed`}
          value={story.lyrics}
          onChange={(e) => onStoryUpdate({ lyrics: e.target.value })}
        />

        {versions.length > 0 && (
          <LyricsHistoryPanel versions={versions} onRestore={(lyrics) => onStoryUpdate({ lyrics })} />
        )}
      </section>
          </>
        )}

        {activeTab === "assets" && (
          <>

      {/* Mood Images */}
      <section className="rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/55 p-3">
        <div className="mb-2 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-[var(--color-muted)]" />
          <h2 className="font-mono text-xs uppercase tracking-widest">Mood images</h2>
        </div>
        <ImageUploader ownerKind="story_mood" ownerId={storyId} initial={moodImages} compact />
      </section>

      {/* AI Logs link */}
      <section className="rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/55 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[var(--color-muted)]" />
          <h2 className="font-mono text-xs uppercase tracking-widest">System</h2>
        </div>
        <Link href={`/worlds/${worldId}/stories/${storyId}/logs`}>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 h-9 text-xs font-mono uppercase tracking-wider"
            size="sm"
          >
            <Terminal className="h-3.5 w-3.5" /> View AI Logs
          </Button>
        </Link>
      </section>
          </>
        )}

        {activeTab === "songs" && (
          <>
            {/* Songs Panel */}
            <StorySongsPanel worldId={worldId} storyId={storyId} />
          </>
        )}
      </div>
    </div>
  );
}

function BriefRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[5rem_minmax(0,1fr)] sm:items-start">
      <span className="pt-0.5 font-mono text-[9px] uppercase tracking-widest text-[var(--color-muted)]">
        {label}
      </span>
      <div>{children}</div>
    </div>
  );
}

function LyricsHistoryPanel({
  versions,
  onRestore,
}: {
  versions: StoryLyricsVersionDto[];
  onRestore: (lyrics: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--color-border)]/50 bg-[var(--color-surface-2)]/10 p-2.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left cursor-pointer transition hover:text-[var(--color-fg)]"
      >
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          <History className="h-3.5 w-3.5" /> Version History ({versions.length})
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-[var(--color-muted)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--color-muted)]" />
        )}
      </button>
      {open && (
        <div className="mt-2.5 max-h-40 overflow-y-auto space-y-1.5 pr-1" style={{ scrollbarWidth: "thin" }}>
          {versions.map((ver) => (
            <div
              key={ver.id}
              className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/30 pb-1.5 last:border-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[10px] text-[var(--color-fg)]">
                  {ver.prompt || "Manual Edit"}
                </p>
                <p className="text-[9px] text-[var(--color-muted)]">
                  {new Date(ver.createdAt).toLocaleString()}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[9px] uppercase font-mono tracking-wider text-[var(--color-accent)] hover:bg-[var(--color-surface-2)] cursor-pointer"
                onClick={() => {
                  if (confirm("Restore this version? Current lyrics will be overwritten.")) {
                    onRestore(ver.lyrics);
                  }
                }}
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
