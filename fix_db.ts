import { config } from "dotenv";
config();
import { db } from "./src/db/client";
import { settings } from "./src/db/schema";
import { sql } from "drizzle-orm";

async function run() {
  await db.update(settings).set({
    taskModels: sql`task_models - 'analyze_song' - 'transcription'`
  });
  console.log("DB fixed");
  process.exit(0);
}
run();
