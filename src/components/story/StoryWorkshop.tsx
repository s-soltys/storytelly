"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import {
  api,
  type CharacterDto,
  type LocationDto,
  type StoryDto,
  type StoryLyricsVersionDto,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConversationThread } from "./ConversationThread";
import { ChatInput } from "./ChatInput";
import { ArtifactPanel } from "./ArtifactPanel";
import type {
  ConversationMessage,
  ConversationPhase,
  ChipSuggestion,
  DevelopResponse,
  DevelopRequest,
} from "./types";
import { STORY_LENGTHS } from "@/lib/validation";

// ─── Opening questions per phase ─────────────────────────────────────────────

function buildOpeningMessages(
  story: StoryDto,
  characters: CharacterDto[],
  locations: LocationDto[],
): ConversationMessage[] {
  const hasLyrics = Boolean(story.lyrics?.trim());
  const hasDescription = Boolean(story.description?.trim());
  const hasCharacters = (story.characterIds ?? []).length > 0;

  // Returning to a story that already has lyrics → jump straight to refine
  if (hasLyrics) {
    return [
      {
        id: nanoid(),
        role: "system",
        content: `Here's where we left off with "${story.name}". The lyrics draft is on the right. What would you like to change, or say "looks good" to move on to generating a song.`,
      },
    ];
  }

  // Story has description + characters → skip to length selection
  if (hasDescription && hasCharacters) {
    return [
      {
        id: nanoid(),
        role: "system",
        content: `"${story.name}" is ready to go — I have the story and characters. Pick a song length to generate your first lyrics draft.`,
        chips: STORY_LENGTHS.map((s) => ({ id: String(s), label: `${s}s` })),
      },
    ];
  }

  // Fresh story — start with description if missing
  if (!hasDescription) {
    return [
      {
        id: nanoid(),
        role: "system",
        content: `Let's develop "${story.name}". What happens in this story? Describe the key beats, the conflict, and the emotional arc — even a rough sketch is great.`,
      },
    ];
  }

  // Has description but no characters selected
  return [
    {
      id: nanoid(),
      role: "system",
      content: `"${story.name}" has a story direction. ${characters.length > 0 ? "Which characters are part of it?" : "Add some characters to your world first, then come back."}`,
      chips:
        characters.length > 0
          ? characters.map((c) => ({ id: c.id, label: c.name }))
          : [],
      multiSelect: true,
    },
  ];
}

function initialPhase(story: StoryDto): ConversationPhase {
  if (story.lyrics?.trim()) return "refine";
  const hasDescription = Boolean(story.description?.trim());
  const hasCharacters = (story.characterIds ?? []).length > 0;
  if (hasDescription && hasCharacters) return "lyrics";
  return "foundation";
}

// ─── Main Workshop ─────────────────────────────────────────────────────────

interface StoryWorkshopProps {
  worldId: string;
  storyId: string;
}

type SaveState = "idle" | "saving" | "saved" | "error" | "invalid";

