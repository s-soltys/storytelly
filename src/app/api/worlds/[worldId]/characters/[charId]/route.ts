import { characterUpdateSchema } from "@/lib/validation";
import { jsonError } from "@/lib/server";
import { getCharacterById, updateCharacter, deleteCharacter } from "@/lib/services/characters";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ worldId: string; charId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId, charId } = await params;
  const row = await getCharacterById(worldId, charId);
  if (!row) return jsonError(404, "Character not found");
  return Response.json(row);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { worldId, charId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = characterUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }
  const updated = await updateCharacter(worldId, charId, parsed.data);
  if (!updated) return jsonError(404, "Character not found");
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { worldId, charId } = await params;
  const deleted = await deleteCharacter(worldId, charId);
  if (!deleted) return jsonError(404, "Character not found");
  return new Response(null, { status: 204 });
}
