"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type WorldDto } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus } from "lucide-react";

export default function HomePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["worlds"],
    queryFn: () => api.get<WorldDto[]>("/api/worlds"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-mono text-3xl uppercase tracking-widest">
            Worlds
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Build the universes your stories live in.
          </p>
        </div>
        <Button asChild>
          <Link href="/worlds/new">
            <Plus className="h-4 w-4" /> New world
          </Link>
        </Button>
      </div>

      {isLoading && <p className="text-[var(--color-muted)]">Loading…</p>}
      {error && (
        <p className="text-[var(--color-danger)]">{(error as Error).message}</p>
      )}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-[var(--color-muted)]">
              No worlds yet. Create the first one.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.map((w) => (
          <Link key={w.id} href={`/worlds/${w.id}`} className="group">
            <Card className="h-full overflow-hidden transition group-hover:border-[var(--color-accent)]">
              {w.moodImages && w.moodImages[0] && (
                <div className="aspect-video w-full overflow-hidden bg-[var(--color-surface-2)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={w.moodImages[0].url}
                    alt=""
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                </div>
              )}
              <CardHeader>
                <CardTitle className="group-hover:text-[var(--color-accent)] transition-colors">
                  {w.name}
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  {w.artStyle}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--color-fg)]/80 line-clamp-3">
                  {w.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
