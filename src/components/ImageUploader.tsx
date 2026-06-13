"use client";

import { useRef, useState } from "react";
import { api, type ImageDto } from "@/lib/api";
import type { ImageOwnerKind } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Trash2, Upload } from "lucide-react";

type Props = {
  ownerKind: ImageOwnerKind;
  ownerId: string;
  images?: ImageDto[];
  onChange?: (images: ImageDto[]) => void;
  compact?: boolean;
};

export function ImageUploader({
  ownerKind,
  ownerId,
  images = [],
  onChange,
  compact = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const items = images;

  async function uploadFiles(files: File[]) {
    const MAX_SIZE = 15 * 1024 * 1024;
    const valid: File[] = [];
    for (const file of files) {
      if (file.size > MAX_SIZE) {
        console.warn(`File ${file.name} exceeds 15MB limit`);
        continue;
      }
      if (!file.type.startsWith("image/")) {
        console.warn(`File ${file.name} is not an image`);
        continue;
      }
      valid.push(file);
    }
    if (valid.length === 0) return;

    setError(null);
    setBusy(true);
    const names = valid.map((f) => f.name);
    setUploadingFiles((prev) => new Set([...prev, ...names]));
    try {
      const uploaded: ImageDto[] = await Promise.all(
        valid.map(async (file) => {
          const presign = await api.post<{ uploadUrl: string; image: ImageDto }>(
            "/api/uploads/presign",
            {
              ownerKind,
              ownerId,
              fileType: file.type,
              fileSize: file.size,
            },
          );
          const res = await fetch(presign.uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": file.type,
            },
            body: file,
          });
          if (!res.ok) {
            throw new Error(`S3 upload failed for ${file.name}`);
          }
          return presign.image;
        }),
      );
      onChange?.([...items, ...uploaded]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setUploadingFiles((prev) => {
        const next = new Set(prev);
        names.forEach((n) => next.delete(n));
        return next;
      });
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    await uploadFiles(Array.from(files));
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api.del(`/api/uploads?id=${id}`);
      onChange?.(items.filter((i) => i.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadFiles(files);
    }
  };

  return (
    <div
      className={cn("space-y-3 relative", compact && "space-y-2")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3",
          compact && "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2",
        )}
      >
        {items.map((img) => (
          <div
            key={img.id}
            className={cn(
              "group relative aspect-square overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-2)]",
              compact && "rounded-md",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => remove(img.id)}
              className={cn(
                "absolute top-1 right-1 rounded bg-black/70 p-1.5 opacity-0 group-hover:opacity-100 transition cursor-pointer hover:bg-[var(--color-danger)]",
                compact && "p-1",
              )}
              aria-label="Delete image"
            >
              <Trash2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            "aspect-square flex flex-col items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-[var(--color-border)] hover:border-[var(--color-accent)] text-[var(--color-muted)] hover:text-[var(--color-accent)] transition cursor-pointer disabled:opacity-50",
            compact && "gap-1 rounded-md",
          )}
        >
          <Upload className={compact ? "h-4 w-4" : "h-5 w-5"} />
          <span
            className={cn(
              "text-xs uppercase tracking-wider font-mono",
              compact && "text-[10px]",
            )}
          >
            {busy ? `Uploading ${uploadingFiles.size}…` : "Add"}
          </span>
        </button>
      </div>
      {uploadingFiles.size > 0 && (
        <div className="space-y-1">
          {Array.from(uploadingFiles).map((name) => (
            <div
              key={name}
              className="flex items-center gap-2 text-xs text-[var(--color-muted)]"
            >
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              {name}
            </div>
          ))}
        </div>
      )}
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
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent)]/10">
          <p className="text-sm font-mono uppercase tracking-widest text-[var(--color-accent)]">
            Drop images here
          </p>
        </div>
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
