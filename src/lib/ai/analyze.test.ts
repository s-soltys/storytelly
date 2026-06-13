import { vi, describe, it, expect, beforeEach } from "vitest";

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbDelete = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
  },
}));

const mockGetObjectBuffer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage", () => ({
  putObject: vi.fn(),
  getObjectBuffer: mockGetObjectBuffer,
}));

vi.mock("@/lib/ai/images", () => ({
  imageToDataUrl: vi.fn(),
}));

const mockTranscribeAudio = vi.hoisted(() => vi.fn());
const mockCallOpenRouter = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/openrouter", () => ({
  transcribeAudio: mockTranscribeAudio,
  callOpenRouter: mockCallOpenRouter,
}));

vi.mock("@/lib/ai/tasks", () => ({
  getModelForTask: vi.fn(() => "test-model"),
}));

const mockSerializePromptForStorage = vi.hoisted(() => vi.fn(() => "{}"));
vi.mock("@/lib/ai/song", () => ({
  loadSongContext: vi.fn(() => Promise.resolve({
    story: { id: "s1", name: "Test Song", description: "A test", lengthSeconds: 60, lyrics: "Some lyrics" },
    world: { name: "W", artStyle: "S", description: "D" },
    characters: [{ name: "Bob", description: "Builder", images: [] }],
    locations: [{ name: "Base", description: "Home", images: [] }],
  })),
  serializePromptForStorage: mockSerializePromptForStorage,
}));

import {
  extractSrt,
  parseStoryboardResponse,
  parseClipIdeasResponse,
  buildThematicAnalysisMessages,
  buildClipIdeasMessages,
  transcribeSong,
  analyzeSongStructure,
} from "./analyze";
import { type SongSection } from "@/db/schema";

