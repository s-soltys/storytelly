export const TASK_DEFAULTS = {
  lyrics: "google/gemini-2.0-pro-exp-02-05:free",
  song: "google/lyria-3-pro-preview",
  analyze_song: "google/gemini-2.0-flash-001",
} as const;

export type AiTask = keyof typeof TASK_DEFAULTS;

export const AI_TASKS = Object.keys(TASK_DEFAULTS) as AiTask[];

export function getModelForTask(
  task: AiTask,
  taskModels: Record<string, string>,
): string {
  return taskModels[task]?.trim() || TASK_DEFAULTS[task];
}
