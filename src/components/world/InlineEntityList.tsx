"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { type CharacterDto, type LocationDto } from "@/lib/api";
import type { ImageOwnerKind } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { InlineEntityCreate } from "@/components/world/InlineEntityCreate";
import { InlineEntityRow } from "@/components/world/InlineEntityRow";

type NamedEntity = CharacterDto | LocationDto;

export function InlineEntityList({
  title,
  kindLabel,
  worldId,
  apiPath,
  queryKey,
  ownerKind,
  requireImage = false,
  loading,
  items,
  empty,
}: {
  title: string;
  kindLabel: string;
  worldId: string;
  apiPath: "characters" | "locations";
  queryKey: "characters" | "locations";
  ownerKind: ImageOwnerKind;
  requireImage?: boolean;
  loading: boolean;
  items?: NamedEntity[];
  empty: string;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] pb-1.5">
        <h2 className="font-mono text-xs uppercase tracking-widest">
          {title}
          {typeof items?.length === "number" && (
            <span className="ml-2 text-[var(--color-muted)]">{items.length}</span>
          )}
        </h2>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-4 w-4" /> {kindLabel}
        </Button>
      </header>
      <div className="flex flex-col gap-2.5">
        {adding && (
          <InlineEntityCreate
            kindLabel={kindLabel}
            worldId={worldId}
            apiPath={apiPath}
            queryKey={queryKey}
            onDone={() => setAdding(false)}
          />
        )}
        {loading ? (
          <p className="text-sm text-[var(--color-muted)]">Loading…</p>
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">{empty}</p>
        ) : (
          items.map((item) => (
            <InlineEntityRow
              key={item.id}
              item={item}
              kindLabel={kindLabel}
              worldId={worldId}
              apiPath={apiPath}
              queryKey={queryKey}
              ownerKind={ownerKind}
              requireImage={requireImage}
            />
          ))
        )}
      </div>
    </section>
  );
}
