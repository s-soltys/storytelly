ALTER TABLE "stories" DROP CONSTRAINT "stories_length_seconds_check";--> statement-breakpoint
ALTER TABLE "story_songs" ADD COLUMN "length_seconds" integer;--> statement-breakpoint
ALTER TABLE "story_songs" ADD COLUMN "lyrics" text;--> statement-breakpoint
ALTER TABLE "story_songs" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" DROP COLUMN IF EXISTS "length_seconds";--> statement-breakpoint
ALTER TABLE "stories" DROP COLUMN IF EXISTS "lyrics";--> statement-breakpoint
ALTER TABLE "story_songs" DROP COLUMN IF EXISTS "selected";--> statement-breakpoint
ALTER TABLE "story_songs" ADD CONSTRAINT "story_songs_length_seconds_check" CHECK ("story_songs"."length_seconds" IS NULL OR ("story_songs"."length_seconds" % 15 = 0 AND "story_songs"."length_seconds" BETWEEN 30 AND 180));