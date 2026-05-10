"use client";

import { useParams } from "next/navigation";
import { EditNamedEntityForm } from "@/components/forms/NamedEntityForms";

export default function CharacterPage() {
  const { worldId, charId } = useParams<{ worldId: string; charId: string }>();
  return (
    <EditNamedEntityForm kind="character" worldId={worldId} entityId={charId} />
  );
}
