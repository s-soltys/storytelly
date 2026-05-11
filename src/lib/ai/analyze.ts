import { db } from "@/db/client";
import { settings as settingsTable, storySongs, aiCalls, songClips, type SongSection } from "@/db/schema";
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

  const { sections: initialSections } = parseStoryboardResponse(result.text);

  // Log Pass 1
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

  // Pass 2: Generate clip ideas proportionally using a text model
  const textModel = getModelForTask("lyrics", config?.taskModels ?? {});
  const pass2Messages = buildClipIdeasMessages(ctx, initialSections, officialDuration);
  const pass2Start = Date.now();
  const pass2Result = await callOpenRouter({
    apiKey,
    model: textModel,
    messages: pass2Messages,
    maxTokens: 4000,
  });

  const finalSections = parseClipIdeasResponse(pass2Result.text, initialSections);

  // Log Pass 2
  await db.insert(aiCalls).values({
    worldId: args.worldId,
    storyId: args.storyId,
    task: "storyboard_clips",
    model: textModel,
    prompt: serializePromptForStorage(pass2Messages),
    response: pass2Result.text,
    costUsd: pass2Result.usage.costUsd?.toString(),
    durationMs: Date.now() - pass2Start,
  });

  // Save the sections WITHOUT clipIdeas
  await db
    .update(storySongs)
    .set({
      sections: initialSections,
      prompt: serializePromptForStorage(messages) + "\n\n---\n\n" + serializePromptForStorage(pass2Messages),
    })
    .where(eq(storySongs.id, song.id));

  // Clear existing clips and insert new ones
  await db.delete(songClips).where(eq(songClips.songId, song.id));
  
  const allClipsToInsert = [];
  for (let i = 0; i < finalSections.length; i++) {
    const section = finalSections[i];
    const clipIdeas: string[] = (section as any).clipIdeas || [];
    for (let j = 0; j < clipIdeas.length; j++) {
      allClipsToInsert.push({
        songId: song.id,
        sectionIndex: i,
        description: clipIdeas[j],
        position: j,
      });
    }
  }

  if (allClipsToInsert.length > 0) {
    await db.insert(songClips).values(allClipsToInsert);
  }
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
    "  \"description\": \"Extremely verbose and detailed description of the narrative action, musical intensity, and emotional content occurring in this section.\",",
    "  \"mood\": \"The emotional tone (e.g., 'Heroic', 'Melancholy', 'Aggressive')\",",
    "  \"characters\": \"comma-separated list of character names (CHOOSE ONLY FROM THE PROVIDED LIST)\",",
    "  \"scenes\": \"comma-separated list of location names (CHOOSE ONLY FROM THE PROVIDED LIST)\"",
    "}",
    "",
    "CRITICAL RULES:",
    "1. MATHEMATICAL CONTINUITY: The storyboard is a perfect sequence. startSeconds must start at 0. Each section's startSeconds MUST equal the previous section's endSeconds.",
    "2. EXACT ENDING: The last section's endSeconds MUST be exactly ${totalLength}.",
    "3. FULL COVERAGE: Zero gaps from 0 to ${totalLength}.",
    "4. ENTITY SELECTION: You MUST only use character names and location names from the provided lists below. Do not invent new characters or places.",
    "5. FORMAT: Output a SINGLE JSON object with a \"sections\" array. You may include a brief thinking/analysis text BEFORE the JSON.",
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

function buildClipIdeasMessages(ctx: any, sections: SongSection[], totalLength: number): ChatMessage[] {
  const system = [
    "You are an expert cinematographer and storyboard artist.",
    "Your task is to break down a sequence of timeline sections into specific, cinematic visual clip ideas.",
    "",
    "OBJECTIVE:",
    "For each section provided, generate a list of clip ideas that match its duration. You MUST generate roughly 1 unique clip idea for every 2 to 5 seconds of the section's duration, deciding the frequency based on the dynamism of the scene and description.",
    "",
    "Each section in the \"sections\" array must follow this schema:",
    "{",
    "  \"startSeconds\": number,",
    "  \"endSeconds\": number,",
    "  \"_durationCalc\": \"e.g., 24 - 10 = 14 seconds\",",
    "  \"_targetClipsCalc\": \"e.g., 14 seconds / 3 = ~5 clips (dynamism-dependent)\",",
    "  \"clipIdeas\": [\"Visual idea for a specific shot\", ...]",
    "}",
    "",
    "CRITICAL RULES:",
    "1. DO NOT MODIFY THE TIMESTAMPS. Keep startSeconds and endSeconds exactly as provided.",
    "2. CLIP IDEAS PROPORTION: You MUST generate 1 unique clip idea for every 3 to 7 seconds of the section's duration. Use the `_durationCalc` and `_targetClipsCalc` fields to do the math first based on the scene's dynamism, then provide exactly that number of clips in the `clipIdeas` array. Static and calm scenes should have longer clips, dynamic and intense scenes should have more frequent cuts.",
    "3. CINEMATOGRAPHY: Clip descriptions should be 2-5 sentences. Define the starting point (as is), describe what happens during the clip, and add a length suggestion (3-7 seconds).",
    "4. CONSISTENCY: Ensure the ideas perfectly match the characters, scenes, and verbose descriptions of that section.",
    "5. FORMAT: Output a SINGLE JSON object with a \"sections\" array.",
  ].join("\n");

  const sectionsContext = JSON.stringify(sections.map(s => ({
    startSeconds: s.startSeconds,
    endSeconds: s.endSeconds,
    description: s.description,
    mood: s.mood,
    characters: s.characters,
    scenes: s.scenes
  })), null, 2);

  const user = [
    `# WORLD: ${ctx.world.name}`,
    `Style: ${ctx.world.artStyle}`,
    "",
    `# STORY: ${ctx.story.name}`,
    ctx.story.description,
    "",
    "# AVAILABLE CHARACTERS",
    ...ctx.characters.map((c: any) => `- ${c.name}: ${c.description}`),
    "",
    "# AVAILABLE LOCATIONS",
    ...ctx.locations.map((l: any) => `- ${l.name}: ${l.description}`),
    "",
    "# SECTIONS TO BREAK DOWN",
    sectionsContext,
    "",
    "Generate the cinematic clip ideas for each section now. Remember: 1 clip per 2-5 seconds of duration, depending on scene dynamism.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

function parseClipIdeasResponse(text: string, originalSections: SongSection[]): SongSection[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI failed to return a JSON object for clips.");

  const jsonText = text.slice(start, end + 1);
  const data = JSON.parse(jsonText);
  const newSections = data.sections || [];

  return originalSections.map(orig => {
    const match = newSections.find((s: any) => s.startSeconds === orig.startSeconds && s.endSeconds === orig.endSeconds);
    return {
      ...orig,
      clipIdeas: match?.clipIdeas || [],
    };
  });
}

