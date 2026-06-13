import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { stories } from "@/db/schema";
import { getMessages } from "@/lib/services/messages";
import { jsonError } from "@/lib/server";

type Ctx = { params: Promise<{ worldId: string; storyId: string }> };

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: Ctx) {
  const { worldId, storyId } = await params;

  const [story] = await db
    .select()
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.worldId, worldId)));
  if (!story) return jsonError(404, "Story not found");

  const messages = await getMessages(storyId);

  return Response.json(messages, { status: 200 });
}
