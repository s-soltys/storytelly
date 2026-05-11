CREATE TABLE IF NOT EXISTS "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"s3_key" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer,
	"duration_seconds" integer,
	"owner_kind" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "videos_owner_idx" ON "videos" USING btree ("owner_kind","owner_id");