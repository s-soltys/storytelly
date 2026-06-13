import { vi, describe, it, expect, beforeEach } from "vitest";

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
}));

vi.mock("@/lib/storage", () => ({
  putObject: vi.fn(),
  getObjectBuffer: vi.fn(),
}));

vi.mock("@/lib/ai/openrouter", () => ({
  callOpenRouter: vi.fn(),
}));

vi.mock("@/lib/ai/tasks", () => ({
  getModelForTask: vi.fn(() => "test-lyrics-model"),
}));

import { buildLyricsMessages, GenerationError, generateLyrics, type GenerationContext } from "./songScript";

describe("GenerationError", () => {
  it("should create an error with status and message", () => {
    const err = new GenerationError(400, "Bad request", { field: "name" });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(400);
    expect(err.message).toBe("Bad request");
    expect(err.details).toEqual({ field: "name" });
  });

  it("should create an error without details", () => {
    const err = new GenerationError(404, "Not found");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.details).toBeUndefined();
  });
});

describe("Lyrics Generation prompt builder", () => {
  const baseContext: GenerationContext = {
    story: {
      id: "story-1",
      name: "cyber quest",
      description: "A quest in cyber world",
      lengthSeconds: 60,
      lyrics: null,
    },
    world: {
      name: "Cyber Tokyo",
      artStyle: "Cyberpunk neon",
      description: "A city filled with lights and networks",
    },
    storyCharacters: [
      { name: "Aiko", description: "Hacker with pink hair", images: [] },
    ],
    storyLocations: [
      { name: "Sector 7", description: "Rusty slums", images: [] },
    ],
  };

  it("should build correct messages for first draft of lyrics", async () => {
    const messages = await buildLyricsMessages(baseContext);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("You are a lyricist writing lyrics for a short AI-generated music video.");
    expect(messages[0].content).toContain("Calculate the pacing carefully so the timestamps sum up exactly");

    expect(messages[1].role).toBe("user");
    const userContent = messages[1].content;
    expect(Array.isArray(userContent)).toBe(true);

    const fullText = (userContent as any[]).map((c) => c.text).join("\n");
    expect(fullText).toContain("# WORLD: Cyber Tokyo");
    expect(fullText).toContain("Art style: Cyberpunk neon");
    expect(fullText).toContain("# STORY BRIEF: cyber quest");
    expect(fullText).toContain("## Aiko");
    expect(fullText).toContain("## Sector 7");
    expect(fullText).toContain("Write the first draft of the lyrics");
  });

  it("should build correct messages for lyric revision", async () => {
    const revisionContext: GenerationContext = {
      ...baseContext,
      story: {
        ...baseContext.story,
        lyrics: "[Verse 1]\nNeon glowing bright...",
      },
      instructions: "make the tone darker and mention rain",
    };

    const messages = await buildLyricsMessages(revisionContext);

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain("You are a lyricist revising existing song lyrics");
    expect(messages[0].content).toContain("Your PRIMARY focus is the existing lyrics");

    const fullText = (messages[1].content as any[]).map((c) => c.text).join("\n");
    expect(fullText).toContain("# EXISTING LYRICS (primary focus)");
    expect(fullText).toContain("Neon glowing bright...");
    expect(fullText).toContain("# INSTRUCTIONS (primary focus)");
    expect(fullText).toContain("make the tone darker and mention rain");
  });
});

describe("generateLyrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws GenerationError if story is not found", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    });

    await expect(
      generateLyrics({ worldId: "w1", storyId: "missing" }),
    ).rejects.toThrow("Story not found");
  });

  it("throws GenerationError if world is not found", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "s1", worldId: "w1" }]) })) };
        default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) };
      }
    });

    await expect(
      generateLyrics({ worldId: "w1", storyId: "s1" }),
    ).rejects.toThrow("World not found");
  });

  it("throws GenerationError if API key is missing", async () => {
    const storyRow = { id: "s1", worldId: "w1", name: "Test", description: "Desc", lengthSeconds: 60, lyrics: "" };
    const worldRow = { id: "w1", name: "World", artStyle: "S", description: "D" };

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([storyRow]) })) };
        case 2: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([worldRow]) })) };
        case 3: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) }; // charLinks
        case 4: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) }; // locLinks
        case 5: return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "" }]) })) }; // settings
        default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), orderBy: vi.fn().mockResolvedValue([]) })) };
      }
    });

    await expect(
      generateLyrics({ worldId: "w1", storyId: "s1" }),
    ).rejects.toThrow("OpenRouter API key is not configured");
  });

  it("completes successfully with characters and locations", async () => {
    const mockCallOpenRouter = (await import("@/lib/ai/openrouter")).callOpenRouter;
    vi.mocked(mockCallOpenRouter).mockResolvedValue({
      text: "[Verse 1]\nNeon lights...",
      images: [],
      usage: { promptTokens: 10, completionTokens: 20, costUsd: 0.001 },
    });

    const storyRow = { id: "s1", worldId: "w1", name: "Test", description: "Desc", lengthSeconds: 60, lyrics: "" };
    const worldRow = { id: "w1", name: "World", artStyle: "S", description: "D" };
    const charLinks = [{ characterId: "c1" }];
    const locLinks = [{ locationId: "l1" }];
    const charRow = { id: "c1", name: "Aiko", description: "Hacker" };
    const locRow = { id: "l1", name: "Tokyo", description: "City" };
    const imageRows = [
      { s3Key: "chars/c1/img.png", mimeType: "image/png", ownerId: "c1", ownerKind: "character", position: 0, createdAt: new Date() },
    ];

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([storyRow]) })) };
        case 2: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([worldRow]) })) };
        case 3: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(charLinks) })) };
        case 4: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(locLinks) })) };
        case 5: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([charRow]) })) };
        case 6: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([locRow]) })) };
        case 7: return { from: vi.fn(() => ({ where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(imageRows) }) })) };
        case 8: return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "test-key" }]) })) };
        default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), orderBy: vi.fn().mockResolvedValue([]) })) };
      }
    });

    mockDbInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

    const result = await generateLyrics({ worldId: "w1", storyId: "s1" });

    expect(result).toEqual({ lyrics: "[Verse 1]\nNeon lights..." });
    expect(mockCallOpenRouter).toHaveBeenCalledOnce();
  });
});
