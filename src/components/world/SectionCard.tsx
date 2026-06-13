import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

type SectionItem = {
  id: string;
  href: string;
  title: string;
  description: string;
  images?: { id: string; url: string }[];
  warning?: string;
};

export function SectionCard({ item }: { item: SectionItem }) {
  return (
    <Link href={item.href} className="group block">
      <Card className="overflow-hidden transition group-hover:border-[var(--color-accent)] py-0">
        <div className="flex">
          <div className="w-16 shrink-0 aspect-square bg-[var(--color-surface-2)] overflow-hidden flex items-center justify-center">
            {item.images && item.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.images[0].url}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition group-hover:scale-105"
              />
            ) : (
              <ImageIcon className="h-5 w-5 text-[var(--color-muted)]" />
            )}
          </div>
          <div className="flex-1 min-w-0 p-2.5">
            <p className="font-mono text-xs uppercase tracking-wider truncate group-hover:text-[var(--color-accent)] transition-colors">
              {item.title}
            </p>
            {item.warning && (
              <p className="text-[10px] text-[var(--color-danger)] mt-0.5">
                {item.warning}
              </p>
            )}
            <p className="text-xs text-[var(--color-fg)]/70 mt-0.5 line-clamp-2">
              {item.description}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
