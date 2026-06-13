"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Trash2, Wand2 } from "lucide-react";
import { api, type CharacterDto, type ImageDto, type LocationDto } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { ImageOwnerKind } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ImageUploader } from "@/components/ImageUploader";
import { FieldLine } from "@/components/world/FieldLine";
import { SaveHint } from "@/components/world/SaveHint";

type NamedEntity = CharacterDto | LocationDto;
type SaveState = "idle" | "saving" | "saved" | "error" | "invalid";

const quietField =
  "border-transparent bg-[var(--color-surface-2)]/35 shadow-none hover:bg-[var(--color-surface-2)]/55 focus:bg-[var(--color-surface)] focus:border-[var(--color-border)]";

export function InlineEntityRow({
  item,
  kindLabel,
  worldId,
  apiPath,
  queryKey,
  ownerKind,
  requireImage,
}: {
  item: NamedEntity;
  kindLabel: string;
  worldId: string;
  apiPath: "characters" | "locations";
  queryKey: "characters" | "locations";
  ownerKind: ImageOwnerKind;
  requireImage: boolean;
}) {
  const qc = useQueryClient();
  const qk = queryKey === "characters" ? queryKeys.world.characters(worldId) : queryKeys.world.locations(worldId);
  const [description, setDescription] = useState(item.description);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  function scheduleSave(nextDescription: string) {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);

    if (nextDescription === item.description) {
      setSaveState("idle");
      return;
    }

    if (!nextDescription.trim()) {
      setSaveState("invalid");
      return;
    }

    setSaveState("saving");
    saveTimer.current = window.setTimeout(async () => {
      try {
        const updated = await api.patch<NamedEntity>(
          `/api/worlds/${worldId}/${apiPath}/${item.id}`,
          { description: nextDescription },
        );
        qc.setQueryData(qk, (prev: NamedEntity[] | undefined) =>
          prev?.map((entry) =>
            entry.id === item.id
              ? { ...entry, ...updated, images: entry.images }
              : entry,
          ),
        );
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 650);
  }

  const del = useMutation({
    mutationFn: () => api.del<void>(`/api/worlds/${worldId}/${apiPath}/${item.id}`),
    onSuccess: () => {
      qc.setQueryData(qk, (prev: NamedEntity[] | undefined) =>
        prev?.filter((entry) => entry.id !== item.id),
      );
    },
  });

  const genImage = useMutation({
    mutationFn: () =>
      api.post<ImageDto>(`/api/worlds/${worldId}/generate-image`, {
        kind: ownerKind,
        id: item.id,
      }),
    onSuccess: (newImg) => {
      qc.setQueryData(qk, (prev: NamedEntity[] | undefined) =>
        prev?.map((entry) =>
          entry.id === item.id
            ? { ...entry, images: [...(entry.images ?? []), newImg] }
            : entry,
        ),
      );
    },
  });

  const imageWarning =
    requireImage && (!item.images || item.images.length === 0)
      ? `${kindLabel}s need at least one image.`
      : null;

  return (
    <article className="rounded-[var(--radius-control)] border border-[var(--color-border)]/80 bg-[var(--color-surface)]/75 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <FieldLine label="Name">
            <div className="flex min-h-8 min-w-0 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-surface-2)]/20 px-2">
              <h3 className="truncate font-mono text-xs uppercase tracking-widest">
                {item.name}
              </h3>
              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                <Lock className="h-3 w-3" /> locked
              </span>
            </div>
          </FieldLine>
          {imageWarning && (
            <p className="text-xs text-[var(--color-danger)] sm:pl-[5.25rem]">
              {imageWarning}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={genImage.isPending}
            className="h-8 w-8"
            onClick={() => genImage.mutate()}
            title="Generate image"
          >
            <Wand2 className={`h-4 w-4 ${genImage.isPending ? "animate-spin" : ""}`} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={del.isPending}
            className="h-8 w-8"
            onClick={() => {
              if (confirm(`Delete this ${kindLabel.toLowerCase()}?`)) del.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        <FieldLine label="Details">
          <Textarea
            aria-label={`${item.name} description`}
            rows={3}
            value={description}
            onChange={(e) => {
              const nextDescription = e.target.value;
              setDescription(nextDescription);
              scheduleSave(nextDescription);
            }}
            className={`${quietField} min-h-20 text-sm`}
          />
        </FieldLine>
        <SaveHint state={saveState} />
      </div>
      <div className="mt-3">
        <ImageUploader
          ownerKind={ownerKind}
          ownerId={item.id}
          images={item.images ?? []}
          compact
          onChange={(images) => {
            qc.setQueryData(qk, (prev: NamedEntity[] | undefined) =>
              prev?.map((entry) =>
                entry.id === item.id
                  ? { ...entry, images: images as ImageDto[] }
                  : entry,
              ),
            );
          }}
        />
      </div>
    </article>
  );
}
