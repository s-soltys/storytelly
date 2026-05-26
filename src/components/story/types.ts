// Shared types for the conversational story workshop.

export type ConversationPhase =
  | "foundation" // guided Q&A building story context
  | "lyrics"     // asking for length → generating first lyrics draft
  | "refine";    // open-ended iterative refinement

export type ChipSuggestion = {
  id: string;
  label: string;
};

export type MessageRole = "system" | "user";

export type ConversationMessage = {
  id: string;
  role: MessageRole;
  content: string;
  /** Suggestion chips rendered below a system question */
  chips?: ChipSuggestion[];
  /** Whether the chips are multi-selectable */
  multiSelect?: boolean;
  /** Whether this message is a loading/thinking placeholder */
  loading?: boolean;
};

export type DevelopRequest = {
  message: string;
  phase: ConversationPhase;
  /** Current story state so the server can apply structural updates */
  currentState: {
    characterIds: string[];
    locationIds: string[];
    lengthSeconds: number;
    description: string;
    lyrics: string;
  };
};

export type DevelopResponse = {
  /** The AI's conversational reply */
  reply: string;
  /** Updated lyrics if the phase produced/revised lyrics */
  lyrics?: string;
  /** Story field updates to apply & autosave */
  storyUpdates?: {
    description?: string;
    characterIds?: string[];
    locationIds?: string[];
    lengthSeconds?: number;
  };
  /** The phase the conversation has progressed to */
  nextPhase: ConversationPhase;
  /** Suggestion chips to show with the reply */
  chips?: ChipSuggestion[];
  multiSelect?: boolean;
};
