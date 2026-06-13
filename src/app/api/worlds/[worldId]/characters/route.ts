import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { worlds } from "@/db/schema";
import { getCharacters, createCharacter } from "@/lib/services/characters";
import { characterCreateSchema } from "@/lib/validation";
import { isUniqueViolation, jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ worldId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const result = await getCharacters(worldId);
  return Response.json(result);
}

export async function POST(req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const [world] = await db.select().from(worlds).where(eq(worlds.id, worldId));
  if (!world) return jsonError(404, "World not found");

  const body = await req.json().catch(() => null);
  const parsed = characterCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }
  try {
    const created = await createCharacter(worldId, parsed.data);
    return Response.json(created, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return jsonError(409, "A character with that name already exists in this world");
    }
    throw err;
  }
}

