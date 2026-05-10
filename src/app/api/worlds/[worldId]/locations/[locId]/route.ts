import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { locations } from "@/db/schema";
import { locationUpdateSchema } from "@/lib/validation";
import { jsonError, loadImages } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ worldId: string; locId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId, locId } = await params;
  const [row] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, locId), eq(locations.worldId, worldId)));
  if (!row) return jsonError(404, "Location not found");
  return Response.json({ ...row, images: await loadImages("location", row.id) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { worldId, locId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = locationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }
  const [updated] = await db
    .update(locations)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(locations.id, locId), eq(locations.worldId, worldId)))
    .returning();
  if (!updated) return jsonError(404, "Location not found");
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { worldId, locId } = await params;
  const deleted = await db
    .delete(locations)
    .where(and(eq(locations.id, locId), eq(locations.worldId, worldId)))
    .returning({ id: locations.id });
  if (deleted.length === 0) return jsonError(404, "Location not found");
  return new Response(null, { status: 204 });
}
