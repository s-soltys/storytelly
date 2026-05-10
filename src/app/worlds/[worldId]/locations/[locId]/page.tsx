"use client";

import { useParams } from "next/navigation";
import { EditNamedEntityForm } from "@/components/forms/NamedEntityForms";

export default function LocationPage() {
  const { worldId, locId } = useParams<{ worldId: string; locId: string }>();
  return (
    <EditNamedEntityForm kind="location" worldId={worldId} entityId={locId} />
  );
}
