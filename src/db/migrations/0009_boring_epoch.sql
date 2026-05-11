CREATE TABLE IF NOT EXISTS "song_clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"section_index" integer NOT NULL,
	"description" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "song_clips" ADD CONSTRAINT "song_clips_song_id_story_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."story_songs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "song_clips_song_idx" ON "song_clips" USING btree ("song_id","section_index","position");