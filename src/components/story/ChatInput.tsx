"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = "Type a message…" }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function onInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  return (
    <div
      className={cn(
        "flex items-end gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/60 px-3 py-2 transition focus-within:border-[var(--color-accent)]/60 focus-within:bg-[var(--color-surface)]",
        disabled && "opacity-60",
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onInput={onInput}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none bg-transparent text-sm text-[var(--color-fg)] placeholder-[var(--color-muted)] outline-none"
        style={{ scrollbarWidth: "none" }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !value.trim()}
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] transition",
          value.trim() && !disabled
            ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:opacity-90 cursor-pointer"
            : "bg-[var(--color-surface-2)]/50 text-[var(--color-muted)] cursor-not-allowed",
        )}
      >
        <Send className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
