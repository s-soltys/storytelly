"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/ImageUploader";
import { ArrowLeft, ImageIcon, Music, RotateCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode =
  | { kind: "create"; worldId: string }
  | { kind: "edit"; worldId: string; storyId: string };
type SaveState = "idle" | "saving" | "saved" | "error" | "invalid";

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
    <div className="grid gap-1.5 sm:grid-cols-[5.25rem_minmax(0,1fr)] sm:items-start">
      <Label className="pt-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
        {label}
      </Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SaveHint({ state }: { state: SaveState }) {
  if (state === "idle") return null;

  const text = {
    saving: "Saving…",
    saved: "Saved.",
    error: "Could not save. Keep editing or try again.",
    invalid: "Pick at least one character and keep story text filled in.",
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
    getValues,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<StoryCreate>({
    resolver: zodResolver(storyCreateSchema),
    defaultValues: {
      name: "",
      description: "",
      lengthSeconds: 60,
      characterIds: [],
      locationIds: [],
      lyrics: "",
    },
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<number | null>(null);
  const savedValues = useRef<StoryCreate | null>(null);
  const saveVersion = useRef(0);

  useEffect(() => {
    if (props.kind === "edit" && existing.data) {
      const values = {
        name: existing.data.name,
        description: existing.data.description,
        lengthSeconds: existing.data.lengthSeconds,
        characterIds: existing.data.characterIds ?? [],
        locationIds: existing.data.locationIds ?? [],
        lyrics: existing.data.lyrics ?? "",
      };
      savedValues.current = values;
      reset(values);
    }
  }, [existing.data, props.kind, reset]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

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

  const generateLyrics = useMutation({
    mutationFn: async () => {
      if (props.kind !== "edit") throw new Error("Create the story first.");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);

      const parsed = storyCreateSchema.safeParse(getValues());
      if (!parsed.success) {
        throw new Error("Complete the story fields before generating lyrics.");
      }

      saveVersion.current += 1;
      setSaveState("saving");
      const updated = await api.patch<StoryDto>(
        `/api/worlds/${worldId}/stories/${props.storyId}`,
        parsed.data,
      );
      savedValues.current = parsed.data;
      qc.setQueryData(["story", props.storyId], (prev: StoryDto | undefined) =>
        prev
          ? {
              ...prev,
              ...updated,
              name: parsed.data.name,
              description: parsed.data.description,
              lengthSeconds: parsed.data.lengthSeconds,
              lyrics: parsed.data.lyrics,
              characterIds: parsed.data.characterIds,
              locationIds: parsed.data.locationIds ?? [],
              moodImages: prev.moodImages,
            }
          : prev,
      );

      return api.post<{ lyrics: string }>(
        `/api/worlds/${worldId}/stories/${
          props.storyId
        }/lyrics`,
        {},
      );
    },
    onSuccess: ({ lyrics }) => {
      if (props.kind !== "edit") return;
      const next = { ...getValues(), lyrics };
      setValue("lyrics", lyrics, { shouldDirty: false, shouldValidate: true });
      savedValues.current = next;
      setSaveState("saved");
      qc.setQueryData(["story", props.storyId], (prev: StoryDto | undefined) =>
        prev ? { ...prev, lyrics } : prev,
      );
      qc.setQueryData(["stories", worldId], (prev: StoryDto[] | undefined) =>
        prev?.map((story) =>
          story.id === props.storyId ? { ...story, lyrics } : story,
        ),
      );
    },
    onError: (e) => {
      setError("root", { message: (e as Error).message });
      setSaveState("error");
    },
  });

  const lengthSeconds = useWatch({ control, name: "lengthSeconds" });
  const lyrics = useWatch({ control, name: "lyrics" });
  const nameField = register("name");
  const descriptionField = register("description");
  const lyricsField = register("lyrics");

  function sameValues(a: StoryCreate, b: StoryCreate) {
    return (
      a.name === b.name &&
      a.description === b.description &&
      (a.lyrics ?? "") === (b.lyrics ?? "") &&
      a.lengthSeconds === b.lengthSeconds &&
      a.characterIds.length === b.characterIds.length &&
      a.characterIds.every((id, idx) => id === b.characterIds[idx]) &&
      (a.locationIds ?? []).length === (b.locationIds ?? []).length &&
      (a.locationIds ?? []).every((id, idx) => id === (b.locationIds ?? [])[idx])
    );
  }

  function scheduleAutoSave(next: StoryCreate) {
    if (props.kind !== "edit") return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);

    const parsed = storyCreateSchema.safeParse(next);
    if (!parsed.success) {
      setSaveState("invalid");
      return;
    }

    if (savedValues.current && sameValues(savedValues.current, parsed.data)) {
      setSaveState("idle");
      return;
    }

    const version = saveVersion.current + 1;
    saveVersion.current = version;
    setSaveState("saving");

    saveTimer.current = window.setTimeout(async () => {
      try {
        const updated = await api.patch<StoryDto>(
          `/api/worlds/${worldId}/stories/${props.storyId}`,
          parsed.data,
        );
        if (saveVersion.current !== version) return;

        savedValues.current = parsed.data;
        qc.setQueryData(["story", props.storyId], (prev: StoryDto | undefined) =>
          prev
            ? {
                ...prev,
                ...updated,
                name: parsed.data.name,
                description: parsed.data.description,
                lengthSeconds: parsed.data.lengthSeconds,
                lyrics: parsed.data.lyrics,
                characterIds: parsed.data.characterIds,
                locationIds: parsed.data.locationIds ?? [],
                moodImages: prev.moodImages,
              }
            : prev,
        );
        qc.setQueryData(["stories", worldId], (prev: StoryDto[] | undefined) =>
          prev?.map((story) =>
            story.id === props.storyId
              ? {
                  ...story,
                  name: parsed.data.name,
                  description: parsed.data.description,
                  lengthSeconds: parsed.data.lengthSeconds,
                  lyrics: parsed.data.lyrics,
                  characterIds: parsed.data.characterIds,
                  locationIds: parsed.data.locationIds ?? [],
                }
              : story,
          ),
        );
        setSaveState("saved");
      } catch (e) {
        if (saveVersion.current !== version) return;
        setError("root", { message: (e as Error).message });
        setSaveState("error");
      }
    }, 650);
  }

  if (props.kind === "edit" && !existing.data) {
    return <p className="text-[var(--color-muted)]">Loading…</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/worlds/${worldId}`}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to world
        </Link>
        <div className="mt-2 flex items-center justify-between gap-3">
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
              size="icon"
              className="h-9 w-9"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div
        className={cn(
          "grid gap-4",
          props.kind === "edit" && "lg:grid-cols-[minmax(0,1fr)_18rem]",
        )}
      >
        <form
          className="space-y-3 rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/45 p-3"
          onSubmit={handleSubmit(onSubmit)}
        >
          <FieldLine label="Name">
            <Input
              placeholder="Song title"
              className={`${quietField} h-9 font-mono text-lg uppercase tracking-widest`}
              {...nameField}
              onChange={(e) => {
                nameField.onChange(e);
                scheduleAutoSave({
                  ...getValues(),
                  name: e.target.value,
                });
              }}
            />
          </FieldLine>
          {errors.name?.message && (
            <p className="text-xs text-[var(--color-danger)] sm:pl-[6rem]">
              {errors.name.message}
            </p>
          )}

          <FieldLine label="Story">
            <Textarea
              rows={5}
              placeholder="What happens? Beats, twists, mood…"
              className={`${quietField} min-h-32 text-sm`}
              {...descriptionField}
              onChange={(e) => {
                descriptionField.onChange(e);
                scheduleAutoSave({
                  ...getValues(),
                  description: e.target.value,
                });
              }}
            />
          </FieldLine>
          {errors.description?.message && (
            <p className="text-xs text-[var(--color-danger)] sm:pl-[6rem]">
              {errors.description.message}
            </p>
          )}

          <FieldLine label="Length">
            <div className="flex flex-wrap gap-1.5">
              <Controller
                control={control}
                name="lengthSeconds"
                render={({ field }) => (
                  <>
                    {STORY_LENGTHS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          field.onChange(s);
                          scheduleAutoSave({
                            ...getValues(),
                            lengthSeconds: s,
                          });
                        }}
                        className={cn(
                          "h-8 rounded-[var(--radius-control)] border px-2.5 text-xs font-mono cursor-pointer transition",
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
          </FieldLine>
          {errors.lengthSeconds?.message && (
            <p className="text-xs text-[var(--color-danger)] sm:pl-[6rem]">
              {errors.lengthSeconds.message}
            </p>
          )}

          <FieldLine label="Characters">
            <Controller
              control={control}
              name="characterIds"
              render={({ field }) => (
                <MultiSelect
                  items={
                    chars.data?.map((c) => ({ id: c.id, label: c.name })) ?? []
                  }
                  value={field.value}
                  onChange={(next) => {
                    field.onChange(next);
                    scheduleAutoSave({
                      ...getValues(),
                      characterIds: next,
                    });
                  }}
                  emptyHint="No characters in this world yet."
                />
              )}
            />
          </FieldLine>
          {errors.characterIds?.message && (
            <p className="text-xs text-[var(--color-danger)] sm:pl-[6rem]">
              {errors.characterIds.message}
            </p>
          )}

          <FieldLine label="Locations">
            <Controller
              control={control}
              name="locationIds"
              render={({ field }) => (
                <MultiSelect
                  items={
                    locs.data?.map((l) => ({ id: l.id, label: l.name })) ?? []
                  }
                  value={field.value ?? []}
                  onChange={(next) => {
                    field.onChange(next);
                    scheduleAutoSave({
                      ...getValues(),
                      locationIds: next,
                    });
                  }}
                  emptyHint="No locations in this world yet."
                />
              )}
            />
          </FieldLine>

          <FieldLine label="Lyrics">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[var(--color-muted)]">
                  {props.kind === "create"
                    ? "Create the story before generating lyrics."
                    : "Generated from this world, selected cast, locations, and story."}
                </p>
                {props.kind === "edit" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={generateLyrics.isPending}
                    onClick={() => {
                      if (
                        lyrics?.trim() &&
                        !confirm("Regenerate lyrics and replace the current text?")
                      ) {
                        return;
                      }
                      generateLyrics.mutate();
                    }}
                  >
                    {generateLyrics.isPending ? (
                      <>
                        <RotateCw className="h-4 w-4 animate-spin" />
                        Generating…
                      </>
                    ) : lyrics?.trim() ? (
                      <>
                        <RotateCw className="h-4 w-4" />
                        Regenerate
                      </>
                    ) : (
                      <>
                        <Music className="h-4 w-4" />
                        Generate
                      </>
                    )}
                  </Button>
                )}
              </div>
              <Textarea
                rows={10}
                placeholder="Lyrics will appear here, or write them manually…"
                className={`${quietField} min-h-64 font-mono text-xs leading-relaxed`}
                {...lyricsField}
                onChange={(e) => {
                  lyricsField.onChange(e);
                  scheduleAutoSave({
                    ...getValues(),
                    lyrics: e.target.value,
                  });
                }}
              />
            </div>
          </FieldLine>

          {errors.root?.message && (
            <p className="text-sm text-[var(--color-danger)]">
              {errors.root.message}
            </p>
          )}

          {props.kind === "create" ? (
            <div className="flex justify-end gap-2 border-t border-[var(--color-border)]/70 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Create story"}
              </Button>
            </div>
          ) : (
            <div className="flex min-h-8 items-center justify-end border-t border-[var(--color-border)]/70 pt-3">
              <SaveHint state={saveState} />
            </div>
          )}
        </form>

        {props.kind === "edit" && existing.data && (
          <aside className="rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/55 p-3">
            <div className="mb-2 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-[var(--color-muted)]" />
              <h2 className="font-mono text-xs uppercase tracking-widest">
                Mood images
              </h2>
            </div>
            <ImageUploader
              ownerKind="story_mood"
              ownerId={props.storyId}
              initial={existing.data.moodImages ?? []}
              compact
            />
          </aside>
        )}
      </div>

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
      <p className="text-xs text-[var(--color-muted)]">
        {emptyHint ?? "Nothing to pick."}
      </p>
    );
  }
  function toggle(id: string) {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const active = value.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => toggle(item.id)}
            className={cn(
              "h-7 rounded-[var(--radius-control)] border px-2.5 text-[11px] font-mono uppercase tracking-wider cursor-pointer transition",
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
