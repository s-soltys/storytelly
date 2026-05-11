DO $$ BEGIN
 ALTER TABLE "videos" ADD CONSTRAINT "videos_owner_id_song_clips_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."song_clips"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
