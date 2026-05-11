CREATE TABLE IF NOT EXISTS "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"story_id" uuid,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"prompt" text,
	"response" text,
	"cost_usd" numeric(10, 6),
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_calls_world_idx" ON "ai_calls" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_calls_story_idx" ON "ai_calls" USING btree ("story_id");