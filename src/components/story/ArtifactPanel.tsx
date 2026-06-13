"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { StorySongsPanel } from "@/components/StorySongsPanel";
import { StoryTab } from "@/components/story/StoryTab";
import { AssetsTab } from "@/components/story/AssetsTab";
import type { CharacterDto, LocationDto, StoryLyricsVersionDto, StorySongDto } from "@/lib/api";

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
    selectedSongId?: string | null;
  };
  characters: CharacterDto[];
  locations: LocationDto[];
  versions: StoryLyricsVersionDto[];
  songs: StorySongDto[];
  moodImages: { id: string; url: string; position: number }[];
  onStoryUpdate: (updates: {
    description?: string;
    characterIds?: string[];
    locationIds?: string[];
    lengthSeconds?: number;
    lyrics?: string;
    selectedSongId?: string;
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
  songs,
  moodImages,

  onStoryUpdate,
  saveState,
}: ArtifactPanelProps) {
  const [activeTab, setActiveTab] = useState<"story" | "songs" | "assets">("story");

  // Determine the featured song: either the selected one, or the newest one (songs are sorted newest-first by DB)
  const nonArchivedSongs = songs.filter(s => !s.archived);
  const featuredSong = story.selectedSongId 
    ? nonArchivedSongs.find(s => s.id === story.selectedSongId) || nonArchivedSongs[0]
    : nonArchivedSongs[0];

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-8rem)]">
      {featuredSong && (
        <div className="rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/45 p-3 flex-shrink-0 flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--color-accent)]/20 via-[var(--color-accent)] to-[var(--color-accent)]/20" />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-accent)] font-semibold flex items-center gap-1.5">
              ⭐ Featured Song
            </span>
            <span className="text-[10px] text-[var(--color-muted)] font-mono uppercase">
              {featuredSong.source === "generated" ? "Generated" : "Uploaded"}
            </span>
          </div>
          <p className="text-sm font-medium truncate">{featuredSong.name}</p>
          <audio controls src={featuredSong.url} className="w-full h-8 mt-1" />
        </div>
      )}

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
          <StoryTab
            characters={characters}
            locations={locations}
            story={story}
            versions={versions}
            saveState={saveState}
            onStoryUpdate={onStoryUpdate}
          />
        )}

        {activeTab === "assets" && (
          <AssetsTab
            worldId={worldId}
            storyId={storyId}
            moodImages={moodImages}
          />
        )}

        {activeTab === "songs" && (
          <StorySongsPanel
            worldId={worldId}
            storyId={storyId}
            songs={songs}
            selectedSongId={story.selectedSongId}
            onStoryUpdate={onStoryUpdate}
          />
        )}
      </div>
    </div>
  );
}
