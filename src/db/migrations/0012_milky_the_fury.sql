CREATE TABLE IF NOT EXISTS "story_lyrics_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"lyrics" text NOT NULL,
	"prompt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "length_seconds" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "lyrics" text DEFAULT '' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_lyrics_versions" ADD CONSTRAINT "story_lyrics_versions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_lyrics_versions_story_idx" ON "story_lyrics_versions" USING btree ("story_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_length_seconds_check" CHECK ("stories"."length_seconds" % 15 = 0 AND "stories"."length_seconds" BETWEEN 30 AND 180);