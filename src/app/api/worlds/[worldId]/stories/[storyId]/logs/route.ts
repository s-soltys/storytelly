import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiCalls } from "@/db/schema";
import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ worldId: string; storyId: string }> },
) {
  const { storyId } = await params;
  
  try {
    const rows = await db
      .select()
      .from(aiCalls)
      .where(eq(aiCalls.storyId, storyId))
      .orderBy(desc(aiCalls.createdAt));
      
    return Response.json(rows);
  } catch (err: any) {
    return jsonError(500, err.message);
  }
}
