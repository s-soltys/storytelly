import { z } from "zod";

export const STORY_LENGTHS = Array.from(
  { length: (180 - 30) / 15 + 1 },
  (_, i) => 30 + i * 15,
);

export const worldCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  artStyle: z.string().trim().min(1, "Art style is required"),
  description: z.string().trim().min(1, "Description is required"),
});

export const worldUpdateSchema = worldCreateSchema.partial();

export const characterCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().min(1, "Description is required"),
});

export const characterUpdateSchema = z.object({
  description: z.string().trim().min(1, "Description is required"),
});

export const locationCreateSchema = characterCreateSchema;
export const locationUpdateSchema = characterUpdateSchema;

export const storyCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().min(1, "Description is required"),
  characterIds: z.array(z.string().uuid()).min(1, "Pick at least one character"),
  locationIds: z.array(z.string().uuid()).default([]),
  lengthSeconds: z
    .number()
    .int()
    .refine((v) => STORY_LENGTHS.includes(v), {
      message: "Length must be a multiple of 15 between 30 and 180",
    })
    .default(60),
  lyrics: z.string().trim().default(""),
  selectedSongId: z.union([z.string().uuid(), z.null()]).optional(),
});

export const storyUpdateSchema = storyCreateSchema.partial();

export const songGenerateSchema = z.object({
  lengthSeconds: z
    .number()
    .int()
    .refine((v) => STORY_LENGTHS.includes(v), {
      message: "Length must be a multiple of 15 between 30 and 180",
    })
    .optional(),
  lyrics: z.string().trim().optional(),
});

export const imageOwnerKindSchema = z.enum([
  "world_mood",
  "character",
  "location",
  "story_mood",
]);

export const settingsUpdateSchema = z.object({
  // null = clear; undefined = leave alone; string = set new value.
  openrouterApiKey: z
    .union([z.string().trim().min(1).max(400), z.null()])
    .optional(),
  taskModels: z.record(z.string().trim().min(1), z.string().trim().min(1)).optional(),
});

export type WorldCreate = z.infer<typeof worldCreateSchema>;
export type CharacterCreate = z.infer<typeof characterCreateSchema>;
export type LocationCreate = z.infer<typeof locationCreateSchema>;
export type StoryCreate = z.infer<typeof storyCreateSchema>;
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
