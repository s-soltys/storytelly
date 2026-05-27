export const TASK_DEFAULTS = {
  chat: "google/gemini-3.1-flash-lite",
  lyrics: "google/gemini-3-flash-preview",
  song: "google/lyria-3-pro-preview",
  analyze_song: "google/gemini-2.0-flash-001",
  transcription: "google/gemini-2.0-flash-001",
  generate_image: "google/gemini-2.5-flash-image",
  generate_video: "google/veo-3.1-lite",
  vision: "google/gemini-2.0-flash-001",
} as const;

export type AiTask = keyof typeof TASK_DEFAULTS;

export const AI_TASKS = Object.keys(TASK_DEFAULTS) as AiTask[];

export function getModelForTask(
  task: AiTask,
  taskModels: Record<string, string>,
): string {
  return taskModels[task]?.trim() || TASK_DEFAULTS[task];
}

export type VideoModelConfig = {
  durations: number[];
  defaultDuration: number;
  resolution: string;
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9" | "9:21";
};

const VIDEO_MODEL_CONFIGS: Array<{
  match: RegExp;
  config: VideoModelConfig;
}> = [
  {
    match: /^alibaba\/wan-2\.6(?:$|[:/])/,
    config: { durations: [5, 10], defaultDuration: 5, resolution: "720p", aspectRatio: "16:9" },
  },
  {
    match: /^google\/veo-3\.1(?:-lite)?(?:$|[:/])/,
    config: { durations: [4, 6, 8], defaultDuration: 6, resolution: "720p", aspectRatio: "16:9" },
  },
];

const DEFAULT_VIDEO_MODEL_CONFIG: VideoModelConfig = {
  durations: [5],
  defaultDuration: 5,
  resolution: "720p",
  aspectRatio: "16:9",
};

export function getVideoModelConfig(model: string): VideoModelConfig {
  return (
    VIDEO_MODEL_CONFIGS.find((entry) => entry.match.test(model))?.config ??
    DEFAULT_VIDEO_MODEL_CONFIG
  );
}

export function chooseVideoDuration(
  model: string,
  targetSeconds: number,
): number {
  const config = getVideoModelConfig(model);
  const sorted = [...config.durations].sort((a, b) => a - b);
  for (const duration of sorted) {
    if (duration >= targetSeconds) return duration;
  }
  return sorted[sorted.length - 1] ?? config.defaultDuration;
}
