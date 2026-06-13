import { describe, it, expect } from "vitest";
import { queryKeys } from "./queries";

describe("queryKeys factory", () => {
  it("worlds.all returns correct key", () => {
    expect(queryKeys.worlds.all()).toEqual(["worlds"]);
  });

  it("world.detail returns correct key", () => {
    expect(queryKeys.world.detail("w1")).toEqual(["world", "w1"]);
  });

  it("world.characters returns correct key", () => {
    expect(queryKeys.world.characters("w1")).toEqual(["characters", "w1"]);
  });

  it("world.locations returns correct key", () => {
    expect(queryKeys.world.locations("w1")).toEqual(["locations", "w1"]);
  });

  it("world.stories returns correct key", () => {
    expect(queryKeys.world.stories("w1")).toEqual(["stories", "w1"]);
  });

  it("character.detail returns correct key", () => {
    expect(queryKeys.character.detail("c1")).toEqual(["character", "c1"]);
  });

  it("location.detail returns correct key", () => {
    expect(queryKeys.location.detail("l1")).toEqual(["location", "l1"]);
  });

  it("story.detail returns correct key with null", () => {
    expect(queryKeys.story.detail(null)).toEqual(["story", null]);
  });

  it("story.detail returns correct key with id", () => {
    expect(queryKeys.story.detail("s1")).toEqual(["story", "s1"]);
  });

  it("story.logs returns correct key", () => {
    expect(queryKeys.story.logs("s1")).toEqual(["story-logs", "s1"]);
  });

  it("story.songs returns correct key", () => {
    expect(queryKeys.story.songs("s1")).toEqual(["story-songs", "s1"]);
  });

  it("story.songClips returns correct key", () => {
    expect(queryKeys.story.songClips("sc1")).toEqual(["story-songs", "sc1", "clips"]);
  });

  it("story.lyricsVersions returns correct key", () => {
    expect(queryKeys.story.lyricsVersions("s1")).toEqual(["story-lyrics-versions", "s1"]);
  });

  it("story.messages returns correct key", () => {
    expect(queryKeys.story.messages("s1")).toEqual(["story-messages", "s1"]);
  });

  it("settings.all returns correct key", () => {
    expect(queryKeys.settings.all()).toEqual(["settings"]);
  });

  it("all keys are readonly tuples", () => {
    const keys = queryKeys.worlds.all();
    expect(typeof keys).toBe("object");
    expect(Array.isArray(keys)).toBe(true);
  });
});
