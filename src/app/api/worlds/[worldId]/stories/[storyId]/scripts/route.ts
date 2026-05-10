import { jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return jsonError(410, "Song scripts have been replaced by story lyrics.");
}

export async function POST() {
  return jsonError(410, "Song scripts have been replaced by story lyrics.");
}
