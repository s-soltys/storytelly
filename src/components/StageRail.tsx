"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export type StageRailItem = {
  href: string;
  kind: string;
  label: string;
};

export function StageRail({ items }: { items: StageRailItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="sticky top-6 self-start flex flex-col gap-2 shrink-0">
      {items.map((item) => (
        <RailTab key={item.href} item={item} />
      ))}
    </div>
  );
}

function RailTab({ item }: { item: StageRailItem }) {
  return (
    <Link
      href={item.href}
      title={`Back to ${item.label}`}
      className={cn(
        "group w-12 min-h-48 rounded-[var(--radius-card)]",
        "border border-[var(--color-border)] bg-[var(--color-surface)]",
        "hover:border-[var(--color-accent)] transition",
        "flex flex-col items-center justify-between py-3",
      )}
    >
      <ChevronLeft className="h-4 w-4 text-[var(--color-muted)] group-hover:text-[var(--color-accent)] transition-colors" />
      <div className="flex-1 flex items-center justify-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)] [writing-mode:vertical-rl] rotate-180">
          {item.kind}
        </span>
        <span
          className="font-mono text-xs uppercase tracking-widest text-[var(--color-fg)] group-hover:text-[var(--color-accent)] transition-colors [writing-mode:vertical-rl] rotate-180 max-h-72 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ textOverflow: "ellipsis" }}
        >
          {item.label}
        </span>
      </div>
      <span aria-hidden className="h-4" />
    </Link>
  );
}
