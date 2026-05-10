"use client";

import { useParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, type WorldDto } from "@/lib/api";
import { StageRail, type StageRailItem } from "@/components/StageRail";

export default function WorldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { worldId } = useParams<{ worldId: string }>();
  const pathname = usePathname();

  const isWorldRoot = pathname === `/worlds/${worldId}`;

  const world = useQuery({
    queryKey: ["world", worldId],
    queryFn: () => api.get<WorldDto>(`/api/worlds/${worldId}`),
    enabled: !isWorldRoot,
  });

  if (isWorldRoot) {
    return <>{children}</>;
  }

  const items: StageRailItem[] = world.data
    ? [
        {
          href: `/worlds/${worldId}`,
          kind: "World",
          label: world.data.name,
        },
      ]
    : [];

  return (
    <div className="flex gap-6">
      <StageRail items={items} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
