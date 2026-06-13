"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api, type CharacterDto, type LocationDto } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { FieldLine } from "@/components/world/FieldLine";

type NamedEntity = CharacterDto | LocationDto;

const quietField =
  "border-transparent bg-[var(--color-surface-2)]/35 shadow-none hover:bg-[var(--color-surface-2)]/55 focus:bg-[var(--color-surface)] focus:border-[var(--color-border)]";

export function InlineEntityCreate({
  kindLabel,
  worldId,
  apiPath,
  queryKey,
  onDone,
}: {
  kindLabel: string;
  worldId: string;
  apiPath: "characters" | "locations";
  queryKey: "characters" | "locations";
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api.post<NamedEntity>(`/api/worlds/${worldId}/${apiPath}`, {
        name,
        description,
      }),
    onSuccess: (created) => {
      const qk = queryKey === "characters" ? queryKeys.world.characters(worldId) : queryKeys.world.locations(worldId);
      qc.setQueryData(qk, (prev: NamedEntity[] | undefined) =>
        [...(prev ?? []), { ...created, images: [] }].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setName("");
      setDescription("");
      onDone();
    },
    onError: (e) => setError((e as Error).message),
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !description.trim()) {
      setError("Name and description are required.");
      return;
    }
    create.mutate();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2.5 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest">
            New {kindLabel.toLowerCase()}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
            Name locks after creation.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDone}
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <FieldLine label="Name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${quietField} h-9`}
        />
      </FieldLine>
      <FieldLine label="Details">
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${quietField} min-h-20 text-sm`}
        />
      </FieldLine>
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="submit" size="sm" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create"}
        </Button>
      </div>
    </form>
  );
}
