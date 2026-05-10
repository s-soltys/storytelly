"use client";

import { useParams } from "next/navigation";
import { StoryForm } from "@/components/forms/StoryForm";

export default function StoryPage() {
  const { worldId, storyId } = useParams<{
    worldId: string;
    storyId: string;
  }>();
  return <StoryForm kind="edit" worldId={worldId} storyId={storyId} />;
}
