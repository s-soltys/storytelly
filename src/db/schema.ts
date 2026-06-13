import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  index,
  integer,
  numeric,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const worlds = pgTable(
  "worlds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    artStyle: text("art_style").notNull(),
    description: text("description").notNull(),
    ...timestamps,
  },
  (t) => [
    index("worlds_created_idx").on(t.createdAt.desc()),
  ],
);

export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("characters_world_name_uniq").on(t.worldId, t.name)],
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("locations_world_name_uniq").on(t.worldId, t.name)],
);

export const stories = pgTable(
  "stories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Untitled story"),
    description: text("description").notNull(),
    lengthSeconds: integer("length_seconds").default(60).notNull(),
    lyrics: text("lyrics").default("").notNull(),
    selectedSongId: uuid("selected_song_id"),
    ...timestamps,
  },
  (t) => [
    index("stories_world_idx").on(t.worldId),
    check(
      "stories_length_seconds_check",
      sql`${t.lengthSeconds} % 15 = 0 AND ${t.lengthSeconds} BETWEEN 30 AND 180`,
    ),
  ],
);

export const storyCharacters = pgTable(
  "story_characters",
  {
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.characterId] })],
);

export const storyLocations = pgTable(
  "story_locations",
  {
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.locationId] })],
);

export const imageOwnerKinds = [
  "world_mood",
  "character",
  "location",
  "story_mood",
  "song_clip",
] as const;
export type ImageOwnerKind = (typeof imageOwnerKinds)[number];

export const images = pgTable(
  "images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    s3Key: text("s3_key").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    width: integer("width"),
    height: integer("height"),
    ownerKind: text("owner_kind", { enum: imageOwnerKinds }).notNull(),
    ownerId: uuid("owner_id").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("images_owner_idx").on(t.ownerKind, t.ownerId)],
);

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  openrouterApiKey: text("openrouter_api_key"),
  taskModels: jsonb("task_models")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  ...timestamps,
});

export type SongSection = {
  startSeconds: number;
  endSeconds: number;
  description: string;
  mood: string;
  characters: string;
  scenes: string;
};

export const storySongs = pgTable(
  "story_songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    source: text("source", { enum: ["generated", "uploaded"] }).notNull(),
    s3Key: text("s3_key").notNull(),
    mimeType: text("mime_type").notNull().default("audio/mpeg"),
    sizeBytes: integer("size_bytes"),
    lengthSeconds: integer("length_seconds"),
    /** Snapshot captured at generation time. Authoritative lyrics live on `stories.lyrics`. */
    lyrics: text("lyrics"),
    model: text("model"),
    prompt: text("prompt"),
    transcript: text("transcript"),
    subtitles: text("subtitles"),
    sections: jsonb("sections").$type<SongSection[]>(),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    archived: boolean("archived").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("story_songs_story_idx").on(t.storyId, t.createdAt.desc()),
    check(
      "story_songs_length_seconds_check",
      sql`${t.lengthSeconds} IS NULL OR ${t.source} = 'uploaded' OR (${t.lengthSeconds} % 15 = 0 AND ${t.lengthSeconds} BETWEEN 30 AND 180)`,
    ),
  ],
);

export const songClips = pgTable(
  "song_clips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    songId: uuid("song_id")
      .notNull()
      .references(() => storySongs.id, { onDelete: "cascade" }),
    sectionIndex: integer("section_index").notNull(),
    description: text("description").notNull(),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("song_clips_song_idx").on(t.songId, t.sectionIndex, t.position),
  ],
);

export const videoOwnerKinds = ["song_clip"] as const;
export type VideoOwnerKind = (typeof videoOwnerKinds)[number];

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    s3Key: text("s3_key").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    durationSeconds: integer("duration_seconds"),
    ownerKind: text("owner_kind", { enum: videoOwnerKinds }).notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => songClips.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("videos_owner_idx").on(t.ownerKind, t.ownerId)],
);

export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    storyId: uuid("story_id")
      .references(() => stories.id, { onDelete: "cascade" }),
    task: text("task").notNull(),
    model: text("model").notNull(),
    prompt: text("prompt"),
    response: text("response"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("ai_calls_world_idx").on(t.worldId),
    index("ai_calls_story_idx").on(t.storyId),
  ],
);

export const storyLyricsVersions = pgTable(
  "story_lyrics_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    lyrics: text("lyrics").notNull(),
    prompt: text("prompt"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("story_lyrics_versions_story_idx").on(t.storyId, t.createdAt.desc()),
  ],
);

export const storyMessages = pgTable(
  "story_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["system", "user", "assistant", "tool"] }).notNull(),
    content: text("content"),
    toolCalls: jsonb("tool_calls").$type<ToolCall[]>(),
    toolCallId: text("tool_call_id"), // if role is tool
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
        index("story_messages_story_idx").on(t.storyId, t.createdAt.asc()),
      ],
    );



export type World = typeof worlds.$inferSelect;
export type NewWorld = typeof worlds.$inferInsert;
export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type Story = typeof stories.$inferSelect;
export type NewStory = typeof stories.$inferInsert;
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type StorySong = typeof storySongs.$inferSelect;
export type NewStorySong = typeof storySongs.$inferInsert;
export type SongClip = typeof songClips.$inferSelect;
export type NewSongClip = typeof songClips.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type AiCall = typeof aiCalls.$inferSelect;
export type NewAiCall = typeof aiCalls.$inferInsert;
export type StoryLyricsVersion = typeof storyLyricsVersions.$inferSelect;
export type NewStoryLyricsVersion = typeof storyLyricsVersions.$inferInsert;
export type StoryMessage = typeof storyMessages.$inferSelect;
export type NewStoryMessage = typeof storyMessages.$inferInsert;
