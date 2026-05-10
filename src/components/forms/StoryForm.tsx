"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  STORY_LENGTHS,
  storyCreateSchema,
  type StoryCreate,
} from "@/lib/validation";
import {
  api,
  type CharacterDto,
  type LocationDto,
  type StoryDto,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUploader } from "@/components/ImageUploader";
import { SongScriptsPanel } from "@/components/SongScriptsPanel";
import { ArrowLeft, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode =
  | { kind: "create"; worldId: string }
  | { kind: "edit"; worldId: string; storyId: string };

export function StoryForm(props: Mode) {
  const router = useRouter();
  const qc = useQueryClient();
  const { worldId } = props;

  const chars = useQuery({
    queryKey: ["characters", worldId],
    queryFn: () =>
      api.get<CharacterDto[]>(`/api/worlds/${worldId}/characters`),
  });
  const locs = useQuery({
    queryKey: ["locations", worldId],
    queryFn: () => api.get<LocationDto[]>(`/api/worlds/${worldId}/locations`),
  });

  const existing = useQuery({
    queryKey: ["story", props.kind === "edit" ? props.storyId : null],
    enabled: props.kind === "edit",
    queryFn: () =>
      api.get<StoryDto>(
        `/api/worlds/${worldId}/stories/${
          props.kind === "edit" ? props.storyId : ""
        }`,
      ),
  });

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<StoryCreate>({
    resolver: zodResolver(storyCreateSchema),
    defaultValues: {
      description: "",
      lengthSeconds: 60,
      characterIds: [],
      locationIds: [],
    },
  });

  useEffect(() => {
    if (props.kind === "edit" && existing.data) {
      reset({
        description: existing.data.description,
        lengthSeconds: existing.data.lengthSeconds,
        characterIds: existing.data.characterIds ?? [],
        locationIds: existing.data.locationIds ?? [],
      });
    }
  }, [existing.data, props.kind, reset]);

  async function onSubmit(values: StoryCreate) {
    try {
      if (props.kind === "create") {
        const created = await api.post<StoryDto>(
          `/api/worlds/${worldId}/stories`,
          values,
        );
        qc.invalidateQueries({ queryKey: ["stories", worldId] });
        router.push(`/worlds/${worldId}/stories/${created.id}`);
      } else {
        await api.patch(
          `/api/worlds/${worldId}/stories/${props.storyId}`,
          values,
        );
        qc.invalidateQueries({ queryKey: ["stories", worldId] });
        qc.invalidateQueries({ queryKey: ["story", props.storyId] });
      }
    } catch (e) {
      setError("root", { message: (e as Error).message });
    }
  }

  const del = useMutation({
    mutationFn: () =>
      api.del<void>(
        `/api/worlds/${worldId}/stories/${
          props.kind === "edit" ? props.storyId : ""
        }`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stories", worldId] });
      router.push(`/worlds/${worldId}`);
    },
  });

  const lengthSeconds = watch("lengthSeconds");

  if (props.kind === "edit" && !existing.data) {
    return <p className="text-[var(--color-muted)]">Loading…</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href={`/worlds/${worldId}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to world
        </Link>
        <div className="mt-2 flex items-start justify-between">
          <h1 className="font-mono text-2xl uppercase tracking-widest">
            {props.kind === "create" ? "New story" : "Story"}
          </h1>
          {props.kind === "edit" && (
            <Button
              variant="danger"
              onClick={() => {
                if (confirm("Delete this story?")) del.mutate();
              }}
              disabled={del.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Story</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={6}
                placeholder="What happens? Beats, twists, mood…"
                {...register("description")}
              />
              {errors.description?.message && (
                <p className="text-xs text-[var(--color-danger)]">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Length</Label>
              <div className="flex flex-wrap gap-2">
                <Controller
                  control={control}
                  name="lengthSeconds"
                  render={({ field }) => (
                    <>
                      {STORY_LENGTHS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => field.onChange(s)}
                          className={cn(
                            "px-3 h-9 rounded-[var(--radius-control)] border text-sm font-mono cursor-pointer transition",
                            lengthSeconds === s
                              ? "border-[var(--color-accent)] text-[var(--color-accent)] glow-accent"
                              : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)]",
                          )}
                        >
                          {s}s
                        </button>
                      ))}
                    </>
                  )}
                />
              </div>
              {errors.lengthSeconds?.message && (
                <p className="text-xs text-[var(--color-danger)]">
                  {errors.lengthSeconds.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Characters (pick at least one)</Label>
              <Controller
                control={control}
                name="characterIds"
                render={({ field }) => (
                  <MultiSelect
                    items={
                      chars.data?.map((c) => ({ id: c.id, label: c.name })) ?? []
                    }
                    value={field.value}
                    onChange={field.onChange}
                    emptyHint="No characters in this world yet."
                  />
                )}
              />
              {errors.characterIds?.message && (
                <p className="text-xs text-[var(--color-danger)]">
                  {errors.characterIds.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Locations (optional)</Label>
              <Controller
                control={control}
                name="locationIds"
                render={({ field }) => (
                  <MultiSelect
                    items={
                      locs.data?.map((l) => ({ id: l.id, label: l.name })) ?? []
                    }
                    value={field.value ?? []}
                    onChange={field.onChange}
                    emptyHint="No locations in this world yet."
                  />
                )}
              />
            </div>

            {errors.root?.message && (
              <p className="text-sm text-[var(--color-danger)]">
                {errors.root.message}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving…"
                  : props.kind === "create"
                    ? "Create story"
                    : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {props.kind === "edit" && existing.data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mood images</CardTitle>
            </CardHeader>
            <CardContent>
              <ImageUploader
                ownerKind="story_mood"
                ownerId={props.storyId}
                initial={existing.data.moodImages ?? []}
              />
            </CardContent>
          </Card>

          <SongScriptsPanel worldId={worldId} storyId={props.storyId} />
        </>
      )}
    </div>
  );
}

function MultiSelect({
  items,
  value,
  onChange,
  emptyHint,
}: {
  items: { id: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  emptyHint?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)]">{emptyHint ?? "Nothing to pick."}</p>
    );
  }
  function toggle(id: string) {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = value.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => toggle(item.id)}
            className={cn(
              "px-3 h-8 rounded-full border text-xs font-mono uppercase tracking-wider cursor-pointer transition",
              active
                ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[color-mix(in_oklch,var(--color-accent)_15%,transparent)]"
                : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)]",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
