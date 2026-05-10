"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SettingsDto, type StoryScriptDto } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Music, RotateCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SongScriptsPanel({
  worldId,
  storyId,
}: {
  worldId: string;
  storyId: string;
}) {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsDto>("/api/settings"),
  });
  const list = useQuery({
    queryKey: ["story-scripts", storyId],
    queryFn: () =>
      api.get<StoryScriptDto[]>(
        `/api/worlds/${worldId}/stories/${storyId}/scripts`,
      ),
  });

  const generate = useMutation({
    mutationFn: () =>
      api.post<StoryScriptDto>(
        `/api/worlds/${worldId}/stories/${storyId}/scripts`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-scripts", storyId] });
    },
  });

  const remove = useMutation({
    mutationFn: (scriptId: string) =>
      api.del<void>(
        `/api/worlds/${worldId}/stories/${storyId}/scripts/${scriptId}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story-scripts", storyId] });
    },
  });

  const configured = settings.data?.openrouterApiKeyConfigured ?? false;
  const items = list.data ?? [];

  return (
    <Card className="rounded-[var(--radius-control)] py-0">
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-3 p-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Music className="h-4 w-4" /> Song scripts
          </CardTitle>
          {!configured && !settings.isLoading && (
            <p className="text-xs text-[var(--color-muted)] mt-1">
              Add an OpenRouter key in{" "}
              <Link
                href="/"
                className="text-[var(--color-accent)] hover:underline"
              >
                settings
              </Link>{" "}
              to enable generation.
            </p>
          )}
          {settings.data && configured && (
            <p className="text-xs text-[var(--color-muted)] mt-1 font-mono">
              Model: {settings.data.effectiveTaskModels.song_script}
            </p>
          )}
        </div>
        <Button
          type="button"
          onClick={() => generate.mutate()}
          disabled={!configured || generate.isPending}
          size="sm"
        >
          {generate.isPending ? (
            <>
              <RotateCw className="h-4 w-4 animate-spin" /> Generating…
            </>
          ) : items.length ? (
            <>
              <RotateCw className="h-4 w-4" /> Regenerate
            </>
          ) : (
            <>
              <Music className="h-4 w-4" /> Generate
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2.5 p-3 pt-0">
        {generate.error && (
          <p className="text-xs text-[var(--color-danger)]">
            {(generate.error as Error).message}
          </p>
        )}
        {list.isLoading && (
          <p className="text-sm text-[var(--color-muted)]">Loading…</p>
        )}
        {!list.isLoading && items.length === 0 && (
          <p className="text-xs text-[var(--color-muted)]">
            No scripts yet. Click Generate to draft one.
          </p>
        )}
        {items.map((s, idx) => (
          <ScriptItem
            key={s.id}
            script={s}
            defaultOpen={idx === 0}
            onDelete={() => {
              if (confirm("Delete this script?")) remove.mutate(s.id);
            }}
            removing={remove.isPending}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function ScriptItem({
  script,
  defaultOpen,
  onDelete,
  removing,
}: {
  script: StoryScriptDto;
  defaultOpen: boolean;
  onDelete: () => void;
  removing: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const created = new Date(script.createdAt);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)]",
      )}
    >
      <div className="flex items-center justify-between gap-2 p-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-left flex-1 min-w-0 cursor-pointer"
        >
          {open ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
          )}
          <span className="font-mono text-xs uppercase tracking-wider truncate">
            {created.toLocaleString()}
          </span>
          <span className="font-mono text-xs text-[var(--color-muted)] truncate">
            · {script.model}
          </span>
          {(script.tokensIn != null || script.tokensOut != null) && (
            <span className="font-mono text-xs text-[var(--color-muted)] truncate">
              · {script.tokensIn ?? "?"}↑/{script.tokensOut ?? "?"}↓
            </span>
          )}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={removing}
          aria-label="Delete script"
          className="h-8 w-8"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <pre className="max-h-[50vh] overflow-auto border-t border-[var(--color-border)] p-3 text-xs font-mono whitespace-pre-wrap break-words">
          {script.script}
        </pre>
      )}
    </div>
  );
}
