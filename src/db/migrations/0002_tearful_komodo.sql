ALTER TABLE "stories" ADD COLUMN "name" text DEFAULT 'Untitled story' NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "lyrics" text DEFAULT '' NOT NULL;