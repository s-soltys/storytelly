import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { stories, worlds, settings as settingsTable, characters, locations } from "@/db/schema";
import { getMessages, createMessage } from "@/lib/services/messages";
import { generateLyrics } from "@/lib/ai/songScript";
import { generateStorySong } from "@/lib/ai/song";
import { callOpenRouter, OpenRouterError, type ChatMessage, type Tool } from "@/lib/ai/openrouter";
import { getModelForTask } from "@/lib/ai/tasks";
import { jsonError } from "@/lib/server";
import { createAiCall } from "@/lib/services/aiLogs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ worldId: string; storyId: string }> };

const developSchema = z.object({
  message: z.string().trim().min(1),
});

const TOOLS: Tool[] = [

  {
    type: "function",
    function: {
      name: "generate_lyrics",
      description: "Generate or revise the lyrics for the song based on the current story context and user instructions. Use this when the user asks to write, edit, or adjust lyrics.",
      parameters: {
        type: "object",
        properties: {
          instructions: { type: "string", description: "Explicit instructions for the lyrics generation/revision." },
        },
        required: ["instructions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_mp3",
      description: "Trigger the AI to compose and generate the final MP3 audio for the song. Use this when the user says the lyrics look good and they are ready to hear the song.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

export async function POST(req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = developSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const { message } = parsed.data;

  // Context loading
  const [story] = await db
    .select()
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)));
  if (!story) return jsonError(404, "Story not found");

  const [world] = await db.select().from(worlds).where(eq(worlds.id, worldId));
  if (!world) return jsonError(404, "World not found");

  const [config] = await db.select().from(settingsTable).limit(1);
  const apiKey = config?.openrouterApiKey?.trim();
  if (!apiKey) {
    return jsonError(400, "OpenRouter API key is not configured. Add one in settings.");
  }

  // Insert User Message
  await createMessage({
    storyId,
    role: "user",
    content: message,
  });

  // Fetch History
  const history = await getMessages(storyId);

  // Window history to last N messages to control context size
  const WINDOW_SIZE = 30;
  const windowed = history.length > WINDOW_SIZE 
    ? history.slice(-WINDOW_SIZE)
    : history;

  let systemPrompt = [
    `You are an expert songwriter and creative partner. You are helping the user write a song in the world of "${world.name}".`,
    `World style: ${world.artStyle}`,
    `Story name: ${story.name}`,
    `Story description (DO NOT change this, just use it for inspiration): ${story.description}`,
    `Target length: ${story.lengthSeconds}s`,
    `Current lyrics length: ${story.lyrics?.length || 0} chars.`,
    `Your job is to have a conversation with the user to brainstorm ideas, write and revise lyrics, and eventually generate an MP3.`,
    `If the user asks to generate or revise lyrics, call 'generate_lyrics'.`,
    `If the user says the lyrics are good and wants to hear the song, call 'generate_mp3'.`,
    `Be conversational, creative, and lean into your expertise as a professional songwriter.`
  ].join("\n");

  if (history.length > WINDOW_SIZE) {
    systemPrompt += `\n\nThe conversation history has been trimmed to the last ${WINDOW_SIZE} messages for context management.`;
  }

  const chatMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of windowed) {
    if (msg.role === "user" || msg.role === "system") {
      chatMessages.push({ role: msg.role, content: msg.content || "" });
    } else if (msg.role === "assistant") {
      chatMessages.push({
        role: "assistant",
        content: msg.content || null,
        tool_calls: (msg.toolCalls as any) || undefined,
      });
    } else if (msg.role === "tool") {
      chatMessages.push({
        role: "tool",
        content: msg.content || "",
        tool_call_id: msg.toolCallId || "",
      });
    }
  }

  try {
    const callStart = Date.now();
    let result = await callOpenRouter({
      apiKey,
      model: getModelForTask("chat", config?.taskModels ?? {}),
      messages: chatMessages,
      tools: TOOLS,
      toolChoice: "auto",
    });

    if (result.usage.costUsd != null || result.usage.promptTokens != null) {
      await createAiCall({
        worldId,
        storyId,
        task: "develop_chat",
        model: getModelForTask("chat", config?.taskModels ?? {}),
        prompt: message.slice(0, 500),
        response: result.text?.slice(0, 1000) ?? null,
        costUsd: result.usage.costUsd != null ? result.usage.costUsd.toString() : null,
        durationMs: Date.now() - callStart,
      }).catch(() => {});
    }

    // Save assistant response
    await createMessage({
      storyId,
      role: "assistant",
      content: result.text || null,
      toolCalls: result.tool_calls || null,
    });

    let finalReply = result.text;
    let anyToolCalled = false;
    let newLyrics: string | undefined;

    // If tools are called, we STOP here and return them to the client
    // so the client can present the Approve/Reject UI.
    if (result.tool_calls && result.tool_calls.length > 0) {
      anyToolCalled = true;
      // We already saved the assistant message with toolCalls above (lines 134-139).
      // We don't execute them now.
    }

    return Response.json(
      { reply: finalReply || "Done.", toolsExecuted: false, lyrics: newLyrics },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return jsonError(502, err.message, { providerStatus: err.status });
    }
    console.error("develop endpoint error", err);
    return jsonError(500, err instanceof Error ? err.message : "Generation failed");
  }
}
