import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/world/SectionCard";

type SectionItem = {
  id: string;
  href: string;
  title: string;
  description: string;
  images?: { id: string; url: string }[];
  warning?: string;
};

export function Section({
  title,
  count,
  loading,
  empty,
  newHref,
  newLabel,
  items,
}: {
  title: string;
  count?: number;
  loading: boolean;
  empty: string;
  newHref: string;
  newLabel: string;
  items?: SectionItem[];
}) {
  return (
    <section className="flex flex-col gap-2.5 min-w-0">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] pb-1.5">
        <h2 className="font-mono text-xs uppercase tracking-widest">
          {title}
          {typeof count === "number" && (
            <span className="ml-2 text-[var(--color-muted)]">{count}</span>
          )}
        </h2>
        <Button asChild size="sm" variant="secondary">
          <Link href={newHref}>
            <Plus className="h-4 w-4" /> {newLabel}
          </Link>
        </Button>
      </header>
      <div className="flex flex-col gap-2.5">
        {loading ? (
          <p className="text-[var(--color-muted)] text-sm">Loading…</p>
        ) : !items || items.length === 0 ? (
          <p className="text-[var(--color-muted)] text-sm">{empty}</p>
        ) : (
          items.map((item) => <SectionCard key={item.id} item={item} />)
        )}
      </div>
    </section>
  );
}
