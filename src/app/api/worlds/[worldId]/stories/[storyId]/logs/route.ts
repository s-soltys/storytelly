import { jsonError } from "@/lib/server";
import { getAiCalls } from "@/lib/services/aiLogs";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ worldId: string; storyId: string }> },
) {
  const { storyId } = await params;
  
  try {
    const rows = await getAiCalls(storyId);
    return Response.json(rows);
  } catch (err: any) {
    return jsonError(500, err.message);
  }
}
