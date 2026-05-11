"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, type AiCallDto, type StoryDto } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Code, MessageSquare, Terminal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function AiLogsPage() {
  const { worldId, storyId } = useParams<{ worldId: string; storyId: string }>();
  const router = useRouter();

  const story = useQuery({
    queryKey: ["story", storyId],
    queryFn: () => api.get<StoryDto>(`/api/worlds/${worldId}/stories/${storyId}`),
  });

  const logs = useQuery({
    queryKey: ["story-logs", storyId],
    queryFn: () => api.get<AiCallDto[]>(`/api/worlds/${worldId}/stories/${storyId}/logs`),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = logs.data?.find((l) => l.id === selectedId);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/worlds/${worldId}/stories/${storyId}`}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to story
        </Link>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h1 className="font-mono text-2xl uppercase tracking-widest">
            AI REQUEST LOGS
          </h1>
        </div>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          {story.data?.name}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* List */}
        <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-2 custom-scrollbar">
          {logs.isLoading && <p className="text-xs text-[var(--color-muted)]">Loading logs...</p>}
          {logs.data?.length === 0 && <p className="text-xs text-[var(--color-muted)]">No logs yet.</p>}
          {logs.data?.map((log) => (
            <button
              key={log.id}
              onClick={() => setSelectedId(log.id)}
              className={cn(
                "w-full text-left p-3 rounded-[var(--radius-control)] border transition flex flex-col gap-1",
                selectedId === log.id
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                  : "border-[var(--color-border)]/50 bg-[var(--color-surface)]/40 hover:border-[var(--color-border)] hover:bg-[var(--color-surface)]/60"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-accent)]">
                  {log.task.replace("_", " ")}
                </span>
                <span className="text-[10px] text-[var(--color-muted)]">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-[11px] font-medium truncate">
                {log.model}
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--color-muted)] font-mono">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {log.durationMs}ms
                </span>
                {log.costUsd && (
                  <span>${Number(log.costUsd).toFixed(4)}</span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="min-h-[400px] rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/45 flex flex-col overflow-hidden">
          {selected ? (
            <>
              <div className="p-4 border-b border-[var(--color-border)]/70 flex items-center justify-between">
                <div>
                  <h3 className="font-mono text-sm uppercase tracking-widest flex items-center gap-2">
                    <Terminal className="h-4 w-4" /> Request Details
                  </h3>
                  <p className="text-[10px] text-[var(--color-muted)] mt-1">
                    {selected.id} • {new Date(selected.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                <section className="space-y-2">
                  <h4 className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)] flex items-center gap-2">
                    <Code className="h-3.3 w-3.5" /> Prompt
                  </h4>
                  <pre className="bg-black/30 p-3 rounded border border-[var(--color-border)]/30 text-[11px] font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto text-[var(--color-muted)]">
                    {selected.prompt}
                  </pre>
                </section>

                <section className="space-y-2">
                  <h4 className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)] flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5" /> Response
                  </h4>
                  <pre className="bg-black/40 p-3 rounded border border-[var(--color-border)]/50 text-[11px] font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto text-[var(--color-fg)]">
                    {selected.response}
                  </pre>
                </section>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-muted)] p-8 text-center">
              <Terminal className="h-8 w-8 mb-3 opacity-20" />
              <p className="text-xs">Select a request from the list to view full prompt and response details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
