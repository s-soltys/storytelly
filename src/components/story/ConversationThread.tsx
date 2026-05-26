"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ConversationMessage, ChipSuggestion } from "./types";

interface ConversationThreadProps {
  messages: ConversationMessage[];
  onChipClick: (chip: ChipSuggestion, message: ConversationMessage) => void;
  selectedChips: Set<string>;
}

export function ConversationThread({
  messages,
  onChipClick,
  selectedChips,
}: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto py-2 pr-1" style={{ scrollbarWidth: "thin" }}>
      {messages.map((msg) => (
        <div key={msg.id} className={cn("flex flex-col gap-1.5", msg.role === "user" ? "items-end" : "items-start")}>
          <Bubble msg={msg} />
          {msg.chips && msg.chips.length > 0 && (
            <ChipRow
              chips={msg.chips}
              multiSelect={msg.multiSelect}
              selectedChips={selectedChips}
              onChipClick={(chip) => onChipClick(chip, msg)}
            />
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function Bubble({ msg }: { msg: ConversationMessage }) {
  const isUser = msg.role === "user";

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

  return (
    <div
      className={cn(
        "max-w-[85%] rounded-[var(--radius-control)] px-3 py-2 text-sm leading-relaxed",
        isUser
          ? "bg-[color-mix(in_oklch,var(--color-accent)_18%,transparent)] border border-[var(--color-accent)]/30 text-[var(--color-fg)]"
          : "border border-[var(--color-border)]/50 bg-[var(--color-surface)]/60 text-[var(--color-fg)]",
      )}
    >
      {msg.content}
    </div>
  );
}

function ChipRow({
  chips,
  multiSelect,
  selectedChips,
  onChipClick,
}: {
  chips: ChipSuggestion[];
  multiSelect?: boolean;
  selectedChips: Set<string>;
  onChipClick: (chip: ChipSuggestion) => void;
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
        <span className="self-center font-mono text-[9px] uppercase tracking-wider text-[var(--color-muted)]">
          Select all that apply
        </span>
      )}
    </div>
  );
}
