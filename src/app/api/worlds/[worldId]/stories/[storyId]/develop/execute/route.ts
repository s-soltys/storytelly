import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { stories, worlds, settings as settingsTable } from "@/db/schema";
import { getMessages, createMessage } from "@/lib/services/messages";
import { generateLyrics } from "@/lib/ai/songScript";
import { generateStorySong } from "@/lib/ai/song";
import { callOpenRouter, OpenRouterError, type ChatMessage } from "@/lib/ai/openrouter";
import { getModelForTask } from "@/lib/ai/tasks";
import { jsonError } from "@/lib/server";
import { createAiCall } from "@/lib/services/aiLogs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ worldId: string; storyId: string }> };

const executeSchema = z.object({
  toolCallId: z.string().min(1),
  approved: z.boolean(),
});

export async function POST(req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = executeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const { toolCallId, approved } = parsed.data;

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

  // Fetch History to find the tool call
  const history = await getMessages(storyId);

  // Window history to last N messages to control context size
  const WINDOW_SIZE = 30;
  const windowed = history.length > WINDOW_SIZE 
    ? history.slice(-WINDOW_SIZE)
    : history;

  // Find the assistant message containing this toolCallId
  let targetCall: any = null;
  for (const msg of history) {
    if (msg.role === "assistant" && msg.toolCalls) {
      const calls = msg.toolCalls as any[];
      const call = calls.find((c) => c.id === toolCallId);
      if (call) {
        targetCall = call;
        break;
      }
    }
  }

  if (!targetCall) {
    return jsonError(404, "Tool call not found");
  }

  // Check if tool is already executed
  const alreadyExecuted = history.some((m) => m.role === "tool" && m.toolCallId === toolCallId);
  if (alreadyExecuted) {
    return jsonError(400, "Tool call already executed or rejected");
  }

  let toolResult = "";
  let newLyrics: string | undefined;

  if (!approved) {
    toolResult = "User rejected this action.";
  } else {
    try {
      const args = JSON.parse(targetCall.function.arguments || "{}");
      if (targetCall.function.name === "generate_lyrics") {
        const res = await generateLyrics({
          worldId,
          storyId,
          lengthSeconds: story.lengthSeconds,
          instructions: args.instructions,
        });
        await db.update(stories).set({ lyrics: res.lyrics }).where(eq(stories.id, storyId));
        newLyrics = res.lyrics;
        toolResult = `Lyrics generated successfully:\n\n${res.lyrics}`;
      } else if (targetCall.function.name === "generate_mp3") {
        await generateStorySong({
          worldId,
          storyId,
          lengthSeconds: story.lengthSeconds,
        });
        toolResult = "MP3 generated successfully and added to the Songs panel.";
      } else {
        toolResult = "Unknown tool.";
      }
    } catch (err) {
      toolResult = `Error executing tool: ${(err as Error).message}`;
    }
  }

  // Save the tool message
  await createMessage({
    storyId,
    role: "tool",
    content: toolResult,
    toolCallId: targetCall.id,
  });

  // Now we need to ask the LLM to summarize the execution
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

  // Rebuild the history for the LLM
  // Note: we need to include the freshly saved tool message too
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
  // append the new one
  chatMessages.push({
    role: "tool",
    content: toolResult,
    tool_call_id: targetCall.id,
  });

  try {
    const callStart = Date.now();
    const result = await callOpenRouter({
      apiKey,
      model: getModelForTask("chat", config?.taskModels ?? {}),
      messages: chatMessages,
      // tools: TOOLS, // Not providing tools on the summarize step to prevent infinite loops, or provide them so it can call again? Usually we provide them.
    });

    if (result.usage.costUsd != null || result.usage.promptTokens != null) {
      await createAiCall({
        worldId,
        storyId,
        task: "develop_chat",
        model: getModelForTask("chat", config?.taskModels ?? {}),
        prompt: `${targetCall.function.name} ${targetCall.function.arguments?.slice(0, 400) ?? ""}`,
        response: result.text?.slice(0, 1000) ?? null,
        costUsd: result.usage.costUsd != null ? result.usage.costUsd.toString() : null,
        durationMs: Date.now() - callStart,
      }).catch(() => {});
    }

    await createMessage({
      storyId,
      role: "assistant",
      content: result.text || null,
      toolCalls: result.tool_calls || null,
    });

    return Response.json(
      { reply: result.text || "Done.", toolsExecuted: approved, lyrics: newLyrics },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return jsonError(502, err.message, { providerStatus: err.status });
    }
    console.error("develop execute endpoint error", err);
    return jsonError(500, err instanceof Error ? err.message : "Execution summary failed");
  }
}