describe("AI Audio and Thematic Analysis utilities", () => {
  describe("extractSrt", () => {
    it("should extract raw SRT text if no extra formatting is present", () => {
      const srt = "1\n00:00:00,000 --> 00:00:02,000\nHello world";
      expect(extractSrt(srt)).toBe(srt);
    });

    it("should strip out thinking or header blocks before the SRT content", () => {
      const text = "Here is the transcription:\n\n1\n00:00:01,230 --> 00:00:04,500\nSinging starts now.";
      expect(extractSrt(text)).toBe("1\n00:00:01,230 --> 00:00:04,500\nSinging starts now.");
    });

    it("returns trimmed text when no SRT pattern matched", () => {
      const text = "  Some plain text without timestamps  ";
      expect(extractSrt(text)).toBe("Some plain text without timestamps");
    });
  });

  describe("parseStoryboardResponse", () => {
    it("should parse a JSON object even with analysis comments around it", () => {
      const response = "Thinking process...\n{\n  \"sections\": [\n    { \"startSeconds\": 0, \"endSeconds\": 5, \"description\": \"Intro\", \"mood\": \"Calm\", \"characters\": \"\", \"scenes\": \"\" }\n  ]\n}";
      const parsed = parseStoryboardResponse(response);
      expect(parsed.sections).toHaveLength(1);
      expect(parsed.sections[0].description).toBe("Intro");
    });

    it("should throw an error if no JSON object is found", () => {
      expect(() => parseStoryboardResponse("No JSON block here")).toThrow("AI failed to return a JSON object.");
    });

    it("returns empty sections array when JSON has no sections key", () => {
      const result = parseStoryboardResponse(JSON.stringify({ other: "data" }));
      expect(result.sections).toEqual([]);
    });
  });

  describe("parseClipIdeasResponse", () => {
    it("should merge clip ideas from AI response into original storyboard sections", () => {
      const originalSections: SongSection[] = [
        { startSeconds: 0, endSeconds: 5, description: "Intro", mood: "Calm", characters: "", scenes: "" },
        { startSeconds: 5, endSeconds: 10, description: "Verse", mood: "Tense", characters: "", scenes: "" },
      ];

      const aiResponse = JSON.stringify({
        sections: [
          { startSeconds: 0, endSeconds: 5, clipIdeas: ["Wide shot of the city", "Close up on eyes"] },
          { startSeconds: 5, endSeconds: 10, clipIdeas: ["Running down the alley"] },
        ]
      });

      const merged = parseClipIdeasResponse(aiResponse, originalSections);
      expect(merged).toHaveLength(2);
      expect((merged[0] as any).clipIdeas).toEqual(["Wide shot of the city", "Close up on eyes"]);
      expect((merged[1] as any).clipIdeas).toEqual(["Running down the alley"]);
    });

    it("throws when no JSON object found in clip response", () => {
      expect(() => parseClipIdeasResponse("bad data", [])).toThrow("AI failed to return a JSON object for clips.");
    });

    it("fills missing clipIdeas with empty array for unmatched sections", () => {
      const original: SongSection[] = [
        { startSeconds: 0, endSeconds: 5, description: "Intro", mood: "C", characters: "", scenes: "" },
      ];
      const response = JSON.stringify({
        sections: [{ startSeconds: 10, endSeconds: 15, clipIdeas: ["Nope"] }],
      });
      const merged = parseClipIdeasResponse(response, original);
      expect((merged[0] as any).clipIdeas).toEqual([]);
    });
  });

  describe("buildThematicAnalysisMessages", () => {
    const mockCtx = {
      world: { name: "Future", artStyle: "Neon" },
      story: { name: "My Story", description: "A cool story", lyrics: "Some lyrics" },
      characters: [{ name: "Bob", description: "A builder" }],
      locations: [{ name: "Base", description: "Home" }],
    };

    it("should build prompt messages matching structure requirements", () => {
      const messages = buildThematicAnalysisMessages(mockCtx, "base64audio", 30);
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toContain("Each section in the \"sections\" array must follow this schema:");
      expect(messages[0].content).toContain("The last section's endSeconds MUST be exactly ${totalLength}.");

      const userText = (messages[1].content as any[])[1].text;
      expect(userText).toContain("# WORLD: Future");
      expect(userText).toContain("- Bob: A builder");
      expect(userText).toContain("- Base: Home");
      expect(userText).toContain("Some lyrics");
    });
  });

  describe("buildClipIdeasMessages", () => {
    const mockCtx = {
      world: { name: "Future", artStyle: "Neon" },
      story: { name: "My Story", description: "A cool story" },
      characters: [{ name: "Bob", description: "A builder" }],
      locations: [{ name: "Base", description: "Home" }],
    };

    const sections: SongSection[] = [
      { startSeconds: 0, endSeconds: 10, description: "Action scene", mood: "Epic", characters: "Bob", scenes: "Base" }
    ];

    it("should build prompt messages referencing the original sections", () => {
      const messages = buildClipIdeasMessages(mockCtx, sections, 10);
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toContain("For each section provided, generate a list of clip ideas");

      const userText = messages[1].content as string;
      expect(userText).toContain("Action scene");
      expect(userText).toContain('"startSeconds": 0');
      expect(userText).toContain('"endSeconds": 10');
    });
  });

  describe("transcribeSong", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("throws GenerationError if song not found", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      });

      await expect(
        transcribeSong({ worldId: "w1", storyId: "s1", songId: "missing" }),
      ).rejects.toThrow("Song not found");
    });

    it("throws GenerationError if API key is missing", async () => {
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "song1", s3Key: "audio.mp3", lengthSeconds: 60, lyrics: "lyrics" }]) })) };
          // loadSongContext calls are handled by the mock, not real DB
          case 2: return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "" }]) })) };
          default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), orderBy: vi.fn().mockResolvedValue([]) })) };
        }
      });

      mockGetObjectBuffer.mockResolvedValue(Buffer.from("audio-bytes"));

      await expect(
        transcribeSong({ worldId: "w1", storyId: "s1", songId: "song1" }),
      ).rejects.toThrow("OpenRouter API key missing");
    });

    it("completes transcription successfully and updates song with subtitles", async () => {
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "song1", s3Key: "audio.mp3", lengthSeconds: 30, lyrics: "test lyrics" }]) })) };
        }
        if (callCount === 2) {
          return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "test-key" }]) })) };
        }
        return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), orderBy: vi.fn().mockResolvedValue([]) })) };
      });

      mockGetObjectBuffer.mockResolvedValue(Buffer.from("audio-bytes"));

      mockTranscribeAudio.mockResolvedValue({
        text: "1\n00:00:00,000 --> 00:00:02,000\nHello world",
        segments: [],
        usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.001 },
      });

      mockDbInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

      const whereUpdateMock = vi.fn().mockResolvedValue(undefined);
      const setMock = vi.fn().mockReturnValue({ where: whereUpdateMock });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await transcribeSong({ worldId: "w1", storyId: "s1", songId: "song1" });

      expect(mockTranscribeAudio).toHaveBeenCalledOnce();
      expect(mockDbInsert).toHaveBeenCalledOnce();
      expect(setMock).toHaveBeenCalledOnce();
    });
  });

  describe("analyzeSongStructure", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("throws GenerationError if song not found", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      });

      await expect(
        analyzeSongStructure({ worldId: "w1", storyId: "s1", songId: "missing" }),
      ).rejects.toThrow("Song not found");
    });

    it("throws GenerationError if API key is missing", async () => {
      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "song1", s3Key: "audio.mp3", lengthSeconds: 30, lyrics: "lyrics" }]) })) };
        }
        if (callCount === 2) {
          return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "" }]) })) };
        }
        return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), orderBy: vi.fn().mockResolvedValue([]) })) };
      });

      mockGetObjectBuffer.mockResolvedValue(Buffer.from("audio"));

      await expect(
        analyzeSongStructure({ worldId: "w1", storyId: "s1", songId: "song1" }),
      ).rejects.toThrow("OpenRouter API key missing");
    });

    it("completes full analysis with two-pass AI calls and saves clips", async () => {
      const mockSections = [
        { startSeconds: 0, endSeconds: 10, description: "Intro", mood: "Calm", characters: "", scenes: "" },
      ];
      const mockClipSections = [
        { startSeconds: 0, endSeconds: 10, description: "Intro", mood: "Calm", characters: "", scenes: "", clipIdeas: ["Wide establishing shot"] },
      ];

      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        switch (selectCallCount) {
          case 1: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: "song1", s3Key: "audio.mp3", lengthSeconds: 30, lyrics: "lyrics", sections: null }]) })) };
          case 2: return { from: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ openrouterApiKey: "test-key" }]) })) };
          default: return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), orderBy: vi.fn().mockResolvedValue([]) })) };
        }
      });

      mockGetObjectBuffer.mockResolvedValue(Buffer.from("audio"));

      // First AI call returns storyboard
      mockCallOpenRouter.mockImplementation(async (args: any) => {
        const body = JSON.parse(args.body || "{}");
        // Determine which call based on the messages
        if (JSON.stringify(args.messages || []).includes("clip ideas")) {
          return {
            text: JSON.stringify({ sections: mockClipSections }),
            usage: { promptTokens: 5, completionTokens: 10, costUsd: 0.001 },
          };
        }
        return {
          text: JSON.stringify({ sections: mockSections }),
          usage: { promptTokens: 10, completionTokens: 20, costUsd: 0.002 },
        };
      });

      // Handle inserts and updates
      const whereUpdateMock = vi.fn().mockResolvedValue(undefined);
      const setMock = vi.fn().mockReturnValue({ where: whereUpdateMock });
      mockDbUpdate.mockReturnValue({ set: setMock });

      const whereDeleteMock = vi.fn().mockResolvedValue(undefined);
      mockDbDelete.mockReturnValue({ where: whereDeleteMock });

      let insertCount = 0;
      const valuesMock = vi.fn();
      valuesMock.mockImplementation(() => {
        insertCount++;
        if (insertCount <= 2) return Promise.resolve(undefined); // AI call inserts
        return Promise.resolve(undefined); // clip insert
      });
      mockDbInsert.mockReturnValue({ values: valuesMock });

      await analyzeSongStructure({ worldId: "w1", storyId: "s1", songId: "song1" });

      expect(mockCallOpenRouter).toHaveBeenCalledTimes(2);
      expect(mockDbUpdate).toHaveBeenCalledOnce();
      expect(mockDbDelete).toHaveBeenCalledOnce();
      expect(valuesMock).toHaveBeenCalledTimes(3); // 2 AI logs + 1 clip insert
    });
  });
});
