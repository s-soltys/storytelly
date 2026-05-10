"use client";

import { useParams } from "next/navigation";
import { NewNamedEntityForm } from "@/components/forms/NamedEntityForms";

export default function NewLocationPage() {
  const { worldId } = useParams<{ worldId: string }>();
  return <NewNamedEntityForm kind="location" worldId={worldId} />;
}
