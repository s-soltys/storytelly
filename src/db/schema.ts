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

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const worlds = pgTable("worlds", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  artStyle: text("art_style").notNull(),
  description: text("description").notNull(),
  ...timestamps,
});

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
    ...timestamps,
  },
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
  clipIdeas: string[];
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
      sql`${t.lengthSeconds} IS NULL OR (${t.lengthSeconds} % 15 = 0 AND ${t.lengthSeconds} BETWEEN 30 AND 180)`,
    ),
  ],
);

export type World = typeof worlds.$inferSelect;
export type NewWorld = typeof worlds.$inferInsert;
export type Character = typeof characters.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Story = typeof stories.$inferSelect;
export type Image = typeof images.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type StorySong = typeof storySongs.$inferSelect;
