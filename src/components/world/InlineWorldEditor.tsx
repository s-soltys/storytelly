"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Trash2 } from "lucide-react";
import { api, type WorldDto } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { ImageUploader } from "@/components/ImageUploader";
import { FieldLine } from "@/components/world/FieldLine";
import { SaveHint } from "@/components/world/SaveHint";

type SaveState = "idle" | "saving" | "saved" | "error" | "invalid";

const quietField =
  "border-transparent bg-[var(--color-surface-2)]/35 shadow-none hover:bg-[var(--color-surface-2)]/55 focus:bg-[var(--color-surface)] focus:border-[var(--color-border)]";

export function InlineWorldEditor({
  world,
  worldId,
  deleting,
  onDelete,
}: {
  world: WorldDto;
  worldId: string;
  deleting: boolean;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(world.name);
  const [artStyle, setArtStyle] = useState(world.artStyle);
  const [description, setDescription] = useState(world.description);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  function scheduleSave(next: {
    name: string;
    artStyle: string;
    description: string;
  }) {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);

    const changed =
      next.name !== world.name ||
      next.artStyle !== world.artStyle ||
      next.description !== world.description;

    if (!changed) {
      setSaveState("idle");
      return;
    }

    if (!next.name.trim() || !next.artStyle.trim() || !next.description.trim()) {
      setSaveState("invalid");
      return;
    }

    setSaveState("saving");
    saveTimer.current = window.setTimeout(async () => {
      try {
        const updated = await api.patch<WorldDto>(`/api/worlds/${worldId}`, {
          name: next.name,
          artStyle: next.artStyle,
          description: next.description,
        });
        qc.setQueryData(queryKeys.world.detail(worldId), {
          ...world,
          ...updated,
          moodImages: world.moodImages,
        });
        qc.invalidateQueries({ queryKey: queryKeys.worlds.all() });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 650);
  }

  return (
    <div className="mt-2 space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <FieldLine label="Name">
          <Input
            aria-label="World name"
            value={name}
            onChange={(e) => {
              const nextName = e.target.value;
              setName(nextName);
              scheduleSave({ name: nextName, artStyle, description });
            }}
            className={`${quietField} h-9 px-2 font-mono text-2xl uppercase tracking-widest`}
          />
        </FieldLine>
        <Button
          variant="danger"
          size="icon"
          onClick={onDelete}
          disabled={deleting}
          className="h-9 w-9 self-end"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-2.5">
          <FieldLine label="Style">
            <Textarea
              aria-label="Art style"
              value={artStyle}
              onChange={(e) => {
                const nextArtStyle = e.target.value;
                setArtStyle(nextArtStyle);
                scheduleSave({ name, artStyle: nextArtStyle, description });
              }}
              rows={2}
              className={`${quietField} min-h-16 resize-none text-sm text-[var(--color-muted)]`}
            />
          </FieldLine>
          <FieldLine label="World">
            <Textarea
              aria-label="World-building description"
              value={description}
              onChange={(e) => {
                const nextDescription = e.target.value;
                setDescription(nextDescription);
                scheduleSave({ name, artStyle, description: nextDescription });
              }}
              rows={4}
              className={`${quietField} min-h-28 text-sm`}
            />
          </FieldLine>
          <SaveHint state={saveState} />
        </div>

        <aside className="rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/55 p-3">
          <div className="mb-2 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-[var(--color-muted)]" />
            <h2 className="font-mono text-xs uppercase tracking-widest">
              Mood images
            </h2>
          </div>
          <ImageUploader
            ownerKind="world_mood"
            ownerId={world.id}
            images={world.moodImages ?? []}
            compact
          />
        </aside>
      </div>
    </div>
  );
}
