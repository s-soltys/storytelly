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
    lengthSeconds: song.lengthSeconds || undefined,
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
    responseFormat: { type: "json_object" },
    maxTokens: 4096,
  });

  const { subtitles, sections, detectedLengthSeconds } = parseAnalysisResponse(result.text, song.lengthSeconds || 0);

  // Update song with results. If we didn't have a length before, use the detected one.
  const updateData: any = {
    subtitles,
    sections,
    prompt: serializePromptForStorage(messages),
    costUsd: result.usage.costUsd != null ? result.usage.costUsd.toString() : null,
  };

  if (!song.lengthSeconds && detectedLengthSeconds) {
    // Note: We might still hit DB constraints if the detected length is not a multiple of 15.
    // We are relaxing the constraint in the schema for uploaded songs.
    updateData.lengthSeconds = Math.round(detectedLengthSeconds);
  }

  await db
    .update(storySongs)
    .set(updateData)
    .where(eq(storySongs.id, song.id));
}

async function buildAnalysisMessages(
  ctx: any,
  audioBase64: string,
): Promise<ChatMessage[]> {
  const durationKnown = ctx.story.lengthSeconds > 0;
  
  const system = [
    "You are a professional music analyst and video director.",
    "Your task is to analyze the provided MP3 audio, transcribe the vocals, and generate a structural storyboard plan.",
    "You MUST return your response as a SINGLE JSON object with exactly four keys:",
    "1. \"analysisNotes\": A string where you think step-by-step. First, analyze the musical structure (Intro, Verse, Chorus, etc.) and note the start/end timestamps of each section. Then, identify the key vocal lines and their timestamps.",
    "2. \"detectedLengthSeconds\": A number. The total duration of the song in seconds, as determined by your audio analysis.",
    "3. \"subtitles\": A string containing standard SRT subtitles for the lyrics based on your precise audio analysis.",
    "4. \"sections\": A JSON array of song sections, mapped precisely to the musical structure you identified.",
    "",
    "Each section in the \"sections\" array must follow this schema:",
    "{",
    "  \"startSeconds\": number,",
    "  \"endSeconds\": number,",
    "  \"description\": \"Detailed description of what is happening in this section of the song (e.g., 'High energy chorus with heavy drums', 'Quiet acoustic intro')\",",
    "  \"mood\": \"The emotional tone or atmosphere\",",
    "  \"characters\": \"comma-separated list of characters present\",",
    "  \"scenes\": \"comma-separated list of locations or scene types\",",
    "  \"clipIdeas\": [\"Visual description for clip 1\", \"Visual description for clip 2\", ...]",
    "}",
    "",
    "CRITICAL RULES:",
    "1. TIMING PRECISION: You must be extremely precise with timestamps. Base them directly on the audio waveform and musical shifts. Timestamps should be numbers (seconds).",
    "2. MATHEMATICAL CONTINUITY: The storyboard is a perfect sequence. The startSeconds of the first section must be 0. For every subsequent section, its startSeconds MUST be exactly equal to the endSeconds of the section preceding it.",
    "3. EXACT ENDING: The endSeconds of the VERY LAST section in the array MUST be exactly equal to the total song duration.",
    "4. FULL COVERAGE: There must be zero gaps in the timeline from 0s to the end of the song.",
    "5. RICH IDEAS: Generate at least 3-5 distinct visual clip ideas for EVERY section to provide plenty of creative options.",
    "6. CONTEXT: Use the provided World, Story, Character, and Location context to make the analysis grounded.",
    "7. LOGICAL SECTIONS: Divide the song based on real musical structure (Intro, Verse, Chorus, Bridge, Outro).",
    "8. SRT FORMAT: Ensure the \"subtitles\" field is a valid SRT string. Each subtitle must have an index, a time range (00:00:00,000 --> 00:00:00,000), and the text.",
    "9. JSON SAFETY: You MUST escape all double quotes and special characters within string values to ensure the response is valid JSON.",
    "10. FORMAT: Return ONLY the raw JSON object. No markdown code blocks like ```json.",
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
        durationKnown ? `TOTAL SONG DURATION: ${ctx.story.lengthSeconds} seconds` : "TOTAL SONG DURATION: Unknown (please determine from audio)",
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
        durationKnown 
          ? `Analyze the song now. First write your analysisNotes, then generate the subtitles and the sections array. The timeline MUST cover exactly 0s to ${ctx.story.lengthSeconds}s.`
          : `Analyze the song now. First determine the duration, write your analysisNotes, then generate the subtitles and the sections array. The timeline MUST cover the full song from 0s to the end.`,
      ].join("\n"),
    },
  ];

  return [
    { role: "system", content: system },
    { role: "user", content: parts },
  ];
}

function parseAnalysisResponse(text: string, totalLength: number): {
  subtitles: string;
  sections: SongSection[];
  detectedLengthSeconds: number;
} {
  let jsonText = text.trim();
  if (jsonText.includes("```")) {
    const match = jsonText.match(/```(?:json)?([\s\S]*?)```/);
    if (match) jsonText = match[1].trim();
  }

  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end === -1) {
    console.error("AI failed to return a JSON object. Raw text head:", text.slice(0, 500));
    throw new Error("AI failed to return a valid JSON object.");
  }
  jsonText = jsonText.slice(start, end + 1);

  try {
    const data = JSON.parse(jsonText);
    if (typeof data.subtitles !== "string" || !Array.isArray(data.sections)) {
      throw new Error("AI response missing required JSON fields.");
    }
    
    return {
      subtitles: data.subtitles,
      sections: data.sections as SongSection[],
      detectedLengthSeconds: Number(data.detectedLengthSeconds) || 0,
    };
  } catch (e: any) {
    console.error("Failed to parse analysis JSON", e);
    console.error("Raw JSON text (truncated):", jsonText.slice(0, 1000), "...", jsonText.slice(-1000));
    throw new Error(`AI returned invalid JSON: ${e.message}`);
  }
}
