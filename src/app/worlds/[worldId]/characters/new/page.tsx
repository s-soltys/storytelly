"use client";

import { useParams } from "next/navigation";
import { NewNamedEntityForm } from "@/components/forms/NamedEntityForms";

export default function NewCharacterPage() {
  const { worldId } = useParams<{ worldId: string }>();
  return <NewNamedEntityForm kind="character" worldId={worldId} />;
}
