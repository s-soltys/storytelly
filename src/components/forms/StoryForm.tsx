"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { storyCreateSchema, type StoryCreate, STORY_LENGTHS } from "@/lib/validation";
import {
  api,
  type CharacterDto,
  type LocationDto,
  type StoryDto,
  type StoryLyricsVersionDto,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/ImageUploader";
import { StorySongsPanel } from "@/components/StorySongsPanel";
import { ArrowLeft, ImageIcon, Terminal, Trash2, History, ChevronDown, ChevronUp } from "lucide-react";
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
    setValue,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<StoryCreate>({
    resolver: zodResolver(storyCreateSchema),
    defaultValues: {
      name: "",
      description: "",
      characterIds: [],
      locationIds: [],
      lengthSeconds: 60,
      lyrics: "",
    },
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<number | null>(null);
  const savedValues = useRef<StoryCreate | null>(null);
  const saveVersion = useRef(0);

  const [instructions, setInstructions] = useState("");

  const versions = useQuery({
    queryKey: ["story-lyrics-versions", props.kind === "edit" ? props.storyId : null],
    enabled: props.kind === "edit",
    queryFn: () =>
      api.get<StoryLyricsVersionDto[]>(
        `/api/worlds/${worldId}/stories/${props.kind === "edit" ? props.storyId : ""}/lyrics/versions`,
      ),
  });

  const generateLyrics = useMutation({
    mutationFn: (args?: { instructions?: string }) =>
      api.post<{ lyrics: string }>(
        `/api/worlds/${worldId}/stories/${props.kind === "edit" ? props.storyId : ""}/lyrics`,
        {
          lengthSeconds: getValues("lengthSeconds"),
          instructions: args?.instructions,
        },
      ),
    onSuccess: (data) => {
      setValue("lyrics", data.lyrics);
      setInstructions("");
      if (props.kind === "edit") {
        qc.invalidateQueries({ queryKey: ["story", props.storyId] });
        qc.invalidateQueries({ queryKey: ["story-lyrics-versions", props.storyId] });
      }
    },
  });

  useEffect(() => {
    if (props.kind === "edit" && existing.data) {
      const values = {
        name: existing.data.name,
        description: existing.data.description,
        characterIds: existing.data.characterIds ?? [],
        locationIds: existing.data.locationIds ?? [],
        lengthSeconds: existing.data.lengthSeconds ?? 60,
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

  const nameField = register("name");
  const descriptionField = register("description");

  function sameValues(a: StoryCreate, b: StoryCreate) {
    return (
      a.name === b.name &&
      a.description === b.description &&
      a.lengthSeconds === b.lengthSeconds &&
      a.lyrics === b.lyrics &&
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
        qc.invalidateQueries({ queryKey: ["story-lyrics-versions", props.storyId] });
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

          {props.kind === "edit" && (
            <>
              <div className="border-t border-[var(--color-border)]/50 my-4" />
              
              <FieldLine label="Length">
                <select
                  value={getValues("lengthSeconds") || 60}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setValue("lengthSeconds", val);
                    scheduleAutoSave({
                      ...getValues(),
                      lengthSeconds: val,
                    });
                  }}
                  className="h-9 w-full rounded-[var(--radius-control)] border border-transparent bg-[var(--color-surface-2)]/35 px-2 text-sm text-[var(--color-fg)] outline-none hover:bg-[var(--color-surface-2)]/55 focus:border-[var(--color-border)] focus:bg-[var(--color-surface)]"
                >
                  {STORY_LENGTHS.map((value) => (
                    <option key={value} value={value}>
                      {value}s
                    </option>
                  ))}
                </select>
              </FieldLine>

              <FieldLine label="Lyrics">
                <div className="space-y-3">
                  <Textarea
                    rows={12}
                    placeholder="Write or generate lyrics for this story..."
                    className="border-transparent bg-[var(--color-surface-2)]/35 shadow-none hover:bg-[var(--color-surface-2)]/55 focus:bg-[var(--color-surface)] focus:border-[var(--color-border)] min-h-64 font-mono text-xs leading-relaxed"
                    {...register("lyrics")}
                    onChange={(e) => {
                      register("lyrics").onChange(e);
                      scheduleAutoSave({
                        ...getValues(),
                        lyrics: e.target.value,
                      });
                    }}
                  />
                  
                  <div className="rounded-[var(--radius-control)] border border-[var(--color-border)]/50 bg-[var(--color-surface-2)]/20 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-muted)]">
                        AI Lyrics Assistant
                      </span>
                      <div className="flex gap-2">
                        {getValues("lyrics") ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={generateLyrics.isPending}
                            onClick={() => generateLyrics.mutate(undefined)}
                            className="h-7 text-xs cursor-pointer"
                          >
                            {generateLyrics.isPending && !instructions ? (
                              <span className="animate-spin mr-1">↺</span>
                            ) : null}
                            Re-generate
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            disabled={generateLyrics.isPending}
                            onClick={() => generateLyrics.mutate(undefined)}
                            className="h-7 text-xs cursor-pointer"
                          >
                            {generateLyrics.isPending && !instructions ? (
                              <span className="animate-spin mr-1">↺</span>
                            ) : null}
                            Generate lyrics
                          </Button>
                        )}
                      </div>
                    </div>

                    {getValues("lyrics") && (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Tell AI what to change... (e.g. 'make it darker')"
                          value={instructions}
                          onChange={(e) => setInstructions(e.target.value)}
                          disabled={generateLyrics.isPending}
                          className="h-8 border-transparent bg-[var(--color-surface-2)]/30 text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={generateLyrics.isPending || !instructions.trim()}
                          onClick={() => generateLyrics.mutate({ instructions })}
                          className="h-8 text-xs font-mono cursor-pointer"
                        >
                          {generateLyrics.isPending && instructions ? (
                            <span className="animate-spin mr-1">↺</span>
                          ) : null}
                          Refine
                        </Button>
                      </div>
                    )}
                    
                    {generateLyrics.error && (
                      <p className="text-[10px] text-[var(--color-danger)] font-mono">
                        {(generateLyrics.error as Error).message}
                      </p>
                    )}
                  </div>

                  {versions.data && versions.data.length > 0 && (
                    <LyricsHistoryPanel
                      versions={versions.data}
                      onRestore={(lyricsText) => {
                        setValue("lyrics", lyricsText);
                        scheduleAutoSave({
                          ...getValues(),
                          lyrics: lyricsText,
                        });
                      }}
                    />
                  )}
                </div>
              </FieldLine>
            </>
          )}

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
          <aside className="space-y-4">
            <div className="rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/55 p-3">
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
            </div>

            <div className="rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/55 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-[var(--color-muted)]" />
                <h2 className="font-mono text-xs uppercase tracking-widest">
                  System
                </h2>
              </div>
              <Link href={`/worlds/${worldId}/stories/${props.storyId}/logs`}>
                <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-xs font-mono uppercase tracking-wider" size="sm">
                  <Terminal className="h-3.5 w-3.5" /> View AI Logs
                </Button>
              </Link>
            </div>
          </aside>
        )}
      </div>

      {props.kind === "edit" && existing.data && (
        <StorySongsPanel worldId={worldId} storyId={props.storyId} />
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

function LyricsHistoryPanel({
  versions,
  onRestore,
}: {
  versions: StoryLyricsVersionDto[];
  onRestore: (lyrics: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--color-border)]/50 bg-[var(--color-surface-2)]/10 p-2.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left cursor-pointer transition hover:text-[var(--color-fg)]"
      >
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          <History className="h-3.5 w-3.5 animate-none" /> Version History ({versions.length})
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-[var(--color-muted)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--color-muted)]" />
        )}
      </button>

      {open && (
        <div className="mt-2.5 max-h-48 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
          {versions.map((ver) => (
            <div
              key={ver.id}
              className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/30 pb-1.5 last:border-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[10px] text-[var(--color-fg)]">
                  {ver.prompt || "Manual Edit"}
                </p>
                <p className="text-[9px] text-[var(--color-muted)]">
                  {new Date(ver.createdAt).toLocaleString()}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[9px] uppercase font-mono tracking-wider text-[var(--color-accent)] hover:bg-[var(--color-surface-2)] cursor-pointer"
                onClick={() => {
                  if (confirm("Restore this version? Unsaved changes will be overwritten.")) {
                    onRestore(ver.lyrics);
                  }
                }}
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
