"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
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
import { cn } from "@/lib/utils";

type Tab = "characters" | "locations" | "stories";

export default function WorldPage() {
  const { worldId } = useParams<{ worldId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("characters");

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

      <div>
        <div className="flex items-center justify-between border-b border-[var(--color-border)]">
          <div className="flex">
            <TabBtn active={tab === "characters"} onClick={() => setTab("characters")}>
              Characters {chars.data ? `(${chars.data.length})` : ""}
            </TabBtn>
            <TabBtn active={tab === "locations"} onClick={() => setTab("locations")}>
              Locations {locs.data ? `(${locs.data.length})` : ""}
            </TabBtn>
            <TabBtn active={tab === "stories"} onClick={() => setTab("stories")}>
              Stories {stories.data ? `(${stories.data.length})` : ""}
            </TabBtn>
          </div>
          {tab === "characters" && (
            <Button asChild size="sm">
              <Link href={`/worlds/${worldId}/characters/new`}>
                <Plus className="h-4 w-4" /> Character
              </Link>
            </Button>
          )}
          {tab === "locations" && (
            <Button asChild size="sm">
              <Link href={`/worlds/${worldId}/locations/new`}>
                <Plus className="h-4 w-4" /> Location
              </Link>
            </Button>
          )}
          {tab === "stories" && (
            <Button asChild size="sm">
              <Link href={`/worlds/${worldId}/stories/new`}>
                <Plus className="h-4 w-4" /> Story
              </Link>
            </Button>
          )}
        </div>

        <div className="pt-6">
          {tab === "characters" && (
            <EntityGrid
              loading={chars.isLoading}
              empty="No characters yet."
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
          )}
          {tab === "locations" && (
            <EntityGrid
              loading={locs.isLoading}
              empty="No locations yet."
              items={locs.data?.map((l) => ({
                id: l.id,
                href: `/worlds/${worldId}/locations/${l.id}`,
                title: l.name,
                description: l.description,
                images: l.images,
              }))}
            />
          )}
          {tab === "stories" && (
            <EntityGrid
              loading={stories.isLoading}
              empty="No stories yet."
              items={stories.data?.map((s) => ({
                id: s.id,
                href: `/worlds/${worldId}/stories/${s.id}`,
                title: `${s.lengthSeconds}s story`,
                description: s.description,
                images: s.moodImages,
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 text-sm font-mono uppercase tracking-wider border-b-2 -mb-px transition cursor-pointer",
        active
          ? "border-[var(--color-accent)] text-[var(--color-accent)]"
          : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-fg)]",
      )}
    >
      {children}
    </button>
  );
}

type EntityItem = {
  id: string;
  href: string;
  title: string;
  description: string;
  images?: { id: string; url: string }[];
  warning?: string;
};

function EntityGrid({
  loading,
  empty,
  items,
}: {
  loading: boolean;
  empty: string;
  items?: EntityItem[];
}) {
  if (loading) return <p className="text-[var(--color-muted)]">Loading…</p>;
  if (!items || items.length === 0)
    return <p className="text-[var(--color-muted)] text-sm">{empty}</p>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => (
        <Link key={item.id} href={item.href} className="group">
          <Card className="h-full overflow-hidden transition group-hover:border-[var(--color-accent)]">
            {item.images && item.images[0] ? (
              <div className="aspect-video w-full overflow-hidden bg-[var(--color-surface-2)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.images[0].url}
                  alt=""
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              </div>
            ) : (
              <div className="aspect-video w-full bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted)]">
                <ImageIcon className="h-8 w-8" />
              </div>
            )}
            <CardHeader>
              <CardTitle className="text-base group-hover:text-[var(--color-accent)] transition-colors">
                {item.title}
              </CardTitle>
              {item.warning && (
                <p className="text-xs text-[var(--color-danger)]">
                  {item.warning}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--color-fg)]/80 line-clamp-3">
                {item.description}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
