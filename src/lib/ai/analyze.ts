import { db } from "@/db/client";
import { settings as settingsTable, storySongs, type SongSection } from "@/db/schema";
import { getObjectBuffer } from "@/lib/storage";
import { eq } from "drizzle-orm";
import { imageToDataUrl } from "./images";
import { callOpenRouter, type ChatMessage, type ChatPart } from "./openrouter";
import { loadSongContext, serializePromptForStorage } from "./song";
import { getModelForTask } from "./tasks";
import { GenerationError } from "./songScript";

export async function analyzeSong(args: {
  worldId: string;
  storyId: string;
  songId: string;
}): Promise<void> {
  const [song] = await db
    .select()
    .from(storySongs)
    .where(eq(storySongs.id, args.songId));
  if (!song) throw new GenerationError(404, "Song not found");

  const ctx = await loadSongContext({
    worldId: args.worldId,
    storyId: args.storyId,
    lyrics: song.lyrics || undefined,
  });

  const [config] = await db.select().from(settingsTable).limit(1);
  const apiKey = config?.openrouterApiKey?.trim();
  if (!apiKey) {
    throw new GenerationError(
      400,
      "OpenRouter API key is not configured. Add one in settings.",
    );
  }

  const audioBytes = await getObjectBuffer(song.s3Key);
  const audioBase64 = Buffer.from(audioBytes).toString("base64");

  const model = getModelForTask("analyze_song", config?.taskModels ?? {});
  const messages = await buildAnalysisMessages(ctx, audioBase64);

  const result = await callOpenRouter({
    apiKey,
    model,
    messages,
  });

  const { subtitles, sections } = parseAnalysisResponse(result.text);

  await db
    .update(storySongs)
    .set({
      subtitles,
      sections,
      prompt: serializePromptForStorage(messages),
      costUsd: result.usage.costUsd != null ? result.usage.costUsd.toString() : null,
    })
    .where(eq(storySongs.id, song.id));
}

async function buildAnalysisMessages(
  ctx: any,
  audioBase64: string,
): Promise<ChatMessage[]> {
  const system = [
    "You are an expert music and video analyst.",
    "Your task is to analyze the provided MP3 audio and generate a storyboard plan.",
    "You must return two components wrapped in specific XML tags:",
    "1. <subtitles>...</subtitles> - Standard SRT subtitles for the lyrics.",
    "2. <sections>...</sections> - A JSON array of song sections.",
    "",
    "Each section in the JSON array must follow this schema:",
    "{",
    "  \"startSeconds\": number,",
    "  \"endSeconds\": number,",
    "  \"description\": \"Detailed description of what is happening in this section of the song\",",
    "  \"mood\": \"The emotional tone or atmosphere\",",
    "  \"characters\": \"comma-separated list of characters present\",",
    "  \"scenes\": \"comma-separated list of locations or scene types\",",
    "  \"clipIdeas\": [\"Visual description for clip 1\", \"Visual description for clip 2\", ...]",
    "}",
    "",
    "Use the provided World, Story, Character, and Location context to make the analysis grounded and specific.",
    "Sections should generally be between 5 and 30 seconds long.",
  ].join("\n");

  const parts: ChatPart[] = [
    {
      type: "input_audio",
      input_audio: { data: audioBase64, format: "mp3" },
    },
    {
      type: "text",
      text: [
        `# WORLD: ${ctx.world.name}`,
        `Style: ${ctx.world.artStyle}`,
        ctx.world.description,
        "",
        `# STORY: ${ctx.story.name}`,
        ctx.story.description,
        "",
        "# CHARACTERS",
        ...ctx.characters.map((c: any) => `## ${c.name}\n${c.description}`),
        "",
        "# LOCATIONS",
        ...ctx.locations.map((l: any) => `## ${l.name}\n${l.description}`),
        "",
        "# LYRICS (Reference)",
        ctx.story.lyrics || "No fixed lyrics provided.",
        "",
        "Analyze the song now and return the <subtitles> and <sections> components.",
      ].join("\n"),
    },
  ];

  // Add images as context too
  for (const character of ctx.characters) {
    for (const image of character.images) {
      const url = await imageToDataUrl(image);
      if (url) parts.push({ type: "image_url", image_url: { url } });
    }
  }

  return [
    { role: "system", content: system },
    { role: "user", content: parts },
  ];
}

function parseAnalysisResponse(text: string): {
  subtitles: string;
  sections: SongSection[];
} {
  const subtitlesMatch = text.match(/<subtitles>([\s\S]*?)<\/subtitles>/);
  const sectionsMatch = text.match(/<sections>([\s\S]*?)<\/sections>/);

  if (!subtitlesMatch || !sectionsMatch) {
    // Fallback or error
    throw new Error("AI failed to return structured analysis. Please try again.");
  }

  const subtitles = subtitlesMatch[1].trim();
  let sections: SongSection[] = [];
  try {
    // Strip possible markdown code blocks inside <sections>
    const jsonText = sectionsMatch[1].replace(/```json|```/g, "").trim();
    sections = JSON.parse(jsonText);
  } catch (e) {
    console.error("Failed to parse sections JSON", e);
    throw new Error("AI returned invalid JSON for song sections.");
  }

  return { subtitles, sections };
}
