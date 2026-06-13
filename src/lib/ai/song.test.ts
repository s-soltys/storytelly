import { vi, describe, it, expect } from "vitest";

const mockDbSelect = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({
  db: {
    select: mockDbSelect,
    insert: vi.fn(),
  },
}));
vi.mock("@/lib/storage", () => ({
  putObject: vi.fn(),
  getObjectBuffer: vi.fn(),
}));
vi.mock("@/lib/ai/images", () => ({
  imageToDataUrl: vi.fn(),
}));
vi.mock("@/lib/ai/openrouter", () => ({
  callOpenRouterAudio: vi.fn(),
}));
vi.mock("@/lib/ai/tasks", () => ({
  getModelForTask: vi.fn(() => "test-model"),
}));

import { serializePromptForStorage, buildSongTimeline, buildSongMessages, toTimestamp, loadSongContext } from "./song";
import { type ChatMessage } from "./openrouter";

describe("AI Song utilities", () => {
  describe("toTimestamp", () => {
    it("formats zero seconds", () => {
      expect(toTimestamp(0)).toBe("00:00");
    });

    it("formats seconds less than a minute", () => {
      expect(toTimestamp(45)).toBe("00:45");
    });

    it("formats exactly one minute", () => {
      expect(toTimestamp(60)).toBe("01:00");
    });

    it("formats minutes and seconds", () => {
      expect(toTimestamp(90)).toBe("01:30");
    });

    it("formats over an hour", () => {
      expect(toTimestamp(3661)).toBe("61:01");
    });
  });

  describe("buildSongTimeline", () => {
    it("should create a proportional timeline for a 60-second song", () => {
      const timeline = buildSongTimeline(60);
      expect(timeline).toContain("[00:00 - 00:06] Intro");
      expect(timeline).toContain("[00:06 - 00:18] Verse 1");
      expect(timeline).toContain("[00:18 - 00:30] Chorus");
      expect(timeline).toContain("[00:30 - 00:42] Verse 2");
      expect(timeline).toContain("[00:42 - 00:54] Chorus");
      expect(timeline).toContain("[00:54 - 01:00] Outro");
    });

    it("should create a proportional timeline for a 30-second song", () => {
      const timeline = buildSongTimeline(30);
      expect(timeline).toContain("[00:00 - 00:03] Intro");
      expect(timeline).toContain("[00:03 - 00:09] Verse 1");
      expect(timeline).toContain("[00:21 - 00:27] Chorus");
      expect(timeline).toContain("[00:27 - 00:30] Outro");
    });

    it("should handle zero seconds gracefully", () => {
      const timeline = buildSongTimeline(0);
      expect(timeline).toContain("[00:00 - 00:00] Intro");
    });
  });

  describe("buildSongMessages", () => {
    const baseCtx = {
      story: {
        id: "story-1",
        name: "Test Song",
        description: "A test song description",
        lengthSeconds: 60,
        lyrics: null,
      },
      world: {
        name: "Test World",
        artStyle: "Cyberpunk",
        description: "A cyberpunk world",
      },
      characters: [
        { name: "Aiko", description: "A hacker", images: [] },
      ],
      locations: [
        { name: "Neo Tokyo", description: "The city", images: [] },
      ],
    };

    it("should build system and user messages with world context", async () => {
      const messages = await buildSongMessages(baseCtx);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[0].content).toContain("compose complete songs");
      expect(messages[0].content).toContain("exactly 60 seconds");
      expect(messages[1].role).toBe("user");
    });

    it("should include characters and locations when provided", async () => {
      const messages = await buildSongMessages(baseCtx);
      const userContent = messages[1].content;
      expect(Array.isArray(userContent)).toBe(true);
      const fullText = (userContent as any[]).map((p) => p.text).join("\n");
      expect(fullText).toContain("# CHARACTERS");
      expect(fullText).toContain("## Aiko");
      expect(fullText).toContain("# LOCATIONS");
      expect(fullText).toContain("## Neo Tokyo");
    });

    it("should use provided lyrics when present", async () => {
      const ctxWithLyrics = {
        ...baseCtx,
        story: { ...baseCtx.story, lyrics: "Test lyrics content" },
      };
      const messages = await buildSongMessages(ctxWithLyrics);
      const userContent = messages[1].content;
      expect(Array.isArray(userContent)).toBe(true);
      const fullText = (userContent as any[]).map((p) => p.text).join("\n");
      expect(fullText).toContain("Test lyrics content");
    });

    it("should skip characters section when no characters provided", async () => {
      const ctxNoChars = {
        ...baseCtx,
        characters: [],
      };
      const messages = await buildSongMessages(ctxNoChars);
      const userContent = messages[1].content;
      expect(Array.isArray(userContent)).toBe(true);
      const fullText = (userContent as any[]).map((p) => p.text).join("\n");
      expect(fullText).not.toContain("# CHARACTERS");
    });

    it("should skip locations section when no locations provided", async () => {
      const ctxNoLocs = {
        ...baseCtx,
        locations: [],
      };
      const messages = await buildSongMessages(ctxNoLocs);
      const userContent = messages[1].content;
      expect(Array.isArray(userContent)).toBe(true);
      const fullText = (userContent as any[]).map((p) => p.text).join("\n");
      expect(fullText).not.toContain("# LOCATIONS");
    });
  });

  describe("loadSongContext", () => {
    it("throws GenerationError if story not found", async () => {
      const fromStoryMock = vi.fn().mockReturnThis();
      const whereStoryMock = vi.fn().mockResolvedValue([]);
      mockDbSelect.mockReturnValue({ from: fromStoryMock });
      fromStoryMock.mockReturnValue({ where: whereStoryMock });

      await expect(
        loadSongContext({ worldId: "w1", storyId: "missing" }),
      ).rejects.toThrow("Story not found");
    });

    it("loads full context with characters, locations, and images", async () => {
      const storyRow = { id: "s1", worldId: "w1", name: "Test", description: "Desc", lengthSeconds: 60, lyrics: "lyrics" };
      const worldRow = { id: "w1", name: "World", artStyle: "Cyberpunk", description: "A world" };
      const charLinks = [{ characterId: "c1" }];
      const locLinks = [{ locationId: "l1" }];
      const charRows = [{ id: "c1", name: "Aiko", description: "Hacker" }];
      const locRows = [{ id: "l1", name: "Tokyo", description: "City" }];
      const imageRows = [
        { s3Key: "chars/c1/img.png", mimeType: "image/png", ownerId: "c1", ownerKind: "character", position: 0, createdAt: new Date() },
      ];

      // Build the Drizzle chain
      const orderByMock = vi.fn().mockResolvedValue(imageRows);
      const whereImagesMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
      const fromImagesMock = vi.fn().mockReturnValue({ where: whereImagesMock });

      const whereLocsMock = vi.fn().mockResolvedValue(locRows);
      const fromLocsMock = vi.fn().mockReturnValue({ where: whereLocsMock });

      const whereCharsMock = vi.fn().mockResolvedValue(charRows);
      const fromCharsMock = vi.fn().mockReturnValue({ where: whereCharsMock });

      const fromLocLinksMock = vi.fn().mockReturnThis();
      const whereLocLinksMock = vi.fn().mockResolvedValue(locLinks);

      const fromCharLinksMock = vi.fn().mockReturnThis();
      const whereCharLinksMock = vi.fn().mockResolvedValue(charLinks);

      const whereWorldMock = vi.fn().mockResolvedValue([worldRow]);
      const fromWorldMock = vi.fn().mockReturnValue({ where: whereWorldMock });

      const whereStoryMock = vi.fn().mockResolvedValue([storyRow]);
      const fromStoryMock = vi.fn().mockReturnValue({ where: whereStoryMock });

      mockDbSelect.mockImplementation((selectArg?: any) => {
        // { characterId: storyCharacters.characterId } style select
        if (selectArg && typeof selectArg === "object" && "characterId" in selectArg) {
          return { from: fromCharLinksMock };
        }
        if (selectArg && typeof selectArg === "object" && "locationId" in selectArg) {
          return { from: fromLocLinksMock };
        }
        // Regular select
        return {
          from: fromStoryMock,
        };
      });

      // Chain from story -> world (different tables)
      // We need fromStoryMock to trigger world, then charLinks, then locLinks, then chars/locs, then images
      // This is tricky with the mock. Let me use a different approach.

      // Actually, the issue is that Drizzle chains sequentially. Each call to .from() returns
      // a different chain. Let me use a counter-based approach instead.

      // Reset and use sequential approach
      vi.clearAllMocks();

      // Rebuild with sequential tracking
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([storyRow]) })) };
          case 2: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([worldRow]) })) };
          case 3: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(charLinks) })) };
          case 4: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(locLinks) })) };
          case 5: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(charRows) })) };
          case 6: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(locRows) })) };
          case 7: return { from: vi.fn(() => ({ where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(imageRows) }) })) };
          default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) };
        }
      });

      const ctx = await loadSongContext({ worldId: "w1", storyId: "s1" });

      expect(ctx.story.id).toBe("s1");
      expect(ctx.story.name).toBe("Test");
      expect(ctx.world.name).toBe("World");
      expect(ctx.characters).toHaveLength(1);
      expect(ctx.characters[0].name).toBe("Aiko");
      expect(ctx.locations).toHaveLength(1);
      expect(ctx.locations[0].name).toBe("Tokyo");
      expect(ctx.characters[0].images).toHaveLength(1);
    });

    it("handles story with no linked characters or locations", async () => {
      vi.clearAllMocks();
      const storyRow = { id: "s1", worldId: "w1", name: "Empty Story", description: "No chars", lengthSeconds: 30, lyrics: "" };

      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([storyRow]) })) };
          case 2: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "w1", name: "W", artStyle: "S", description: "D" }]) })) };
          case 3: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) };
          case 4: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) };
          default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), orderBy: vi.fn().mockResolvedValue([]) })) };
        }
      });

      const ctx = await loadSongContext({ worldId: "w1", storyId: "s1" });
      expect(ctx.characters).toHaveLength(0);
      expect(ctx.locations).toHaveLength(0);
    });
  });

  describe("serializePromptForStorage", () => {
    it("should elide base64 data URLs from image_url parts", () => {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..." } },
            { type: "text", text: "Explain this character image." }
          ]
        }
      ];

      const serialized = serializePromptForStorage(messages);
      const parsed = JSON.parse(serialized);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].content[0]).toEqual({
        type: "image_url",
        image_url: { url: "[image elided]" }
      });
      expect(parsed[0].content[1]).toEqual({
        type: "text",
        text: "Explain this character image."
      });
    });

    it("should elide base64 audio data from input_audio parts", () => {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: [
            { type: "input_audio", input_audio: { data: "UklGRiS9AgBXQVZFZm10IBAAAA...", format: "mp3" } }
          ]
        }
      ];

      const serialized = serializePromptForStorage(messages);
      const parsed = JSON.parse(serialized);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].content[0]).toEqual({
        type: "input_audio",
        input_audio: { data: "[audio elided]", format: "mp3" }
      });
    });

    it("should leave standard string content messages intact", () => {
      const messages: ChatMessage[] = [
        { role: "system", content: "You are a musician." },
        { role: "user", content: "Write a song." }
      ];

      const serialized = serializePromptForStorage(messages);
      const parsed = JSON.parse(serialized);

      expect(parsed).toEqual(messages);
    });
  });
});
