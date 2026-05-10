import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function DELETE() {
  return jsonError(410, "Song scripts have been replaced by story lyrics.");
}
