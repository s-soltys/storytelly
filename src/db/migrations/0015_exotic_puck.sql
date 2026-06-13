CREATE INDEX "stories_world_idx" ON "stories" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "worlds_created_idx" ON "worlds" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stories" ADD CONSTRAINT "stories_selected_song_fk" FOREIGN KEY ("selected_song_id") REFERENCES "story_songs"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;