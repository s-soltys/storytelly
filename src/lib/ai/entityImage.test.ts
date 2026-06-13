import { vi, describe, it, expect, beforeEach } from "vitest";

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockDbDelete = vi.hoisted(() => vi.fn());
const mockPutObject = vi.hoisted(() => vi.fn());
const mockLoadImages = vi.hoisted(() => vi.fn());
const mockImageToDataUrl = vi.hoisted(() => vi.fn());
const mockCallOpenRouter = vi.hoisted(() => vi.fn());
const mockCallOpenRouterVideo = vi.hoisted(() => vi.fn());
const mockIsOpenRouterImageSafetyError = vi.hoisted(() => vi.fn());
const mockSerializePromptForStorage = vi.hoisted(() => vi.fn(() => '{"elided": true}'));

vi.mock("@/db/client", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    delete: mockDbDelete,
  },
}));

vi.mock("@/lib/storage", () => ({
  putObject: mockPutObject,
  getObjectBuffer: vi.fn(),
}));

vi.mock("@/lib/server", () => ({
  loadImages: mockLoadImages,
}));

vi.mock("@/lib/ai/images", () => ({
  imageToDataUrl: mockImageToDataUrl,
  MAX_DATA_URL_IMAGE_BYTES: 4_000_000,
}));

vi.mock("@/lib/ai/openrouter", () => ({
  callOpenRouter: mockCallOpenRouter,
  callOpenRouterVideo: mockCallOpenRouterVideo,
  isOpenRouterImageSafetyError: mockIsOpenRouterImageSafetyError,
}));

vi.mock("@/lib/ai/tasks", () => ({
  getModelForTask: vi.fn(() => "test-model"),
  getVideoModelConfig: vi.fn(() => ({
    durations: [5, 10],
    defaultDuration: 5,
    aspectRatio: "16:9",
    resolution: "720p",
  })),
  chooseVideoDuration: vi.fn(() => 5),
}));

vi.mock("@/lib/ai/song", () => ({
  serializePromptForStorage: mockSerializePromptForStorage,
}));

import { extensionFromMime, saveAiImage, saveAiVideo, generateEntityImage, generateClipImage, generateAllClipImages, generateClipVideo } from "./entityImage";

