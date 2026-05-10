"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, type WorldDto } from "@/lib/api";
import { worldCreateSchema, type WorldCreate } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewWorldPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<WorldCreate>({ resolver: zodResolver(worldCreateSchema) });

  async function onSubmit(values: WorldCreate) {
    try {
      const created = await api.post<WorldDto>("/api/worlds", values);
      router.push(`/worlds/${created.id}`);
    } catch (e) {
      setError("root", { message: (e as Error).message });
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-mono text-2xl uppercase tracking-widest mb-6">
        New world
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Bones of the world</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <Field label="Name" error={errors.name?.message}>
              <Input
                placeholder="Neon Tokyo 2099"
                {...register("name")}
              />
            </Field>
            <Field label="Art style" error={errors.artStyle?.message}>
              <Textarea
                placeholder="Neo-noir cyberpunk, neon-lit alleys, rain-soaked streets…"
                {...register("artStyle")}
              />
            </Field>
            <Field
              label="World-building description"
              error={errors.description?.message}
            >
              <Textarea
                rows={6}
                placeholder="Tell me about the world. What's the vibe, the rules, the conflict?"
                {...register("description")}
              />
            </Field>
            {errors.root?.message && (
              <p className="text-sm text-[var(--color-danger)]">
                {errors.root.message}
              </p>
            )}
            <p className="text-xs text-[var(--color-muted)]">
              You&apos;ll add mood images after creating the world.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating…" : "Create world"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
