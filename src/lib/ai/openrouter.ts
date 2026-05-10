export type ChatTextPart = { type: "text"; text: string };
export type ChatImagePart = {
  type: "image_url";
  image_url: { url: string };
};
export type ChatAudioPart = {
  type: "input_audio";
  input_audio: { data: string; format: "mp3" | "wav" | "flac" | "opus" };
};
export type ChatPart = ChatTextPart | ChatImagePart | ChatAudioPart;

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: ChatPart[] | string }
  | { role: "assistant"; content: string };

export type OpenRouterUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
};

export type OpenRouterResult = {
  text: string;
  usage: OpenRouterUsage;
};

export type OpenRouterAudioResult = {
  audio: Buffer;
  transcript: string;
  usage: OpenRouterUsage;
  generationId: string | null;
};

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export async function callOpenRouter(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<OpenRouterResult> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${args.apiKey}`,
      "X-Title": "Storytelly",
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      usage: { include: true },
    }),
    signal: args.signal,
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new OpenRouterError(
      `OpenRouter ${res.status}: ${raw.slice(0, 600)}`,
      res.status,
      raw,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new OpenRouterError(
      "OpenRouter returned non-JSON response",
      res.status,
      raw,
    );
  }

  const text = extractText(data);
  if (!text) {
    throw new OpenRouterError(
      "OpenRouter response missing text content",
      res.status,
      raw,
    );
  }

  return { text, usage: extractUsage(data) };
}

export async function callOpenRouterAudio(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  format: "mp3" | "wav" | "flac" | "opus";
  signal?: AbortSignal;
}): Promise<OpenRouterAudioResult> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${args.apiKey}`,
      "X-Title": "Storytelly",
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      modalities: ["text", "audio"],
      audio: { format: args.format },
      stream: true,
      usage: { include: true },
    }),
    signal: args.signal,
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new OpenRouterError(
      `OpenRouter ${res.status}: ${raw.slice(0, 600)}`,
      res.status,
      raw,
    );
  }
  if (!res.body) {
    throw new OpenRouterError("OpenRouter returned no audio stream", res.status, "");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let transcript = "";
  const audioChunks: string[] = [];
  let usage: OpenRouterUsage = {
    promptTokens: null,
    completionTokens: null,
    costUsd: null,
  };

  function handleEvent(raw: string) {
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    for (const line of lines) {
      if (!line || line === "[DONE]") continue;
      const parsed = JSON.parse(line) as {
        choices?: Array<{ delta?: { audio?: { data?: string; transcript?: string } } }>;
        usage?: Record<string, unknown>;
      };
      const audio = parsed.choices?.[0]?.delta?.audio;
      if (audio?.data) audioChunks.push(audio.data);
      if (audio?.transcript) transcript += audio.transcript;
      if (parsed.usage) usage = extractUsage(parsed);
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const events = buffered.split("\n\n");
    buffered = events.pop() ?? "";
    for (const event of events) handleEvent(event);
  }
  buffered += decoder.decode();
  if (buffered.trim()) handleEvent(buffered);

  const audio = Buffer.from(audioChunks.join(""), "base64");
  if (audio.length === 0) {
    throw new OpenRouterError("OpenRouter response missing audio content", res.status, "");
  }

  return {
    audio,
    transcript,
    usage,
    generationId: res.headers.get("x-generation-id"),
  };
}

export class OpenRouterError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
    this.body = body;
  }
}

function extractText(data: unknown): string | null {
  const choice = (data as {
    choices?: { message?: { content?: unknown } }[];
  })?.choices?.[0]?.message?.content;
  if (typeof choice === "string") return choice;
  if (Array.isArray(choice)) {
    return choice
      .map((p) => (typeof p === "object" && p && "text" in p ? String((p as { text: unknown }).text) : ""))
      .join("");
  }
  return null;
}

function extractUsage(data: unknown): OpenRouterUsage {
  const u = (data as { usage?: Record<string, unknown> })?.usage ?? {};
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    promptTokens: num(u.prompt_tokens),
    completionTokens: num(u.completion_tokens),
    costUsd: num(u.cost),
  };
}
