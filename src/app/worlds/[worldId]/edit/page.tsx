"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { api, type WorldDto } from "@/lib/api";
import { worldCreateSchema, type WorldCreate } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EditWorldPage() {
  const { worldId } = useParams<{ worldId: string }>();
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ["world", worldId],
    queryFn: () => api.get<WorldDto>(`/api/worlds/${worldId}`),
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<WorldCreate>({ resolver: zodResolver(worldCreateSchema) });

  useEffect(() => {
    if (data) {
      reset({
        name: data.name,
        artStyle: data.artStyle,
        description: data.description,
      });
    }
  }, [data, reset]);

  async function onSubmit(values: WorldCreate) {
    try {
      await api.patch(`/api/worlds/${worldId}`, values);
      router.push(`/worlds/${worldId}`);
    } catch (e) {
      setError("root", { message: (e as Error).message });
    }
  }

  if (!data) return <p className="text-[var(--color-muted)]">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="font-mono text-2xl uppercase tracking-widest mb-6">
        Edit world
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>{data.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input {...register("name")} />
              {errors.name?.message && (
                <p className="text-xs text-[var(--color-danger)]">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Art style</Label>
              <Textarea {...register("artStyle")} />
              {errors.artStyle?.message && (
                <p className="text-xs text-[var(--color-danger)]">
                  {errors.artStyle.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>World-building description</Label>
              <Textarea rows={6} {...register("description")} />
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
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
