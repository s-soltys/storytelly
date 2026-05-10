export type ChatTextPart = { type: "text"; text: string };
export type ChatImagePart = {
  type: "image_url";
  image_url: { url: string };
};
export type ChatPart = ChatTextPart | ChatImagePart;

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
