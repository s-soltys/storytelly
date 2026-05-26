"use client";

import { useParams } from "next/navigation";
import { StoryWorkshop } from "@/components/story/StoryWorkshop";

export default function StoryPage() {
  const { worldId, storyId } = useParams<{
    worldId: string;
    storyId: string;
  }>();
  return <StoryWorkshop worldId={worldId} storyId={storyId} />;
}
