export const TASK_DEFAULTS = {
  lyrics: "google/gemini-2.5-pro",
  song: "google/lyria-3-pro-preview",
} as const;

export type AiTask = keyof typeof TASK_DEFAULTS;

export const AI_TASKS = Object.keys(TASK_DEFAULTS) as AiTask[];

export function getModelForTask(
  task: AiTask,
  taskModels: Record<string, string>,
): string {
  return taskModels[task]?.trim() || TASK_DEFAULTS[task];
}
