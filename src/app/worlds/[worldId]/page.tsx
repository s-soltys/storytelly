"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type CharacterDto,
  type ImageDto,
  type LocationDto,
  type StoryDto,
  type WorldDto,
} from "@/lib/api";
import type { ImageOwnerKind } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/ImageUploader";
import { ArrowLeft, ImageIcon, Lock, Plus, Trash2, Wand2, X } from "lucide-react";

type SaveState = "idle" | "saving" | "saved" | "error" | "invalid";
type NamedEntity = CharacterDto | LocationDto;

const quietField =
  "border-transparent bg-[var(--color-surface-2)]/35 shadow-none hover:bg-[var(--color-surface-2)]/55 focus:bg-[var(--color-surface)] focus:border-[var(--color-border)]";

function FieldLine({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:items-start">
      <Label className="pt-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
        {label}
      </Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function WorldPage() {
  const { worldId } = useParams<{ worldId: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const world = useQuery({
    queryKey: ["world", worldId],
    queryFn: () => api.get<WorldDto>(`/api/worlds/${worldId}`),
  });

  const chars = useQuery({
    queryKey: ["characters", worldId],
    queryFn: () =>
      api.get<CharacterDto[]>(`/api/worlds/${worldId}/characters`),
  });
  const locs = useQuery({
    queryKey: ["locations", worldId],
    queryFn: () => api.get<LocationDto[]>(`/api/worlds/${worldId}/locations`),
  });
  const stories = useQuery({
    queryKey: ["stories", worldId],
    queryFn: () => api.get<StoryDto[]>(`/api/worlds/${worldId}/stories`),
  });

  const del = useMutation({
    mutationFn: () => api.del<void>(`/api/worlds/${worldId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worlds"] });
      router.push("/");
    },
  });

  if (world.isLoading) return <p className="text-[var(--color-muted)]">Loading…</p>;
  if (world.error)
    return (
      <p className="text-[var(--color-danger)]">
        {(world.error as Error).message}
      </p>
    );
  if (!world.data) return null;

  const w = world.data;

  return (
    <div className="space-y-5">
      <section>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft className="h-4 w-4" /> Worlds
        </Link>
        <InlineWorldEditor
          key={w.id}
          world={w}
          worldId={worldId}
          deleting={del.isPending}
          onDelete={() => {
            if (confirm("Delete this world and everything in it?")) del.mutate();
          }}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InlineEntityList
          title="Characters"
          kindLabel="Character"
          worldId={worldId}
          apiPath="characters"
          queryKey="characters"
          ownerKind="character"
          requireImage
          loading={chars.isLoading}
          items={chars.data}
          empty="No characters yet."
        />
        <InlineEntityList
          title="Locations"
          kindLabel="Location"
          worldId={worldId}
          apiPath="locations"
          queryKey="locations"
          ownerKind="location"
          loading={locs.isLoading}
          items={locs.data}
          empty="No locations yet."
        />
      </div>

      <div>
        <Section
          title="Stories"
          count={stories.data?.length}
          loading={stories.isLoading}
          empty="No stories yet."
          newHref={`/worlds/${worldId}/stories/new`}
          newLabel="Story"
          items={stories.data?.map((s) => ({
            id: s.id,
            href: `/worlds/${worldId}/stories/${s.id}`,
            title: s.name,
            description: s.description,
            images: s.moodImages,
          }))}
        />
      </div>
    </div>
  );
}

function InlineWorldEditor({
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
        qc.setQueryData(["world", worldId], {
          ...world,
          ...updated,
          moodImages: world.moodImages,
        });
        qc.invalidateQueries({ queryKey: ["worlds"] });
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
            initial={world.moodImages ?? []}
            compact
          />
        </aside>
      </div>
    </div>
  );
}

function InlineEntityList({
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

function InlineEntityCreate({
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
      qc.setQueryData([queryKey, worldId], (prev: NamedEntity[] | undefined) =>
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

function InlineEntityRow({
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
        qc.setQueryData([queryKey, worldId], (prev: NamedEntity[] | undefined) =>
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
      qc.setQueryData([queryKey, worldId], (prev: NamedEntity[] | undefined) =>
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
      qc.setQueryData([queryKey, worldId], (prev: NamedEntity[] | undefined) =>
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
          initial={item.images ?? []}
          compact
          onChange={(images) => {
            qc.setQueryData([queryKey, worldId], (prev: NamedEntity[] | undefined) =>
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

function SaveHint({ state }: { state: SaveState }) {
  if (state === "idle") return null;

  const text = {
    saving: "Saving…",
    saved: "Saved.",
    error: "Could not save. Keep editing or try again.",
    invalid: "Required fields cannot be empty.",
  }[state];

  return (
    <p
      className={
        state === "error" || state === "invalid"
          ? "text-xs text-[var(--color-danger)]"
          : "text-xs text-[var(--color-muted)]"
      }
    >
      {text}
    </p>
  );
}

type SectionItem = {
  id: string;
  href: string;
  title: string;
  description: string;
  images?: { id: string; url: string }[];
  warning?: string;
};

function Section({
  title,
  count,
  loading,
  empty,
  newHref,
  newLabel,
  items,
}: {
  title: string;
  count?: number;
  loading: boolean;
  empty: string;
  newHref: string;
  newLabel: string;
  items?: SectionItem[];
}) {
  return (
    <section className="flex flex-col gap-2.5 min-w-0">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] pb-1.5">
        <h2 className="font-mono text-xs uppercase tracking-widest">
          {title}
          {typeof count === "number" && (
            <span className="ml-2 text-[var(--color-muted)]">{count}</span>
          )}
        </h2>
        <Button asChild size="sm" variant="secondary">
          <Link href={newHref}>
            <Plus className="h-4 w-4" /> {newLabel}
          </Link>
        </Button>
      </header>
      <div className="flex flex-col gap-2.5">
        {loading ? (
          <p className="text-[var(--color-muted)] text-sm">Loading…</p>
        ) : !items || items.length === 0 ? (
          <p className="text-[var(--color-muted)] text-sm">{empty}</p>
        ) : (
          items.map((item) => <SectionCard key={item.id} item={item} />)
        )}
      </div>
    </section>
  );
}

function SectionCard({ item }: { item: SectionItem }) {
  return (
    <Link href={item.href} className="group block">
      <Card className="overflow-hidden transition group-hover:border-[var(--color-accent)] py-0">
        <div className="flex">
          <div className="w-16 shrink-0 aspect-square bg-[var(--color-surface-2)] overflow-hidden flex items-center justify-center">
            {item.images && item.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.images[0].url}
                alt=""
                className="h-full w-full object-cover transition group-hover:scale-105"
              />
            ) : (
              <ImageIcon className="h-5 w-5 text-[var(--color-muted)]" />
            )}
          </div>
          <div className="flex-1 min-w-0 p-2.5">
            <p className="font-mono text-xs uppercase tracking-wider truncate group-hover:text-[var(--color-accent)] transition-colors">
              {item.title}
            </p>
            {item.warning && (
              <p className="text-[10px] text-[var(--color-danger)] mt-0.5">
                {item.warning}
              </p>
            )}
            <p className="text-xs text-[var(--color-fg)]/70 mt-0.5 line-clamp-2">
              {item.description}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
