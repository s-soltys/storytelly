import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { worlds } from "@/db/schema";
import { worldUpdateSchema } from "@/lib/validation";
import { jsonError, loadImages } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ worldId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const [world] = await db.select().from(worlds).where(eq(worlds.id, worldId));
  if (!world) return jsonError(404, "World not found");
  const moodImages = await loadImages("world_mood", world.id);
  return Response.json({ ...world, moodImages });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = worldUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }
  const [updated] = await db
    .update(worlds)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(worlds.id, worldId))
    .returning();
  if (!updated) return jsonError(404, "World not found");
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const deleted = await db
    .delete(worlds)
    .where(eq(worlds.id, worldId))
    .returning({ id: worlds.id });
  if (deleted.length === 0) return jsonError(404, "World not found");
  return new Response(null, { status: 204 });
}
