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
  durationSeconds?: number | null;
};

export type OpenRouterResult = {
  text: string;
  images: string[];
  videos: string[];
  usage: OpenRouterUsage;
};

export type OpenRouterTranscriptionResult = {
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  usage: OpenRouterUsage;
};

export type OpenRouterAudioResult = {
  audio: Buffer;
  transcript: string;
  usage: OpenRouterUsage;
  generationId: string | null;
};

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TRANSCRIPTION_ENDPOINT =
  "https://openrouter.ai/api/v1/audio/transcriptions";

export async function callOpenRouter(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  responseFormat?: { type: "json_object" };
  maxTokens?: number;
  modalities?: string[];
  imageConfig?: Record<string, unknown>;
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
      response_format: args.responseFormat,
      max_tokens: args.maxTokens,
      modalities: args.modalities,
      image_config: args.imageConfig,
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
  const images = extractImages(data);
  const videos = extractVideos(data);
  if (!text && images.length === 0 && videos.length === 0) {
    throw new OpenRouterError(
      "OpenRouter response missing text, image, and video content",
      res.status,
      raw,
    );
  }

  return { text: text || "", images, videos, usage: extractUsage(data) };
}

export async function transcribeAudio(args: {
  apiKey: string;
  model: string;
  audioBase64: string;
  format: "mp3" | "wav" | "flac" | "opus";
  language?: string;
  prompt?: string;
  signal?: AbortSignal;
}): Promise<OpenRouterTranscriptionResult> {
  const res = await fetch(TRANSCRIPTION_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${args.apiKey}`,
      "X-Title": "Storytelly",
    },
    body: JSON.stringify({
      model: args.model,
      input_audio: {
        data: args.audioBase64,
        format: args.format,
      },
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      language: args.language,
      prompt: args.prompt,
    }),
    signal: args.signal,
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new OpenRouterError(
      `OpenRouter Transcription ${res.status}: ${raw.slice(0, 600)}`,
      res.status,
      raw,
    );
  }

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new OpenRouterError(
      "OpenRouter returned non-JSON response",
      res.status,
      raw,
    );
  }

  return {
    text: data.text || "",
    segments: data.segments?.map((s: any) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })),
    usage: extractUsage(data),
  };
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
      .filter((p) => typeof p === "object" && p && "text" in p)
      .map((p) => String((p as { text: unknown }).text))
      .join("\n");
  }
  return null;
}

function extractImages(data: unknown): string[] {
  const message = (data as {
    choices?: { message?: { content?: unknown; images?: unknown[] } }[];
  })?.choices?.[0]?.message;

  if (!message) return [];

  const found: string[] = [];

  // OpenRouter specific images array
  if (Array.isArray(message.images)) {
    for (const img of message.images) {
      if (typeof img === "string") {
        found.push(img);
      } else if (typeof img === "object" && img) {
        if ("image_url" in img) {
          found.push((img as { image_url: { url: string } }).image_url.url);
        } else if ("url" in img) {
          found.push((img as { url: string }).url);
        }
      }
    }
  }

  // OpenAI style content parts
  if (Array.isArray(message.content)) {
    for (const p of message.content) {
      if (typeof p === "object" && p && "image_url" in p) {
        found.push((p as { image_url: { url: string } }).image_url.url);
      }
    }
  }

  return found;
}

function extractVideos(data: unknown): string[] {
  const message = (data as {
    choices?: { message?: { content?: unknown; videos?: unknown[] } }[];
  })?.choices?.[0]?.message;

  if (!message) return [];

  const found: string[] = [];

  // OpenRouter specific videos array
  if (Array.isArray(message.videos)) {
    for (const vid of message.videos) {
      if (typeof vid === "string") {
        found.push(vid);
      } else if (typeof vid === "object" && vid) {
        if ("video_url" in vid) {
          found.push((vid as { video_url: { url: string } }).video_url.url);
        } else if ("url" in vid) {
          found.push((vid as { url: string }).url);
        }
      }
    }
  }

  // Content parts (some models might return video parts)
  if (Array.isArray(message.content)) {
    for (const p of message.content) {
      if (typeof p === "object" && p && "video_url" in p) {
        found.push((p as { video_url: { url: string } }).video_url.url);
      }
    }
  }

  return found;
}

function extractUsage(data: unknown): OpenRouterUsage {
  const u = (data as { usage?: Record<string, unknown> })?.usage ?? {};
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    promptTokens: num(u.prompt_tokens),
    completionTokens: num(u.completion_tokens),
    costUsd: num(u.cost),
    durationSeconds: num(u.seconds) || num(u.duration),
  };
}
