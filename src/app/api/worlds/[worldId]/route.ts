import { worldUpdateSchema } from "@/lib/validation";
import { jsonError } from "@/lib/server";
import { getWorldById, updateWorld, deleteWorld } from "@/lib/services/worlds";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ worldId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const world = await getWorldById(worldId);
  if (!world) return jsonError(404, "World not found");
  return Response.json(world);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = worldUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }
  const updated = await updateWorld(worldId, parsed.data);
  if (!updated) return jsonError(404, "World not found");
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const success = await deleteWorld(worldId);
  if (!success) return jsonError(404, "World not found");
  return new Response(null, { status: 204 });
}
