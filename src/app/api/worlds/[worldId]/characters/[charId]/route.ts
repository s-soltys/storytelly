import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { characters } from "@/db/schema";
import { characterUpdateSchema } from "@/lib/validation";
import { jsonError, loadImages } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ worldId: string; charId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId, charId } = await params;
  const [row] = await db
    .select()
    .from(characters)
    .where(and(eq(characters.id, charId), eq(characters.worldId, worldId)));
  if (!row) return jsonError(404, "Character not found");
  return Response.json({ ...row, images: await loadImages("character", row.id) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { worldId, charId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = characterUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }
  const [updated] = await db
    .update(characters)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(characters.id, charId), eq(characters.worldId, worldId)))
    .returning();
  if (!updated) return jsonError(404, "Character not found");
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { worldId, charId } = await params;
  const deleted = await db
    .delete(characters)
    .where(and(eq(characters.id, charId), eq(characters.worldId, worldId)))
    .returning({ id: characters.id });
  if (deleted.length === 0) return jsonError(404, "Character not found");
  return new Response(null, { status: 204 });
}
