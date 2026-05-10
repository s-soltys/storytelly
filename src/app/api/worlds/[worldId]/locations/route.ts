import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { locations, worlds } from "@/db/schema";
import { locationCreateSchema } from "@/lib/validation";
import { isUniqueViolation, jsonError, loadImages } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ worldId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const rows = await db
    .select()
    .from(locations)
    .where(eq(locations.worldId, worldId))
    .orderBy(asc(locations.name));
  const result = await Promise.all(
    rows.map(async (l) => ({ ...l, images: await loadImages("location", l.id) })),
  );
  return Response.json(result);
}

export async function POST(req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const [world] = await db.select().from(worlds).where(eq(worlds.id, worldId));
  if (!world) return jsonError(404, "World not found");

  const body = await req.json().catch(() => null);
  const parsed = locationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }
  try {
    const [created] = await db
      .insert(locations)
      .values({ ...parsed.data, worldId })
      .returning();
    return Response.json(created, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return jsonError(409, "A location with that name already exists in this world");
    }
    throw err;
  }
}
