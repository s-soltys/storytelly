"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CharacterDto, type LocationDto, type StoryDto, type WorldDto } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { InlineWorldEditor } from "@/components/world/InlineWorldEditor";
import { InlineEntityList } from "@/components/world/InlineEntityList";
import { Section } from "@/components/world/Section";
import { ArrowLeft } from "lucide-react";

export default function WorldPage() {
  const { worldId } = useParams<{ worldId: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const world = useQuery({
    queryKey: queryKeys.world.detail(worldId),
    queryFn: () => api.get<WorldDto>(`/api/worlds/${worldId}`),
  });

  const chars = useQuery({
    queryKey: queryKeys.world.characters(worldId),
    queryFn: () =>
      api.get<CharacterDto[]>(`/api/worlds/${worldId}/characters`),
  });
  const locs = useQuery({
    queryKey: queryKeys.world.locations(worldId),
    queryFn: () => api.get<LocationDto[]>(`/api/worlds/${worldId}/locations`),
  });
  const stories = useQuery({
    queryKey: queryKeys.world.stories(worldId),
    queryFn: () => api.get<StoryDto[]>(`/api/worlds/${worldId}/stories`),
  });

  const del = useMutation({
    mutationFn: () => api.del<void>(`/api/worlds/${worldId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.worlds.all() });
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
