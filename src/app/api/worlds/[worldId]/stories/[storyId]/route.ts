import { storyUpdateSchema } from "@/lib/validation";
import { jsonError } from "@/lib/server";
import { getStoryById, updateStory, deleteStory } from "@/lib/services/stories";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ worldId: string; storyId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const story = await getStoryById(worldId, storyId);
  if (!story) return jsonError(404, "Story not found");
  return Response.json(story);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = storyUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const success = await updateStory(worldId, storyId, parsed.data);
  if (!success) return jsonError(404, "Story not found");

  const story = await getStoryById(worldId, storyId);
  if (!story) return jsonError(404, "Story not found");
  return Response.json(story);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;
  const success = await deleteStory(worldId, storyId);
  if (!success) return jsonError(404, "Story not found");
  return new Response(null, { status: 204 });
}
