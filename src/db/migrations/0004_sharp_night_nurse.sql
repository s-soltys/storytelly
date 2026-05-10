CREATE TABLE IF NOT EXISTS "story_songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"s3_key" text NOT NULL,
	"mime_type" text DEFAULT 'audio/mpeg' NOT NULL,
	"size_bytes" integer,
	"model" text,
	"prompt" text,
	"transcript" text,
	"cost_usd" numeric(10, 6),
	"selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_songs" ADD CONSTRAINT "story_songs_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_songs_story_idx" ON "story_songs" USING btree ("story_id","created_at" DESC NULLS LAST);