import { describe, it, expect } from "vitest";
import { getModelForTask, getVideoModelConfig, chooseVideoDuration, TASK_DEFAULTS } from "./tasks";

describe("AI tasks utility", () => {
  describe("getModelForTask", () => {
    it("should return the default model if task is not customized", () => {
      const model = getModelForTask("chat", {});
      expect(model).toBe(TASK_DEFAULTS.chat);
    });

    it("should return customized task model if configured", () => {
      const customized = { chat: "openai/gpt-4o", lyrics: "anthropic/claude-3" };
      const model = getModelForTask("chat", customized);
      expect(model).toBe("openai/gpt-4o");
    });

    it("should fall back to default if custom value is empty string", () => {
      const model = getModelForTask("lyrics", { lyrics: " " });
      expect(model).toBe(TASK_DEFAULTS.lyrics);
    });
  });

  describe("getVideoModelConfig", () => {
    it("should return correct config for Alibaba Wan models", () => {
      const config = getVideoModelConfig("alibaba/wan-2.6:latest");
      expect(config.durations).toEqual([5, 10]);
      expect(config.defaultDuration).toBe(5);
      expect(config.aspectRatio).toBe("16:9");
      
      const config2 = getVideoModelConfig("alibaba/wan-2.6/text-to-video");
      expect(config2.durations).toEqual([5, 10]);
    });

    it("should return correct config for Google Veo models", () => {
      const config = getVideoModelConfig("google/veo-3.1-lite");
      expect(config.durations).toEqual([4, 6, 8]);
      expect(config.defaultDuration).toBe(6);
      expect(config.resolution).toBe("720p");
    });

    it("should return default video config for unknown models", () => {
      const config = getVideoModelConfig("some-unknown-video-model");
      expect(config.durations).toEqual([5]);
      expect(config.defaultDuration).toBe(5);
    });
  });

  describe("chooseVideoDuration", () => {
    it("should pick closest duration greater than or equal to target seconds", () => {
      // alibaba/wan has [5, 10]
      const duration1 = chooseVideoDuration("alibaba/wan-2.6", 3);
      expect(duration1).toBe(5);

      const duration2 = chooseVideoDuration("alibaba/wan-2.6", 7);
      expect(duration2).toBe(10);
    });

    it("should clamp to maximum available duration if target is too large", () => {
      // alibaba/wan has max 10
      const duration = chooseVideoDuration("alibaba/wan-2.6", 12);
      expect(duration).toBe(10);
    });

    it("should pick correct duration for Google Veo", () => {
      // google/veo has [4, 6, 8]
      expect(chooseVideoDuration("google/veo-3.1", 2)).toBe(4);
      expect(chooseVideoDuration("google/veo-3.1", 5)).toBe(6);
      expect(chooseVideoDuration("google/veo-3.1", 7)).toBe(8);
      expect(chooseVideoDuration("google/veo-3.1", 20)).toBe(8);
    });
  });
});
