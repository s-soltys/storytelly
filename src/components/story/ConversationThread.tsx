"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ConversationMessage } from "./types";
import { Hammer } from "lucide-react";

interface ConversationThreadProps {
  messages: ConversationMessage[];
  onChipClick?: (chip: { id: string; label: string }, message: ConversationMessage) => void;
  selectedChips?: Set<string>;
  onSendSelectedChips?: () => void;
  onExecuteTool?: (toolCallId: string, approved: boolean) => void;
}

export function ConversationThread({
  messages,
  onChipClick,
  selectedChips,
  onSendSelectedChips,
  onExecuteTool,
}: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto py-2 pr-1" style={{ scrollbarWidth: "thin" }}>
      {messages.length === 0 && (
        <div className="text-center text-sm text-[var(--color-muted)] mt-10">
          No messages yet. Say hello to start!
        </div>
      )}
      {messages.map((msg) => {
        // Skip rendering system messages in the chat UI since they are just instructions for the AI
        if (msg.role === "system" && !msg.loading) return null;
        
        return (
          <div key={msg.id} className={cn("flex flex-col gap-1.5", msg.role === "user" ? "items-end" : "items-start")}>
            <Bubble msg={msg} allMessages={messages} onExecuteTool={onExecuteTool} />
            {msg.chips && msg.chips.length > 0 && onChipClick && selectedChips && (
              <ChipRow
                chips={msg.chips}
                multiSelect={msg.multiSelect}
                selectedChips={selectedChips}
                onChipClick={(chip) => onChipClick(chip, msg)}
                onSendSelectedChips={onSendSelectedChips}
              />
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
function Bubble({
  msg,
  allMessages,
  onExecuteTool,
}: {
  msg: ConversationMessage;
  allMessages: ConversationMessage[];
  onExecuteTool?: (toolCallId: string, approved: boolean) => void;
}) {
  const isUser = msg.role === "user";
  const isTool = msg.role === "tool";

  if (msg.loading) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)]/50 bg-[var(--color-surface)]/60 px-3 py-2.5">
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-muted)] [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-muted)] [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-muted)] [animation-delay:300ms]" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted)]">Thinking…</span>
      </div>
    );
  }

  if (isTool) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)]/50 bg-[var(--color-surface)]/30 px-3 py-2 text-[13px] text-[var(--color-muted)] italic">
        <Hammer className="h-3 w-3" />
        {msg.content}
      </div>
    );
  }

  // Assistant might just call tools and output no text, unless we need to show the action box
  if (!msg.content && msg.toolCalls && msg.toolCalls.length > 0) {
    // Let it render the action box below
  } else if (!msg.content && msg.toolCalls && msg.toolCalls.length === 0) {
    return null;
  }
  // Render tool calls that haven't been executed yet
  const unexecutedTools = msg.toolCalls?.filter(
    (call) => !allMessages.some((m) => m.role === "tool" && m.toolCallId === call.id)
  );

  return (
    <div className="flex flex-col gap-2 max-w-[85%]">
      {msg.content && (
        <div
          className={cn(
            "rounded-[var(--radius-control)] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
            isUser
              ? "bg-[color-mix(in_oklch,var(--color-accent)_18%,transparent)] border border-[var(--color-accent)]/30 text-[var(--color-fg)]"
              : "border border-[var(--color-border)]/50 bg-[var(--color-surface)]/60 text-[var(--color-fg)]",
          )}
        >
          {msg.content}
        </div>
      )}

      {unexecutedTools && unexecutedTools.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          {unexecutedTools.map((call) => {
            const args = JSON.parse(call.function.arguments || "{}");
            const isLyrics = call.function.name === "generate_lyrics";
            const isMp3 = call.function.name === "generate_mp3";
            return (
              <div key={call.id} className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)]/50 bg-[var(--color-surface)]/40 p-3 text-sm">
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[var(--color-accent)]">
                  <Hammer className="h-3 w-3" />
                  Proposed Action
                </div>
                <div className="font-medium">
                  {isLyrics ? "Generate Lyrics" : isMp3 ? "Generate MP3" : call.function.name}
                </div>
                {args.instructions && (
                  <div className="text-[var(--color-muted)] italic leading-snug">
                    "{args.instructions}"
                  </div>
                )}
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => onExecuteTool?.(call.id, true)}
                    className="flex-1 rounded-[var(--radius-control)] bg-[color-mix(in_oklch,var(--color-accent)_20%,transparent)] border border-[var(--color-accent)]/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-accent)] transition hover:bg-[color-mix(in_oklch,var(--color-accent)_30%,transparent)]"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onExecuteTool?.(call.id, false)}
                    className="flex-1 rounded-[var(--radius-control)] bg-[var(--color-surface)] border border-[var(--color-border)]/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[color-mix(in_oklch,var(--color-fg)_10%,var(--color-surface))]"
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChipRow({
  chips,
  multiSelect,
  selectedChips,
  onChipClick,
  onSendSelectedChips,
}: {
  chips: { id: string; label: string }[];
  multiSelect?: boolean;
  selectedChips: Set<string>;
  onChipClick: (chip: { id: string; label: string }) => void;
  onSendSelectedChips?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 pl-1">
      {chips.map((chip) => {
        const active = selectedChips.has(chip.id);
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onChipClick(chip)}
            className={cn(
              "h-7 cursor-pointer rounded-[var(--radius-control)] border px-2.5 font-mono text-[10px] uppercase tracking-wider transition",
              active
                ? "border-[var(--color-accent)] bg-[color-mix(in_oklch,var(--color-accent)_20%,transparent)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)]/60 hover:text-[var(--color-fg)]",
            )}
          >
            {chip.label}
          </button>
        );
      })}
      {multiSelect && (
        <button
          type="button"
          onClick={onSendSelectedChips}
          disabled={selectedChips.size === 0}
          className="h-7 cursor-pointer rounded-[var(--radius-control)] bg-[var(--color-surface)] px-3 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[color-mix(in_oklch,var(--color-fg)_10%,var(--color-surface))] disabled:opacity-50"
        >
          Add selected
        </button>
      )}
    </div>
  );
}
