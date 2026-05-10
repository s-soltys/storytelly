import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

declare global {
  // eslint-disable-next-line no-var
  var __pg: ReturnType<typeof postgres> | undefined;
}

const client = global.__pg ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") global.__pg = client;

export const db = drizzle(client, { schema });
export { schema };
