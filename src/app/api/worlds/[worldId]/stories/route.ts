import { storyCreateSchema } from "@/lib/validation";
import { jsonError } from "@/lib/server";
import { getStoriesByWorldId, createStory } from "@/lib/services/stories";
import { getWorldById } from "@/lib/services/worlds";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ worldId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const result = await getStoriesByWorldId(worldId);
  return Response.json(result);
}

export async function POST(req: Request, { params }: Ctx) {
  const { worldId } = await params;
  const world = await getWorldById(worldId);
  if (!world) return jsonError(404, "World not found");

  const body = await req.json().catch(() => null);
  const parsed = storyCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  try {
    const created = await createStory(worldId, parsed.data);
    return Response.json(created, { status: 201 });
  } catch (err) {
    return jsonError(400, (err as Error).message);
  }
}
