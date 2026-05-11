"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  characterCreateSchema,
  characterUpdateSchema,
  type CharacterCreate,
} from "@/lib/validation";
import { api, type CharacterDto, type ImageDto } from "@/lib/api";
import type { ImageOwnerKind } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ImageUploader } from "@/components/ImageUploader";
import { ArrowLeft, Trash2, Wand2 } from "lucide-react";

export type NamedEntityKind = "character" | "location";

const KIND_CONFIG: Record<
  NamedEntityKind,
  {
    label: string;
    pluralPath: string;
    listKey: string;
    ownerKind: ImageOwnerKind;
    requireImage: boolean;
  }
> = {
  character: {
    label: "Character",
    pluralPath: "characters",
    listKey: "characters",
    ownerKind: "character",
    requireImage: true,
  },
  location: {
    label: "Location",
    pluralPath: "locations",
    listKey: "locations",
    ownerKind: "location",
    requireImage: false,
  },
};

export function NewNamedEntityForm({
  kind,
  worldId,
}: {
  kind: NamedEntityKind;
  worldId: string;
}) {
  const cfg = KIND_CONFIG[kind];
  const router = useRouter();
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CharacterCreate>({ resolver: zodResolver(characterCreateSchema) });

  async function onSubmit(values: CharacterCreate) {
    try {
      const created = await api.post<CharacterDto>(
        `/api/worlds/${worldId}/${cfg.pluralPath}`,
        values,
      );
      qc.invalidateQueries({ queryKey: [cfg.listKey, worldId] });
      router.push(`/worlds/${worldId}/${cfg.pluralPath}/${created.id}`);
    } catch (e) {
      setError("root", { message: (e as Error).message });
    }
  }

  return (
    <div className="max-w-2xl">
      <Link
        href={`/worlds/${worldId}`}
        className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-fg)] mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to world
      </Link>
      <h1 className="font-mono text-2xl uppercase tracking-widest mb-6">
        New {cfg.label.toLowerCase()}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>{cfg.label} details</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder={
                  kind === "character" ? "Aiko Reiko" : "Lower 7th Sector"
                }
                {...register("name")}
              />
              <p className="text-xs text-[var(--color-muted)]">
                Locked after creation, unique within this world.
              </p>
              {errors.name?.message && (
                <p className="text-xs text-[var(--color-danger)]">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={6}
                placeholder={
                  kind === "character"
                    ? "Looks, voice, personality, motivations…"
                    : "What it looks like, the mood, who hangs out there…"
                }
                {...register("description")}
              />
              {errors.description?.message && (
                <p className="text-xs text-[var(--color-danger)]">
                  {errors.description.message}
                </p>
              )}
            </div>
            {errors.root?.message && (
              <p className="text-sm text-[var(--color-danger)]">
                {errors.root.message}
              </p>
            )}
            <p className="text-xs text-[var(--color-muted)]">
              {cfg.requireImage
                ? "You'll add at least one image after creating."
                : "You can add images after creating."}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating…" : `Create ${cfg.label.toLowerCase()}`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function EditNamedEntityForm({
  kind,
  worldId,
  entityId,
}: {
  kind: NamedEntityKind;
  worldId: string;
  entityId: string;
}) {
  const cfg = KIND_CONFIG[kind];
  const router = useRouter();
  const qc = useQueryClient();

  const { data, refetch } = useQuery({
    queryKey: [cfg.ownerKind, entityId],
    queryFn: () =>
      api.get<CharacterDto>(
        `/api/worlds/${worldId}/${cfg.pluralPath}/${entityId}`,
      ),
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ description: string }>({
    resolver: zodResolver(characterUpdateSchema),
  });

  useEffect(() => {
    if (data) reset({ description: data.description });
  }, [data, reset]);

  async function onSubmit(values: { description: string }) {
    try {
      await api.patch(
        `/api/worlds/${worldId}/${cfg.pluralPath}/${entityId}`,
        values,
      );
      qc.invalidateQueries({ queryKey: [cfg.listKey, worldId] });
    } catch (e) {
      setError("root", { message: (e as Error).message });
    }
  }

  const del = useMutation({
    mutationFn: () =>
      api.del<void>(`/api/worlds/${worldId}/${cfg.pluralPath}/${entityId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [cfg.listKey, worldId] });
      router.push(`/worlds/${worldId}`);
    },
  });

  if (!data) return <p className="text-[var(--color-muted)]">Loading…</p>;

  const imageCount = data.images?.length ?? 0;
  const imageWarning =
    cfg.requireImage && imageCount === 0
      ? `${cfg.label}s need at least one image.`
      : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href={`/worlds/${worldId}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to world
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <h1 className="font-mono text-3xl uppercase tracking-widest">
            {data.name}
          </h1>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => genImage.mutate()}
              disabled={genImage.isPending}
            >
              <Wand2 className={`h-4 w-4 mr-2 ${genImage.isPending ? "animate-spin" : ""}`} />
              {genImage.isPending ? "Generating…" : "Generate image"}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm(`Delete this ${cfg.label.toLowerCase()}?`))
                  del.mutate();
              }}
              disabled={del.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <Textarea rows={6} {...register("description")} />
            {errors.description?.message && (
              <p className="text-xs text-[var(--color-danger)]">
                {errors.description.message}
              </p>
            )}
            {errors.root?.message && (
              <p className="text-sm text-[var(--color-danger)]">
                {errors.root.message}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Images</CardTitle>
          {imageWarning && (
            <p className="text-xs text-[var(--color-danger)]">{imageWarning}</p>
          )}
        </CardHeader>
        <CardContent>
          <ImageUploader
            ownerKind={cfg.ownerKind}
            ownerId={entityId}
            initial={data.images ?? []}
            onChange={(imgs) => {
              // sync the cache so the warning clears
              qc.setQueryData([cfg.ownerKind, entityId], (prev: CharacterDto | undefined) =>
                prev ? { ...prev, images: imgs as ImageDto[] } : prev,
              );
              refetch();
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
