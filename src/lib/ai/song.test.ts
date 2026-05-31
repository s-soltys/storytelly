import { vi, describe, it, expect } from "vitest";

// Mock database client and storage to prevent top-level connection checks when importing song
vi.mock("@/db/client", () => ({
  db: {},
}));
vi.mock("@/lib/storage", () => ({
  putObject: vi.fn(),
  getObjectBuffer: vi.fn(),
}));

import { serializePromptForStorage } from "./song";
import { type ChatMessage } from "./openrouter";

describe("AI Song utilities", () => {
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
