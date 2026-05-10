"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type CharacterDto,
  type LocationDto,
  type StoryDto,
  type WorldDto,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUploader } from "@/components/ImageUploader";
import { ArrowLeft, ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";

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
    <div className="space-y-8">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft className="h-4 w-4" /> Worlds
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-mono text-3xl uppercase tracking-widest">
              {w.name}
            </h1>
            <p className="text-sm text-[var(--color-muted)] mt-1">
              {w.artStyle}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href={`/worlds/${worldId}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm("Delete this world and everything in it?")) del.mutate();
              }}
              disabled={del.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="mt-4 text-sm whitespace-pre-wrap">{w.description}</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            <ImageIcon className="inline h-4 w-4 mr-2" /> Mood images
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ImageUploader
            ownerKind="world_mood"
            ownerId={w.id}
            initial={w.moodImages ?? []}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Section
          title="Characters"
          count={chars.data?.length}
          loading={chars.isLoading}
          empty="No characters yet."
          newHref={`/worlds/${worldId}/characters/new`}
          newLabel="Character"
          items={chars.data?.map((c) => ({
            id: c.id,
            href: `/worlds/${worldId}/characters/${c.id}`,
            title: c.name,
            description: c.description,
            images: c.images,
            warning:
              !c.images || c.images.length === 0
                ? "Needs at least 1 image"
                : undefined,
          }))}
        />
        <Section
          title="Locations"
          count={locs.data?.length}
          loading={locs.isLoading}
          empty="No locations yet."
          newHref={`/worlds/${worldId}/locations/new`}
          newLabel="Location"
          items={locs.data?.map((l) => ({
            id: l.id,
            href: `/worlds/${worldId}/locations/${l.id}`,
            title: l.name,
            description: l.description,
            images: l.images,
          }))}
        />
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
            title: `${s.lengthSeconds}s story`,
            description: s.description,
            images: s.moodImages,
          }))}
        />
      </div>
    </div>
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
    <section className="flex flex-col gap-3 min-w-0">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
        <h2 className="font-mono text-sm uppercase tracking-widest">
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
      <div className="flex flex-col gap-3">
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
          <div className="w-20 shrink-0 aspect-square bg-[var(--color-surface-2)] overflow-hidden flex items-center justify-center">
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
          <div className="flex-1 min-w-0 p-3">
            <p className="font-mono text-xs uppercase tracking-wider truncate group-hover:text-[var(--color-accent)] transition-colors">
              {item.title}
            </p>
            {item.warning && (
              <p className="text-[10px] text-[var(--color-danger)] mt-0.5">
                {item.warning}
              </p>
            )}
            <p className="text-xs text-[var(--color-fg)]/70 mt-1 line-clamp-2">
              {item.description}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
