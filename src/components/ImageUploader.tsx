"use client";

import { useRef, useState } from "react";
import { api, type ImageDto } from "@/lib/api";
import type { ImageOwnerKind } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Trash2, Upload } from "lucide-react";

type Props = {
  ownerKind: ImageOwnerKind;
  ownerId: string;
  initial?: ImageDto[];
  onChange?: (images: ImageDto[]) => void;
};

export function ImageUploader({ ownerKind, ownerId, initial = [], onChange }: Props) {
  const [items, setItems] = useState<ImageDto[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function update(next: ImageDto[]) {
    setItems(next);
    onChange?.(next);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("ownerKind", ownerKind);
      form.append("ownerId", ownerId);
      for (const file of Array.from(files)) form.append("files", file);
      const created = await api.upload<ImageDto[]>("/api/uploads", form);
      update([...items, ...created]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api.del(`/api/uploads?id=${id}`);
      update(items.filter((i) => i.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {items.map((img) => (
          <div
            key={img.id}
            className="group relative aspect-square overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-2)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt=""
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => remove(img.id)}
              className="absolute top-1 right-1 rounded bg-black/70 p-1.5 opacity-0 group-hover:opacity-100 transition cursor-pointer hover:bg-[var(--color-danger)]"
              aria-label="Delete image"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="aspect-square flex flex-col items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-[var(--color-border)] hover:border-[var(--color-accent)] text-[var(--color-muted)] hover:text-[var(--color-accent)] transition cursor-pointer disabled:opacity-50"
        >
          <Upload className="h-5 w-5" />
          <span className="text-xs uppercase tracking-wider font-mono">
            {busy ? "Uploading…" : "Add"}
          </span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && (
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
      )}
    </div>
  );
}

export function ImageUploaderActions({
  onAdd,
  busy,
}: {
  onAdd: (files: FileList) => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => ref.current?.click()}
      >
        <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Add images"}
      </Button>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && onAdd(e.target.files)}
      />
    </>
  );
}
