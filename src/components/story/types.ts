// Shared types for the conversational story workshop.

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ConversationMessage = {
  id: string;
  role: MessageRole;
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  /** Suggestion chips rendered below a system question */
  chips?: { id: string; label: string }[];
  /** Whether the chips are multi-selectable */
  multiSelect?: boolean;
  /** Whether this message is a loading/thinking placeholder */
  loading?: boolean;
};

export type DevelopRequest = {
  message: string;
};

export type ExecuteToolRequest = {
  toolCallId: string;
  approved: boolean;
};

export type DevelopResponse = {
  /** The AI's conversational reply */
  reply: string;
  /** True if the AI executed any tools (so the client can refresh data) */
  toolsExecuted?: boolean;
  /** Newly generated lyrics, if any */
  lyrics?: string;
};