describe("Entity Image utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extensionFromMime", () => {
    it("returns fallback for null mime", () => {
      expect(extensionFromMime(null, "mp4")).toBe("mp4");
    });

    it("returns mp4 for video/mp4", () => {
      expect(extensionFromMime("video/mp4", "mp4")).toBe("mp4");
    });

    it("returns mp4 for application/mp4", () => {
      expect(extensionFromMime("application/mp4", "mp4")).toBe("mp4");
    });

    it("returns webm for video/webm", () => {
      expect(extensionFromMime("video/webm", "mp4")).toBe("webm");
    });

    it("returns mov for video/quicktime", () => {
      expect(extensionFromMime("video/quicktime", "mp4")).toBe("mov");
    });

    it("handles mime with params", () => {
      expect(extensionFromMime("video/mp4; codecs=avc1", "mp4")).toBe("mp4");
    });
  });

  describe("saveAiImage", () => {
    it("saves an image from a data URL", async () => {
      const whereMaxMock = vi.fn().mockResolvedValue([{ value: 3 }]);
      const fromMaxMock = vi.fn().mockReturnValue({ where: whereMaxMock });
      mockDbSelect.mockImplementation((args: any) => {
        if (args && typeof args === "object" && "value" in args) {
          return { from: fromMaxMock };
        }
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn() };
      });

      const returningMock = vi.fn().mockResolvedValue([{ id: "img-1" }]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
      mockDbInsert.mockReturnValue({ values: valuesMock });

      const result = await saveAiImage("data:image/png;base64,iVBORw0KGgo=", "song_clip", "clip-1");

      expect(result).toEqual({ id: "img-1" });
      expect(mockPutObject).toHaveBeenCalledOnce();
      expect(valuesMock).toHaveBeenCalledOnce();
    });

    it("throws for invalid data URL format", async () => {
      await expect(saveAiImage("data:invalid-format", "character", "char-1")).rejects.toThrow(
        "Invalid data URL format from AI",
      );
    });

    it("downloads and saves an image from a HTTP URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(5),
        headers: { get: () => "image/webp" },
      });
      vi.stubGlobal("fetch", mockFetch);

      const whereMaxMock = vi.fn().mockResolvedValue([{ value: null }]);
      const fromMaxMock = vi.fn().mockReturnValue({ where: whereMaxMock });
      mockDbSelect.mockImplementation((args: any) => {
        if (args && typeof args === "object" && "value" in args) {
          return { from: fromMaxMock };
        }
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn() };
      });

      const returningMock = vi.fn().mockResolvedValue([{ id: "img-2" }]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
      mockDbInsert.mockReturnValue({ values: valuesMock });

      const result = await saveAiImage("https://example.com/image.webp", "character", "char-1");
      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith("https://example.com/image.webp");
      expect(mockPutObject).toHaveBeenCalledOnce();
    });

    it("throws when HTTP fetch fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 404 }),
      );

      const whereMaxMock = vi.fn().mockResolvedValue([{ value: null }]);
      mockDbSelect.mockReturnValue({ from: vi.fn().mockReturnValue({ where: whereMaxMock }) });

      await expect(
        saveAiImage("https://example.com/404.png", "location", "loc-1"),
      ).rejects.toThrow("Failed to download image from https://example.com/404.png");
    });
  });

  describe("saveAiVideo", () => {
    it("saves a video and performs db query for max position", async () => {
      const whereMaxMock = vi.fn().mockResolvedValue([{ value: 2 }]);
      const fromMaxMock = vi.fn().mockReturnValue({ where: whereMaxMock });
      mockDbSelect.mockImplementation((args: any) => {
        if (args && typeof args === "object" && "value" in args) {
          return { from: fromMaxMock };
        }
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn() };
      });

      const returningMock = vi.fn().mockResolvedValue([{ id: "vid-1", s3Key: "clips/clip-1/videos/uuid.mp4" }]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
      mockDbInsert.mockReturnValue({ values: valuesMock });

      const result = await saveAiVideo({
        buffer: Buffer.from("video-data"),
        mimeType: "video/mp4",
        durationSeconds: 5,
        ownerKind: "song_clip",
        ownerId: "clip-1",
      });

      expect(result).toEqual({ id: "vid-1", s3Key: "clips/clip-1/videos/uuid.mp4" });
      expect(mockPutObject).toHaveBeenCalledOnce();
      expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({
        s3Key: expect.stringContaining("clips/clip-1/videos/"),
        mimeType: "video/mp4",
        durationSeconds: 5,
        sizeBytes: 10,
        position: 3,
      }));
    });
  });

  describe("generateEntityImage", () => {
    it("throws if world is not found", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      });

      await expect(
        generateEntityImage({ worldId: "bad-world", entityId: "e1", kind: "character" }),
      ).rejects.toThrow("World not found");
    });

    it("throws if entity is not found", async () => {
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "w1" }]) })) };
          case 2: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) };
          default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) };
        }
      });

      await expect(
        generateEntityImage({ worldId: "w1", entityId: "missing", kind: "character" }),
      ).rejects.toThrow("Character not found");
    });

    it("throws if settings api key is missing", async () => {
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "w1", name: "Test", artStyle: "Cyberpunk", description: "A world" }]) })) };
          case 2: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "c1", name: "Aiko", description: "Hacker" }]) })) };
          case 3: return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "" }]) })) };
          default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), orderBy: vi.fn().mockResolvedValue([]) })) };
        }
      });
      mockLoadImages.mockResolvedValue([]);

      await expect(
        generateEntityImage({ worldId: "w1", entityId: "c1", kind: "character" }),
      ).rejects.toThrow("OpenRouter API key missing");
    });

    it("successfully generates a character image and returns URL", async () => {
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "w1", name: "Test World", artStyle: "Cyberpunk", description: "A world" }]) })) };
          case 2: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "c1", name: "Aiko", description: "Hacker" }]) })) };
          case 3: return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "test-key" }]) })) };
          default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), orderBy: vi.fn().mockResolvedValue([]) })) };
        }
      });

      mockLoadImages.mockResolvedValue([
        { id: "img1", s3Key: "world/w1/mood.png", url: "https://presigned.url/mood.png", position: 0, mimeType: "image/png", width: 800, height: 600, ownerId: "w1" },
      ]);
      mockImageToDataUrl.mockResolvedValue("data:image/png;base64,mockdata");
      mockCallOpenRouter.mockResolvedValue({
        text: "",
        images: ["https://generated.image/char.png"],
        usage: { promptTokens: 10, completionTokens: 20, costUsd: 0.002 },
      });
      mockDbInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

      const result = await generateEntityImage({ worldId: "w1", entityId: "c1", kind: "character" });

      expect(result).toBe("https://generated.image/char.png");
      expect(mockCallOpenRouter).toHaveBeenCalledOnce();
      expect(mockDbInsert).toHaveBeenCalledOnce();
    });

    it("successfully generates a location image and returns URL", async () => {
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "w1", name: "Test World", artStyle: "Fantasy", description: "A world" }]) })) };
          case 2: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "l1", name: "Forest", description: "Dark woods" }]) })) };
          case 3: return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "test-key" }]) })) };
          default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), orderBy: vi.fn().mockResolvedValue([]) })) };
        }
      });

      mockLoadImages.mockResolvedValue([]);
      mockCallOpenRouter.mockResolvedValue({
        text: "",
        images: ["https://generated.image/loc.png"],
        usage: { promptTokens: 10, completionTokens: 20, costUsd: 0.002 },
      });
      mockDbInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

      const result = await generateEntityImage({ worldId: "w1", entityId: "l1", kind: "location" });

      expect(result).toBe("https://generated.image/loc.png");
    });

    it("throws when no mood images are configured but AI succeeds", async () => {
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "w1", name: "Test", artStyle: "S", description: "D" }]) })) };
          case 2: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "c1", name: "Aiko", description: "Hacker" }]) })) };
          case 3: return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "key" }]) })) };
          default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), orderBy: vi.fn().mockResolvedValue([]) })) };
        }
      });
      mockLoadImages.mockResolvedValue([]);
      mockCallOpenRouter.mockResolvedValue({
        text: "",
        images: ["https://generated.image/img.png"],
        usage: { promptTokens: 5, completionTokens: 5, costUsd: 0.001 },
      });
      mockDbInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

      const result = await generateEntityImage({ worldId: "w1", entityId: "c1", kind: "character" });
      expect(result).toBe("https://generated.image/img.png");
    });

    it("throws when AI fails to generate an image", async () => {
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "w1", name: "Test", artStyle: "S", description: "D" }]) })) };
          case 2: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "c1", name: "Aiko", description: "Hacker" }]) })) };
          case 3: return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "key" }]) })) };
          default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), orderBy: vi.fn().mockResolvedValue([]) })) };
        }
      });

      mockLoadImages.mockResolvedValue([]);
      mockCallOpenRouter.mockResolvedValue({
        text: "No image generated",
        images: [],
        usage: { promptTokens: 5, completionTokens: 5, costUsd: 0.001 },
      });
      mockDbInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

      await expect(
        generateEntityImage({ worldId: "w1", entityId: "c1", kind: "character" }),
      ).rejects.toThrow("AI failed to generate an image.");
    });
  });

  describe("generateClipImage", () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it("throws GenerationError if world not found", async () => {
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "key" }]) })) };
        if (callCount === 2) return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) };
        return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) };
      });

      await expect(
        generateClipImage({ worldId: "bad", storyId: "s1", songId: "song1", clipId: "c1" }),
      ).rejects.toThrow("World not found");
    });

    it("throws GenerationError if song not found", async () => {
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "key" }]) })) };
          case 2: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "w1" }]) })) };
          case 3: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "s1" }]) })) };
          case 4: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) };
          default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) };
        }
      });

      await expect(
        generateClipImage({ worldId: "w1", storyId: "s1", songId: "missing", clipId: "c1" }),
      ).rejects.toThrow("Song not found");
    });

    it("throws GenerationError if parent section not found for clip", async () => {
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "key" }]) })) };
          case 2: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "w1" }]) })) };
          case 3: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "s1" }]) })) };
          case 4: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "song1", sections: [] }]) })) };
          case 5: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "c1", sectionIndex: 0 }]) })) };
          default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) };
        }
      });

      await expect(
        generateClipImage({ worldId: "w1", storyId: "s1", songId: "song1", clipId: "c1" }),
      ).rejects.toThrow("Parent section not found for clip");
    });

    it("throws GenerationError if API key missing", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "" }]) })),
      });

      await expect(
        generateClipImage({ worldId: "w1", storyId: "s1", songId: "song1", clipId: "c1" }),
      ).rejects.toThrow("OpenRouter API key missing");
    });
  });

  describe("generateAllClipImages", () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it("returns 0 when there are no clips", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
      });

      const result = await generateAllClipImages({ worldId: "w1", storyId: "s1", songId: "song1" });
      expect(result).toBe(0);
    });
  });

  describe("generateClipVideo", () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it("throws GenerationError if API key missing", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "" }]) })),
      });

      await expect(
        generateClipVideo({ worldId: "w1", storyId: "s1", songId: "song1", clipId: "c1" }),
      ).rejects.toThrow("OpenRouter API key missing");
    });

    it("throws GenerationError if story not found", async () => {
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "key" }]) })) };
        return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) };
      });

      await expect(
        generateClipVideo({ worldId: "w1", storyId: "bad", songId: "song1", clipId: "c1" }),
      ).rejects.toThrow("Story not found");
    });
  });
});
