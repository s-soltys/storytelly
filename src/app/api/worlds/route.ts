import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { worlds } from "@/db/schema";
import { worldCreateSchema } from "@/lib/validation";
import { jsonError, loadImages } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(worlds).orderBy(desc(worlds.createdAt));
  const result = await Promise.all(
    rows.map(async (w) => ({
      ...w,
      moodImages: await loadImages("world_mood", w.id),
    })),
  );
  return Response.json(result);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = worldCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }
  const [created] = await db.insert(worlds).values(parsed.data).returning();
  return Response.json(created, { status: 201 });
}
