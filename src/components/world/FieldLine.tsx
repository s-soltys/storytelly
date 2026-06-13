import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function FieldLine({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:items-start">
      <Label className="pt-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
        {label}
      </Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
