"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SettingsDto } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";

export function SettingsPanel() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsDto>("/api/settings"),
  });

  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (apiKey: string | null) =>
      api.put<SettingsDto>("/api/settings", { openrouterApiKey: apiKey }),
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      setKeyInput("");
      setSavedNote(data.openrouterApiKeyConfigured ? "Saved." : "Cleared.");
    },
  });

  useEffect(() => {
    if (!savedNote) return;
    const t = setTimeout(() => setSavedNote(null), 2500);
    return () => clearTimeout(t);
  }, [savedNote]);

  const data = settings.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> AI configuration
        </CardTitle>
        <CardDescription>
          Account-level OpenRouter key. Used for every story&apos;s lyrics generation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={
              data?.openrouterApiKeyConfigured
                ? "text-[var(--color-accent)]"
                : "text-[var(--color-danger)]"
            }
          >
            ●
          </span>
          <span className="text-[var(--color-muted)]">
            {settings.isLoading
              ? "Loading…"
              : data?.openrouterApiKeyConfigured
                ? `Configured · ${data.openrouterApiKeyMasked}`
                : "Not configured"}
          </span>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="or-key">OpenRouter API key</Label>
          <div className="flex gap-2">
            <Input
              id="or-key"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={
                data?.openrouterApiKeyConfigured
                  ? "Replace stored key…"
                  : "sk-or-…"
              }
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {data && (
          <div className="space-y-1.5">
            <Label>Models</Label>
            <ul className="text-xs font-mono text-[var(--color-muted)] space-y-1">
              {Object.entries(data.effectiveTaskModels).map(([task, model]) => (
                <li key={task}>
                  <span className="uppercase tracking-wider">{task}</span>
                  <span className="mx-2">→</span>
                  <span className="text-[var(--color-fg)]">{model}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {savedNote && (
            <span className="text-xs text-[var(--color-muted)]">
              {savedNote}
            </span>
          )}
          <div className="flex gap-2 ml-auto">
            {data?.openrouterApiKeyConfigured && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (confirm("Clear the stored API key?")) save.mutate(null);
                }}
                disabled={save.isPending}
              >
                <Trash2 className="h-4 w-4" /> Clear
              </Button>
            )}
            <Button
              type="button"
              onClick={() => {
                const trimmed = keyInput.trim();
                if (!trimmed) return;
                save.mutate(trimmed);
              }}
              disabled={save.isPending || keyInput.trim().length === 0}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {save.error && (
          <p className="text-xs text-[var(--color-danger)]">
            {(save.error as Error).message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
