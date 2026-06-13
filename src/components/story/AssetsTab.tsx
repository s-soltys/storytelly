import Link from "next/link";
import { ImageIcon, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageUploader } from "@/components/ImageUploader";

interface AssetsTabProps {
  worldId: string;
  storyId: string;
  moodImages: { id: string; url: string; position: number }[];
}

export function AssetsTab({ worldId, storyId, moodImages }: AssetsTabProps) {
  return (
    <>
      {/* Mood Images */}
      <section className="rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/55 p-3">
        <div className="mb-2 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-[var(--color-muted)]" />
          <h2 className="font-mono text-xs uppercase tracking-widest">Mood images</h2>
        </div>
        <ImageUploader ownerKind="story_mood" ownerId={storyId} images={moodImages} compact />
      </section>

      {/* AI Logs link */}
      <section className="rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/55 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[var(--color-muted)]" />
          <h2 className="font-mono text-xs uppercase tracking-widest">System</h2>
        </div>
        <Link href={`/worlds/${worldId}/stories/${storyId}/logs`}>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 h-9 text-xs font-mono uppercase tracking-wider"
            size="sm"
          >
            <Terminal className="h-3.5 w-3.5" /> View AI Logs
          </Button>
        </Link>
      </section>
    </>
  );
}
