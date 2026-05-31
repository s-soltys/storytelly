import { vi, describe, it, expect } from "vitest";

// Mock database client and storage to prevent top-level connection checks when importing dependencies
vi.mock("@/db/client", () => ({
  db: {},
}));
vi.mock("@/lib/storage", () => ({
  putObject: vi.fn(),
  getObjectBuffer: vi.fn(),
}));

import { buildLyricsMessages, type GenerationContext } from "./songScript";

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
