import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settings as settingsTable } from "@/db/schema";
import { settingsUpdateSchema } from "@/lib/validation";
import { jsonError } from "@/lib/server";
import { TASK_DEFAULTS } from "@/lib/ai/tasks";

export const dynamic = "force-dynamic";

const SINGLETON_ID = 1;

async function loadOrInit() {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.id, SINGLETON_ID));
  if (row) return row;
  const [created] = await db
    .insert(settingsTable)
    .values({ id: SINGLETON_ID })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  // Race-condition fallback.
  const [again] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.id, SINGLETON_ID));
  return again!;
}

function maskKey(key: string | null): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function dto(row: { openrouterApiKey: string | null; taskModels: Record<string, string> }) {
  const taskModels = row.taskModels ?? {};
  const effective: Record<string, string> = { ...TASK_DEFAULTS };
  for (const [k, v] of Object.entries(taskModels)) {
    if (v?.trim()) effective[k] = v.trim();
  }
  return {
    openrouterApiKeyMasked: maskKey(row.openrouterApiKey),
    openrouterApiKeyConfigured: Boolean(row.openrouterApiKey?.trim()),
    taskModels,
    effectiveTaskModels: effective,
  };
}

export async function GET() {
  const row = await loadOrInit();
  return Response.json(dto(row));
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }
  await loadOrInit();

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.openrouterApiKey !== undefined) {
    update.openrouterApiKey = parsed.data.openrouterApiKey;
  }
  if (parsed.data.taskModels !== undefined) {
    update.taskModels = parsed.data.taskModels;
  }

  const [row] = await db
    .update(settingsTable)
    .set(update)
    .where(eq(settingsTable.id, SINGLETON_ID))
    .returning();

  return Response.json(dto(row!));
}
