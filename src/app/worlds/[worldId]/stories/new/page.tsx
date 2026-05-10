"use client";

import { useParams } from "next/navigation";
import { StoryForm } from "@/components/forms/StoryForm";

export default function NewStoryPage() {
  const { worldId } = useParams<{ worldId: string }>();
  return <StoryForm kind="create" worldId={worldId} />;
}
