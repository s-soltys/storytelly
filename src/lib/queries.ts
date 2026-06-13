export const queryKeys = {
  worlds: {
    all: () => ["worlds"] as const,
  },
  world: {
    detail: (id: string) => ["world", id] as const,
    characters: (id: string) => ["characters", id] as const,
    locations: (id: string) => ["locations", id] as const,
    stories: (id: string) => ["stories", id] as const,
  },
  character: {
    detail: (id: string) => ["character", id] as const,
  },
  location: {
    detail: (id: string) => ["location", id] as const,
  },
  story: {
    detail: (id: string | null) => ["story", id] as const,
    logs: (id: string) => ["story-logs", id] as const,
    songs: (id: string | null) => ["story-songs", id] as const,
    songClips: (songId: string) => ["story-songs", songId, "clips"] as const,
    lyricsVersions: (id: string | null) => ["story-lyrics-versions", id] as const,
    messages: (id: string) => ["story-messages", id] as const,
  },
  settings: {
    all: () => ["settings"] as const,
  },
} as const;
