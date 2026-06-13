type SaveState = "idle" | "saving" | "saved" | "error" | "invalid";

export function SaveHint({ state }: { state: SaveState }) {
  if (state === "idle") return null;

  const text = {
    saving: "Saving…",
    saved: "Saved.",
    error: "Could not save. Keep editing or try again.",
    invalid: "Required fields cannot be empty.",
  }[state];

  return (
    <p
      className={
        state === "error" || state === "invalid"
          ? "text-xs text-[var(--color-danger)]"
          : "text-xs text-[var(--color-muted)]"
      }
    >
      {text}
    </p>
  );
}
