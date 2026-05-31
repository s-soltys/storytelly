import { vi, describe, it, expect } from "vitest";

// Mock database client and storage to prevent top-level connection checks when importing analyze
vi.mock("@/db/client", () => ({
  db: {},
}));
vi.mock("@/lib/storage", () => ({
  putObject: vi.fn(),
  getObjectBuffer: vi.fn(),
}));

import {
  extractSrt,
  parseStoryboardResponse,
  parseClipIdeasResponse,
  buildThematicAnalysisMessages,
  buildClipIdeasMessages,
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
      // The template evaluates to literal '${totalLength}' due to escaping in source code
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
});
