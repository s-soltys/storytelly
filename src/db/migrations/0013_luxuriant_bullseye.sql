CREATE TABLE IF NOT EXISTS "story_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text,
	"tool_calls" jsonb,
	"tool_call_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_messages" ADD CONSTRAINT "story_messages_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_messages_story_idx" ON "story_messages" USING btree ("story_id","created_at");