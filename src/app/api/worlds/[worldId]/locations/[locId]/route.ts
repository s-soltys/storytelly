import { locationUpdateSchema } from "@/lib/validation";
import { jsonError } from "@/lib/server";
import { getLocationById, updateLocation, deleteLocation } from "@/lib/services/locations";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ worldId: string; locId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId, locId } = await params;
  const row = await getLocationById(worldId, locId);
  if (!row) return jsonError(404, "Location not found");
  return Response.json(row);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { worldId, locId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = locationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }
  const updated = await updateLocation(worldId, locId, parsed.data);
  if (!updated) return jsonError(404, "Location not found");
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { worldId, locId } = await params;
  const deleted = await deleteLocation(worldId, locId);
  if (!deleted) return jsonError(404, "Location not found");
  return new Response(null, { status: 204 });
}
