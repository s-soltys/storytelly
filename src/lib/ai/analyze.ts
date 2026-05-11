import { db } from "@/db/client";
import { settings as settingsTable, storySongs, aiCalls, type SongSection } from "@/db/schema";
import { getObjectBuffer } from "@/lib/storage";
import { eq } from "drizzle-orm";
import { imageToDataUrl } from "./images";
import { callOpenRouter, type ChatMessage, type ChatPart } from "./openrouter";
import { loadSongContext, serializePromptForStorage } from "./song";
import { getModelForTask } from "./tasks";
import { GenerationError } from "./songScript";

export async function transcribeSong(args: {
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
  if (!apiKey) throw new GenerationError(400, "OpenRouter API key missing");

  const audioBytes = await getObjectBuffer(song.s3Key);
  const audioBase64 = Buffer.from(audioBytes).toString("base64");
  const model = getModelForTask("analyze_song", config?.taskModels ?? {}); // Using the audio model

  const officialDuration = song.lengthSeconds || 0;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "You are a professional audio transcriber.",
        "Your task is to generate a perfect verbatim SRT subtitle file for the provided audio.",
        "",
        "CRITICAL RULES:",
        "1. FORMAT: Output raw SRT text ONLY. No markdown, no commentary, no JSON.",
        "2. TIMING: Use standard SRT timestamps (00:00:00,000 --> 00:00:00,000).",
        "3. PRECISION: Anchor timestamps to the audio. Identify the exact second vocals start.",
        `4. DURATION: The song is EXACTLY ${officialDuration} seconds long. Do not exceed this.`,
        "5. INTRO: Do NOT start subtitles at 00:00:00,000 unless singing starts immediately.",
        "6. VERBATIM: Transcribe every word exactly as sung.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        { type: "input_audio", input_audio: { data: audioBase64, format: "mp3" } },
        { type: "text", text: `Transcribe the song "${ctx.story.name}" verbatim with accurate SRT timestamps. Full length: ${officialDuration}s. Reference lyrics: ${ctx.story.lyrics || "None"}` }
      ],
    }
  ];

  const start = Date.now();
  const result = await callOpenRouter({
    apiKey,
    model,
    messages,
    maxTokens: 4000,
  });

  const subtitles = extractSrt(result.text);

  // Log
  await db.insert(aiCalls).values({
    worldId: args.worldId,
    storyId: args.storyId,
    task: "transcribe_song",
    model,
    prompt: serializePromptForStorage(messages),
    response: result.text,
    costUsd: result.usage.costUsd?.toString(),
    durationMs: Date.now() - start,
  });

  await db
    .update(storySongs)
    .set({ subtitles })
    .where(eq(storySongs.id, song.id));
}

export async function analyzeSongStructure(args: {
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
  if (!apiKey) throw new GenerationError(400, "OpenRouter API key missing");

  const audioBytes = await getObjectBuffer(song.s3Key);
  const audioBase64 = Buffer.from(audioBytes).toString("base64");
  const model = getModelForTask("analyze_song", config?.taskModels ?? {});

  const officialDuration = song.lengthSeconds || 0;

  const messages = buildThematicAnalysisMessages(ctx, audioBase64, officialDuration);
  const start = Date.now();
  const result = await callOpenRouter({
    apiKey,
    model,
    messages,
    maxTokens: 4000,
  });

  const { sections } = parseStoryboardResponse(result.text);

  // Log
  await db.insert(aiCalls).values({
    worldId: args.worldId,
    storyId: args.storyId,
    task: "storyboard_song",
    model,
    prompt: serializePromptForStorage(messages),
    response: result.text,
    costUsd: result.usage.costUsd?.toString(),
    durationMs: Date.now() - start,
  });

  await db
    .update(storySongs)
    .set({
      sections,
      prompt: serializePromptForStorage(messages),
    })
    .where(eq(storySongs.id, song.id));
}

function buildThematicAnalysisMessages(ctx: any, audioBase64: string, totalLength: number): ChatMessage[] {
  const system = [
    "You are a professional music video director.",
    "Your task is to analyze the audio's musical and thematic structure to generate a structural storyboard.",
    "",
    "OBJECTIVE:",
    "Identify the major musical sections (Intro, Verse, Chorus, Bridge, Outro) based on the audio's energy, instrumentation, and emotional shifts. Map these to the provided story context.",
    "",
    "Each section in the \"sections\" array must follow this schema:",
    "{",
    "  \"startSeconds\": number,",
    "  \"endSeconds\": number,",
    "  \"description\": \"Detailed description of the musical and emotional content of this section\",",
    "  \"mood\": \"The emotional tone (e.g., 'Heroic', 'Melancholy', 'Aggressive')\",",
    "  \"characters\": \"comma-separated list of character names (CHOOSE ONLY FROM THE PROVIDED LIST)\",",
    "  \"scenes\": \"comma-separated list of location names (CHOOSE ONLY FROM THE PROVIDED LIST)\",",
    "  \"clipIdeas\": [\"Visual idea for a specific shot\", \"Another visual idea\", ...]",
    "}",
    "",
    "CRITICAL RULES:",
    "1. MATHEMATICAL CONTINUITY: The storyboard is a perfect sequence. startSeconds must start at 0. Each section's startSeconds MUST equal the previous section's endSeconds.",
    "2. EXACT ENDING: The last section's endSeconds MUST be exactly ${totalLength}.",
    "3. FULL COVERAGE: Zero gaps from 0 to ${totalLength}.",
    "4. ENTITY SELECTION: You MUST only use character names and location names from the provided lists below. Do not invent new characters or places.",
    "5. CLIP IDEAS: Generate visual clip ideas proportional to the section length. Aim for roughly 1 unique clip idea for every 3-5 seconds of duration (e.g., a 15s section should have 3-5 clip ideas). Each idea should be cinematic and fit the world's art style.",
    "6. FORMAT: Output a SINGLE JSON object with a \"sections\" array. You may include a brief thinking/analysis text BEFORE the JSON.",
  ].join("\n");

  const user = [
    `# WORLD: ${ctx.world.name}`,
    `Style: ${ctx.world.artStyle}`,
    "",
    `# STORY: ${ctx.story.name}`,
    `TOTAL DURATION: ${totalLength} seconds (MUST hit this exactly)`,
    ctx.story.description,
    "",
    "# AVAILABLE CHARACTERS",
    ...ctx.characters.map((c: any) => `- ${c.name}: ${c.description}`),
    "",
    "# AVAILABLE LOCATIONS",
    ...ctx.locations.map((l: any) => `- ${l.name}: ${l.description}`),
    "",
    "# REFERENCE LYRICS",
    ctx.story.lyrics || "No fixed lyrics provided.",
    "",
    "Perform the structural analysis now. Ensure you use the character and location names provided above. The last section MUST end at exactly ${totalLength}.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: [
      { type: "input_audio", input_audio: { data: audioBase64, format: "mp3" } },
      { type: "text", text: user }
    ] },
  ];
}

function parseStoryboardResponse(text: string): { sections: SongSection[] } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI failed to return a JSON object.");

  const jsonText = text.slice(start, end + 1);
  const data = JSON.parse(jsonText);
  return { sections: data.sections || [] };
}

function extractSrt(text: string): string {
  const match = text.match(/\d+\s+\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
  if (match) {
    return text.slice(text.indexOf(match[0])).trim();
  }
  return text.trim();
}

