import { describe, it, expect } from "vitest";
import {
  worldCreateSchema,
  characterCreateSchema,
  characterUpdateSchema,
  storyCreateSchema,
  songGenerateSchema,
  settingsUpdateSchema,
  STORY_LENGTHS,
} from "./validation";

describe("Validation Schemas", () => {
  describe("STORY_LENGTHS", () => {
    it("should contain multiples of 15 between 30 and 180", () => {
      expect(STORY_LENGTHS).toEqual([30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180]);
    });
  });

  describe("worldCreateSchema", () => {
    it("should validate correct world data", () => {
      const result = worldCreateSchema.safeParse({
        name: "Fantasy World",
        artStyle: "Water color",
        description: "A beautiful land with magic",
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty names or styles", () => {
      const result = worldCreateSchema.safeParse({
        name: "",
        artStyle: "Water color",
        description: "A beautiful land with magic",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe("Name is required");
      }
    });

    it("should enforce name max length of 120", () => {
      const result = worldCreateSchema.safeParse({
        name: "a".repeat(121),
        artStyle: "Watercolor",
        description: "Valid description",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("characterCreateSchema", () => {
    it("should validate correct character", () => {
      const result = characterCreateSchema.safeParse({
        name: "John",
        description: "A brave warrior",
      });
      expect(result.success).toBe(true);
    });

    it("should validate characterUpdateSchema", () => {
      // characterUpdateSchema allows description update but not name (name is immutable)
      const valid = characterUpdateSchema.safeParse({
        description: "An even braver warrior",
      });
      expect(valid.success).toBe(true);

      const invalid = characterUpdateSchema.safeParse({});
      expect(invalid.success).toBe(false);
    });
  });

  describe("storyCreateSchema", () => {
    const validUuid = "123e4567-e89b-12d3-a456-426614174000";

    it("should validate correct story data", () => {
      const result = storyCreateSchema.safeParse({
        name: "The Great Quest",
        description: "A story about a quest",
        characterIds: [validUuid],
        lengthSeconds: 60,
      });
      expect(result.success).toBe(true);
    });

    it("should enforce at least one character", () => {
      const result = storyCreateSchema.safeParse({
        name: "The Great Quest",
        description: "A story about a quest",
        characterIds: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe("Pick at least one character");
      }
    });

    it("should validate lengthSeconds restrictions", () => {
      const invalidLength = storyCreateSchema.safeParse({
        name: "The Great Quest",
        description: "A story about a quest",
        characterIds: [validUuid],
        lengthSeconds: 40, // not a multiple of 15
      });
      expect(invalidLength.success).toBe(false);

      const validLength = storyCreateSchema.safeParse({
        name: "The Great Quest",
        description: "A story about a quest",
        characterIds: [validUuid],
        lengthSeconds: 150, // valid multiple of 15
      });
      expect(validLength.success).toBe(true);
    });
  });

  describe("songGenerateSchema", () => {
    it("should validate lengthSeconds when provided", () => {
      const result = songGenerateSchema.safeParse({
        lengthSeconds: 90,
      });
      expect(result.success).toBe(true);

      const invalidResult = songGenerateSchema.safeParse({
        lengthSeconds: 50,
      });
      expect(invalidResult.success).toBe(false);
    });
  });

  describe("settingsUpdateSchema", () => {
    it("should validate settings keys and models", () => {
      const result = settingsUpdateSchema.safeParse({
        openrouterApiKey: "sk-or-...",
        taskModels: {
          lyrics: "google/gemini-flash-1.5",
        },
      });
      expect(result.success).toBe(true);
    });

    it("should allow null for openrouterApiKey to clear it", () => {
      const result = settingsUpdateSchema.safeParse({
        openrouterApiKey: null,
      });
      expect(result.success).toBe(true);
    });
  });
});
