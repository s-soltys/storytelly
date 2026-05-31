import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  callOpenRouter,
  transcribeAudio,
  callOpenRouterAudio,
  callOpenRouterVideo,
  isOpenRouterImageSafetyError,
  OpenRouterError,
} from "./openrouter";

describe("OpenRouter API Client wrapper", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  describe("callOpenRouter", () => {
    it("should parse text and usage from a successful response", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Hello, this is a response.",
                },
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              cost: 0.0015,
            },
          }),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await callOpenRouter({
        apiKey: "test-key",
        model: "test-model",
        messages: [{ role: "user", content: "hi" }],
      });

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.text).toBe("Hello, this is a response.");
      expect(result.images).toEqual([]);
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.costUsd).toBe(0.0015);
    });

    it("should parse images from content parts and choices.message.images", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Here is your image",
                  images: ["https://openrouter.ai/some-image.png"],
                },
              },
            ],
            usage: {},
          }),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await callOpenRouter({
        apiKey: "test-key",
        model: "test-model",
        messages: [{ role: "user", content: "draw a cat" }],
      });

      expect(result.images).toEqual(["https://openrouter.ai/some-image.png"]);
    });

    it("should throw OpenRouterError on non-ok statuses", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(
        callOpenRouter({
          apiKey: "test-key",
          model: "test-model",
          messages: [],
        })
      ).rejects.toThrowError("OpenRouter 500: Internal server error");
    });
  });

  describe("transcribeAudio", () => {
    it("should submit audio payload and parse transcript text", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            text: "This is transcribed audio",
            segments: [{ start: 0, end: 2, text: "This is" }],
            usage: { prompt_tokens: 5, completion_tokens: 10 },
          }),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await transcribeAudio({
        apiKey: "test-key",
        model: "whisper",
        audioBase64: "base64data",
        format: "mp3",
      });

      expect(result.text).toBe("This is transcribed audio");
      expect(result.segments).toEqual([{ start: 0, end: 2, text: "This is" }]);
    });
  });

  describe("isOpenRouterImageSafetyError", () => {
    it("should correctly identify safety errors", () => {
      const err = new OpenRouterError("Safety settings blocked the input image", 400, "");
      expect(isOpenRouterImageSafetyError(err)).toBe(true);

      const standardErr = new OpenRouterError("Model not found", 404, "");
      expect(isOpenRouterImageSafetyError(standardErr)).toBe(false);

      expect(isOpenRouterImageSafetyError(new Error("Another error"))).toBe(false);
    });
  });

  describe("callOpenRouterAudio", () => {
    it("should read stream and decode audio base64 correctly", async () => {
      const encoder = new TextEncoder();
      const firstChunk = encoder.encode(
        'data: {"choices": [{"delta": {"audio": {"data": "aGVsbG8="}}}]}\n\n' // "hello" in base64
      );
      const secondChunk = encoder.encode(
        'data: {"choices": [{"delta": {"audio": {"transcript": "world"}}}]}\n\n'
      );
      const finalChunk = encoder.encode('data: [DONE]\n\n');

      const streamChunks = [firstChunk, secondChunk, finalChunk];
      let chunkIdx = 0;

      const mockReader = {
        read: async () => {
          if (chunkIdx < streamChunks.length) {
            return { value: streamChunks[chunkIdx++], done: false };
          }
          return { value: undefined, done: true };
        },
      };

      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name === "x-generation-id" ? "gen-123" : null),
        },
        body: {
          getReader: () => mockReader,
        },
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await callOpenRouterAudio({
        apiKey: "test-key",
        model: "audio-model",
        messages: [],
        format: "mp3",
      });

      expect(result.audio.toString("utf8")).toBe("hello");
      expect(result.transcript).toBe("world");
      expect(result.generationId).toBe("gen-123");
    });
  });

  describe("callOpenRouterVideo", () => {
    it("should request job creation, poll for completion, and download video", async () => {
      // Mock submit call
      const mockSubmitResponse = {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "job-1",
            polling_url: "/api/v1/jobs/job-1",
          }),
      };

      // Mock poll call (completed)
      const mockPollResponse = {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: "completed",
            unsigned_urls: ["https://openrouter.ai/download/job-1.mp4"],
            usage: { cost: 0.05 },
          }),
      };

      // Mock download call
      const mockDownloadResponse = {
        ok: true,
        status: 200,
        arrayBuffer: async () => {
          const buffer = Buffer.from("video-bytes");
          return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        },
        headers: {
          get: (name: string) => (name === "content-type" ? "video/mp4" : null),
        },
      };

      vi.mocked(fetch).mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.endsWith("/videos")) {
          return mockSubmitResponse as any;
        } else if (urlStr.includes("jobs/job-1")) {
          return mockPollResponse as any;
        } else if (urlStr.includes("download/job-1.mp4")) {
          return mockDownloadResponse as any;
        }
        throw new Error("Unexpected fetch call");
      });

      const result = await callOpenRouterVideo({
        apiKey: "test-key",
        model: "veo",
        prompt: "Cinematic shot",
        pollIntervalMs: 1, // fast poll for test
        timeoutMs: 100,
      });

      expect(result.jobId).toBe("job-1");
      expect(result.video.toString()).toBe("video-bytes");
      expect(result.mimeType).toBe("video/mp4");
      expect(result.usage.costUsd).toBe(0.05);
    });
  });
});
