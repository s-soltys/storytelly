import { worldCreateSchema } from "@/lib/validation";
import { jsonError } from "@/lib/server";
import { getWorlds, createWorld } from "@/lib/services/worlds";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getWorlds();
  return Response.json(result);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = worldCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }
  const created = await createWorld(parsed.data);
  return Response.json(created, { status: 201 });
}
