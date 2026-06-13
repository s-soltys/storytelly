import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settings, type Settings } from "@/db/schema";

export async function getSettings(): Promise<Settings | null> {
  const [row] = await db.select().from(settings).limit(1);
  return row ?? null;
}

export async function updateSettings(data: Partial<Pick<Settings, "openrouterApiKey" | "taskModels">>) {
  const existing = await getSettings();
  if (existing) {
    const [row] = await db
      .update(settings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(settings.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(settings)
    .values({ id: 1, ...data })
    .returning();
  return row;
}
