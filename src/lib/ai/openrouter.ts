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

export type OpenRouterVideoResult = {
  video: Buffer;
  mimeType: string;
  usage: OpenRouterUsage;
  jobId: string;
};

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TRANSCRIPTION_ENDPOINT =
  "https://openrouter.ai/api/v1/audio/transcriptions";
const VIDEO_ENDPOINT = "https://openrouter.ai/api/v1/videos";

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
  if (!text && images.length === 0) {
    throw new OpenRouterError(
      "OpenRouter response missing both text and image content",
      res.status,
      raw,
    );
  }

  return { text: text || "", images, usage: extractUsage(data) };
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

export async function callOpenRouterVideo(args: {
  apiKey: string;
  model: string;
  prompt: string;
  firstFrameDataUrl?: string;
  durationSeconds?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9" | "9:21";
  resolution?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<OpenRouterVideoResult> {
  const submit = await fetch(VIDEO_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${args.apiKey}`,
      "X-Title": "Storytelly",
    },
    body: JSON.stringify({
      model: args.model,
      prompt: args.prompt,
      aspect_ratio: args.aspectRatio ?? "16:9",
      duration: args.durationSeconds,
      resolution: args.resolution ?? "720p",
      generate_audio: false,
      frame_images: args.firstFrameDataUrl
        ? [
            {
              type: "image_url",
              image_url: { url: args.firstFrameDataUrl },
              frame_type: "first_frame",
            },
          ]
        : undefined,
    }),
    signal: args.signal,
  });

  const submitRaw = await submit.text();
  if (!submit.ok) {
    throw new OpenRouterError(
      `OpenRouter Video ${submit.status}: ${submitRaw.slice(0, 600)}`,
      submit.status,
      submitRaw,
    );
  }

  const submitted = parseJsonObject(submitRaw, submit.status);
  const jobId = stringField(submitted, "id");
  const pollingUrl = stringField(submitted, "polling_url");
  if (!jobId || !pollingUrl) {
    throw new OpenRouterError(
      "OpenRouter video response missing job id or polling URL",
      submit.status,
      submitRaw,
    );
  }

  const startedAt = Date.now();
  const timeoutMs = args.timeoutMs ?? 285_000;
  const pollIntervalMs = args.pollIntervalMs ?? 5_000;

  while (Date.now() - startedAt < timeoutMs) {
    await wait(pollIntervalMs, args.signal);
    const poll = await fetch(resolveOpenRouterUrl(pollingUrl), {
      headers: { authorization: `Bearer ${args.apiKey}` },
      signal: args.signal,
    });
    const pollRaw = await poll.text();
    if (!poll.ok) {
      throw new OpenRouterError(
        `OpenRouter Video Poll ${poll.status}: ${pollRaw.slice(0, 600)}`,
        poll.status,
        pollRaw,
      );
    }

    const status = parseJsonObject(pollRaw, poll.status);
    const state = stringField(status, "status");
    if (state === "failed" || state === "cancelled" || state === "expired") {
      throw new OpenRouterError(
        `OpenRouter video generation ${state}: ${String(status.error ?? "Unknown error")}`,
        poll.status,
        pollRaw,
      );
    }
    if (state !== "completed") continue;

    const url = firstString(status.unsigned_urls) ?? contentUrlForJob(jobId);
    const downloaded = await downloadOpenRouterVideo(url, args.apiKey, args.signal);
    return {
      video: downloaded.video,
      mimeType: downloaded.mimeType,
      usage: extractUsage(status),
      jobId,
    };
  }

  throw new OpenRouterError(
    "OpenRouter video generation timed out before completion",
    408,
    JSON.stringify({ jobId, pollingUrl }),
  );
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

function parseJsonObject(raw: string, status: number): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // handled below
  }
  throw new OpenRouterError("OpenRouter returned non-JSON response", status, raw);
}

function stringField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === "string" && value ? value : null;
}

function firstString(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

function resolveOpenRouterUrl(url: string): string {
  return new URL(url, "https://openrouter.ai").toString();
}

function contentUrlForJob(jobId: string): string {
  return `${VIDEO_ENDPOINT}/${encodeURIComponent(jobId)}/content?index=0`;
}

async function downloadOpenRouterVideo(
  url: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ video: Buffer; mimeType: string }> {
  const resolved = resolveOpenRouterUrl(url);
  const res = await fetch(resolved, {
    headers: resolved.startsWith("https://openrouter.ai/")
      ? { authorization: `Bearer ${apiKey}` }
      : undefined,
    signal,
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new OpenRouterError(
      `OpenRouter Video Download ${res.status}: ${raw.slice(0, 600)}`,
      res.status,
      raw,
    );
  }
  return {
    video: Buffer.from(await res.arrayBuffer()),
    mimeType: res.headers.get("content-type") || "video/mp4",
  };
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
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
