export type ApiError = { error: string; details?: unknown };

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err: ApiError = data ?? { error: res.statusText };
    throw Object.assign(new Error(err.error), { details: err.details, status: res.status });
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) =>
    fetch(url, { cache: "no-store" }).then((r) => handle<T>(r)),
  post: <T>(url: string, body: unknown) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  patch: <T>(url: string, body: unknown) =>
    fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  put: <T>(url: string, body: unknown) =>
    fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  del: <T>(url: string) =>
    fetch(url, { method: "DELETE" }).then((r) => handle<T>(r)),
  upload: <T>(url: string, form: FormData) =>
    fetch(url, { method: "POST", body: form }).then((r) => handle<T>(r)),
};

export type WorldDto = {
  id: string;
  name: string;
  artStyle: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  moodImages?: ImageDto[];
};

export type ImageDto = {
  id: string;
  url: string;
  s3Key: string;
  position: number;
};

export type CharacterDto = {
  id: string;
  worldId: string;
  name: string;
  description: string;
  createdAt: string;
  images?: ImageDto[];
};

export type LocationDto = CharacterDto;

export type StoryDto = {
  id: string;
  worldId: string;
  description: string;
  lengthSeconds: number;
  createdAt: string;
  characterIds?: string[];
  locationIds?: string[];
  moodImages?: ImageDto[];
};

export type SettingsDto = {
  openrouterApiKeyMasked: string | null;
  openrouterApiKeyConfigured: boolean;
  taskModels: Record<string, string>;
  effectiveTaskModels: Record<string, string>;
};

export type StoryScriptDto = {
  id: string;
  storyId: string;
  model: string;
  script: string;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: string | null;
  createdAt: string;
};
