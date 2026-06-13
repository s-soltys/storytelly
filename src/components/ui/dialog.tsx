"use client";

import { type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  loading?: boolean;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 animate-dialog-overlay" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-lg animate-dialog-content">
          <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>
          <Dialog.Title className="font-mono uppercase tracking-widest text-sm mb-2">
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-[var(--color-fg)]/70 mb-6">
            {description}
          </Dialog.Description>
          <div className="flex justify-end gap-3">
            <Dialog.Close asChild>
              <button
                className="h-9 rounded-md border border-[var(--color-border)] bg-transparent px-4 text-sm hover:bg-[var(--color-surface)]/80 disabled:opacity-50"
                disabled={loading}
              >
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              className={cn(
                "h-9 rounded-md px-4 text-sm font-medium disabled:opacity-50",
                variant === "danger"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-[var(--color-accent)] text-white hover:opacity-90",
              )}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? "Processing..." : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