export function StoryWorkshop({ worldId, storyId }: StoryWorkshopProps) {
  const router = useRouter();
  const qc = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────────────────
  const storyQ = useQuery({
    queryKey: ["story", storyId],
    queryFn: () => api.get<StoryDto>(`/api/worlds/${worldId}/stories/${storyId}`),
  });
  const charsQ = useQuery({
    queryKey: ["characters", worldId],
    queryFn: () => api.get<CharacterDto[]>(`/api/worlds/${worldId}/characters`),
  });
  const locsQ = useQuery({
    queryKey: ["locations", worldId],
    queryFn: () => api.get<LocationDto[]>(`/api/worlds/${worldId}/locations`),
  });
  const versionsQ = useQuery({
    queryKey: ["story-lyrics-versions", storyId],
    queryFn: () =>
      api.get<StoryLyricsVersionDto[]>(
        `/api/worlds/${worldId}/stories/${storyId}/lyrics/versions`,
      ),
  });

  // ── Local story state (mirrors DB, updated optimistically) ───────────────
  const [localStory, setLocalStory] = useState<StoryDto | null>(null);

  useEffect(() => {
    if (storyQ.data && !localStory) {
      setLocalStory(storyQ.data);
    }
  }, [storyQ.data, localStory]);

  // ── Conversation state ────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [phase, setPhase] = useState<ConversationPhase>("foundation");
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const conversationBootstrapped = useRef(false);

  useEffect(() => {
    if (conversationBootstrapped.current) return;
    if (!storyQ.data || !charsQ.data || !locsQ.data) return;

    const opening = buildOpeningMessages(storyQ.data, charsQ.data, locsQ.data);
    const startPhase = initialPhase(storyQ.data);
    setMessages(opening);
    setPhase(startPhase);
    setLocalStory(storyQ.data);
    conversationBootstrapped.current = true;
  }, [storyQ.data, charsQ.data, locsQ.data]);

  // ── Autosave ─────────────────────────────────────────────────────────────
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<number | null>(null);
  const saveVersion = useRef(0);

  const scheduleSave = useCallback(
    (updates: Partial<StoryDto>) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      const version = ++saveVersion.current;
      setSaveState("saving");

      saveTimer.current = window.setTimeout(async () => {
        try {
          await api.patch(`/api/worlds/${worldId}/stories/${storyId}`, updates);
          if (saveVersion.current !== version) return;
          setSaveState("saved");
          qc.invalidateQueries({ queryKey: ["story", storyId] });
          qc.invalidateQueries({ queryKey: ["story-lyrics-versions", storyId] });
          qc.invalidateQueries({ queryKey: ["stories", worldId] });
        } catch {
          if (saveVersion.current !== version) return;
          setSaveState("error");
        }
      }, 650);
    },
    [worldId, storyId, qc],
  );

  function updateLocalStory(updates: Partial<StoryDto>) {
    setLocalStory((prev) => (prev ? { ...prev, ...updates } : prev));
    scheduleSave(updates);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const del = useMutation({
    mutationFn: () => api.del<void>(`/api/worlds/${worldId}/stories/${storyId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stories", worldId] });
      router.push(`/worlds/${worldId}`);
    },
  });

  // ── Send message ──────────────────────────────────────────────────────────
  const [sending, setSending] = useState(false);

  async function sendMessage(text: string) {
    if (!localStory) return;

    const userMsg: ConversationMessage = { id: nanoid(), role: "user", content: text };
    const loadingMsg: ConversationMessage = {
      id: nanoid(),
      role: "system",
      content: "",
      loading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setSelectedChips(new Set());
    setSending(true);

    try {
      const body: DevelopRequest = {
        message: text,
        phase,
        currentState: {
          characterIds: localStory.characterIds ?? [],
          locationIds: localStory.locationIds ?? [],
          lengthSeconds: localStory.lengthSeconds,
          description: localStory.description,
          lyrics: localStory.lyrics ?? "",
        },
      };

      const res = await api.post<DevelopResponse>(
        `/api/worlds/${worldId}/stories/${storyId}/develop`,
        body,
      );

      // Apply story updates
      if (res.storyUpdates) {
        const updates: Partial<StoryDto> = {};
        if (res.storyUpdates.description !== undefined)
          updates.description = res.storyUpdates.description;
        if (res.storyUpdates.characterIds !== undefined)
          updates.characterIds = res.storyUpdates.characterIds;
        if (res.storyUpdates.locationIds !== undefined)
          updates.locationIds = res.storyUpdates.locationIds;
        if (res.storyUpdates.lengthSeconds !== undefined)
          updates.lengthSeconds = res.storyUpdates.lengthSeconds;
        if (res.lyrics !== undefined) updates.lyrics = res.lyrics;
        updateLocalStory(updates);
      } else if (res.lyrics !== undefined) {
        updateLocalStory({ lyrics: res.lyrics });
      }

      // Update phase
      setPhase(res.nextPhase);

      // Replace loading message with reply
      const replyMsg: ConversationMessage = {
        id: nanoid(),
        role: "system",
        content: res.reply,
        chips: res.chips,
        multiSelect: res.multiSelect,
      };
      setMessages((prev) => [...prev.slice(0, -1), replyMsg]);
    } catch (err) {
      const errorMsg: ConversationMessage = {
        id: nanoid(),
        role: "system",
        content: `Something went wrong: ${(err as Error).message}`,
      };
      setMessages((prev) => [...prev.slice(0, -1), errorMsg]);
    } finally {
      setSending(false);
    }
  }

  // Chip click: single-select sends immediately; multi-select toggles selection
  function handleChipClick(chip: ChipSuggestion, msg: ConversationMessage) {
    if (msg.multiSelect) {
      setSelectedChips((prev) => {
        const next = new Set(prev);
        if (next.has(chip.id)) next.delete(chip.id);
        else next.add(chip.id);
        return next;
      });
    } else {
      sendMessage(chip.label);
    }
  }

  // Send multi-selected chips as a combined message
  function sendSelectedChips() {
    if (selectedChips.size === 0) return;
    const chars = charsQ.data ?? [];
    const locs = locsQ.data ?? [];
    const allItems = [...chars.map((c) => ({ id: c.id, label: c.name })), ...locs.map((l) => ({ id: l.id, label: l.name }))];
    const labels = [...selectedChips]
      .map((id) => allItems.find((i) => i.id === id)?.label ?? id)
      .join(", ");

    // Patch character/location IDs directly if they look like UUIDs
    const uuidRe = /^[0-9a-f-]{36}$/i;
    const selectedCharIds = [...selectedChips].filter(
      (id) => uuidRe.test(id) && chars.some((c) => c.id === id),
    );
    const selectedLocIds = [...selectedChips].filter(
      (id) => uuidRe.test(id) && locs.some((l) => l.id === id),
    );
    if (selectedCharIds.length > 0 || selectedLocIds.length > 0) {
      updateLocalStory({
        characterIds: selectedCharIds,
        locationIds: selectedLocIds,
      });
    }

    sendMessage(labels);
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (!localStory || !charsQ.data || !locsQ.data) {
    return <p className="text-[var(--color-muted)]">Loading…</p>;
  }

  const story = localStory;
  const characters = charsQ.data;
  const locations = locsQ.data;

  const inputPlaceholder =
    phase === "foundation"
      ? "Describe the story, or answer the question above…"
      : phase === "lyrics"
      ? "Pick a length from the chips, or type e.g. ‘60 seconds’…"
      : "Tell me what to change, or say “looks good”…";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link
          href={`/worlds/${worldId}`}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to world
        </Link>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h1 className="font-mono text-2xl uppercase tracking-widest">{story.name}</h1>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm("Delete this story? This cannot be undone.")) del.mutate();
            }}
            disabled={del.isPending}
            size="sm"
            className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-danger)] font-mono uppercase tracking-wider cursor-pointer"
          >
            <Trash2 className="h-3 w-3 mr-1.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Split pane */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Left — Conversation */}
        <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)]/70 bg-[var(--color-surface)]/45 p-3 h-[calc(100vh-8rem)] min-h-[35rem]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
              Story Workshop
            </span>
            <PhaseIndicator phase={phase} />
          </div>

          {/* Thread — flex-1 with min-h-0 so it can shrink and scroll */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ConversationThread
              messages={messages}
              onChipClick={handleChipClick}
              selectedChips={selectedChips}
            />
          </div>

          {/* Multi-select confirm */}
          {selectedChips.size > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={sendSelectedChips}
              className="w-full text-xs font-mono uppercase tracking-wider cursor-pointer"
            >
              Confirm selection ({selectedChips.size})
            </Button>
          )}

          <ChatInput
            onSend={sendMessage}
            disabled={sending}
            placeholder={inputPlaceholder}
          />
        </div>

        {/* Right — Artifact */}
        <ArtifactPanel
          worldId={worldId}
          storyId={storyId}
          story={{
            name: story.name,
            description: story.description,
            characterIds: story.characterIds ?? [],
            locationIds: story.locationIds ?? [],
            lengthSeconds: story.lengthSeconds,
            lyrics: story.lyrics ?? "",
          }}
          characters={characters}
          locations={locations}
          versions={versionsQ.data ?? []}
          moodImages={story.moodImages ?? []}
          onStoryUpdate={updateLocalStory}
          saveState={saveState}
        />
      </div>
    </div>
  );
}

function PhaseIndicator({ phase }: { phase: ConversationPhase }) {
  const labels: Record<ConversationPhase, string> = {
    foundation: "Building story",
    lyrics: "Generating lyrics",
    refine: "Refining",
  };
  const colors: Record<ConversationPhase, string> = {
    foundation: "text-[var(--color-muted)]",
    lyrics: "text-[var(--color-accent)]",
    refine: "text-[var(--color-fg)]",
  };
  return (
    <span className={`font-mono text-[9px] uppercase tracking-widest ${colors[phase]}`}>
      {labels[phase]}
    </span>
  );
}
