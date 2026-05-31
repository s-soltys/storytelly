"use client";

import { useState, useEffect } from "react";
import { type SongClipDto } from "@/lib/api";
import { Loader2, Trash2, Image as ImageIcon, Video, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ClipCardProps {
  clip: SongClipDto;
  genState: { type: "image" | "video"; status: "pending" | "success" | "error"; error?: string } | undefined;
  onUpdateDescription: (clipId: string, description: string) => void;
  onDelete: (clipId: string) => void;
  onGenerateImage: (clipId: string) => void;
  onGenerateVideo: (clipId: string) => void;
  onMediaError: () => void;
}

export function ClipCard({
  clip,
  genState,
  onUpdateDescription,
  onDelete,
  onGenerateImage,
  onGenerateVideo,
  onMediaError,
}: ClipCardProps) {
  const clipImage = clip.images?.[0];
  const clipVideo = clip.videos?.[0];

  const isGeneratingImg = genState?.type === "image" && genState.status === "pending";
  const isGeneratingVid = genState?.type === "video" && genState.status === "pending";
  const hasError = genState?.status === "error";
  const errorMsg = genState?.error;

  const [description, setDescription] = useState(clip.description);

  useEffect(() => {
    setDescription(clip.description);
  }, [clip.description]);

  return (
    <div className="group flex flex-col gap-2 rounded-lg bg-[var(--color-surface)]/40 p-2.5 text-[10px] border border-[var(--color-border)]/20 hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-surface-2)]/10 transition-all duration-300">
      <div className="flex items-start justify-between gap-2">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (description !== clip.description) {
              onUpdateDescription(clip.id, description);
            }
          }}
          placeholder="Clip description..."
          className="flex-1 bg-transparent leading-relaxed text-[var(--color-muted)] focus:text-[var(--color-fg)] focus:outline-none resize-none min-h-[40px] transition-colors"
          rows={2}
          aria-label="Clip description"
        />
        <button
          type="button"
          onClick={() => onDelete(clip.id)}
          className="opacity-0 group-hover:opacity-100 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-all p-1"
          title="Delete clip"
          aria-label="Delete clip"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded bg-black/50 shadow-sm border border-[var(--color-border)]/25">
        {/* Render Media */}
        {clipVideo ? (
          <video
            src={clipVideo.url}
            controls
            preload="none"
            className="absolute inset-0 h-full w-full object-cover"
            onError={onMediaError}
          />
        ) : clipImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clipImage.url}
            alt="Clip scene"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105 duration-700"
            onError={onMediaError}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
            <ImageIcon className="h-5 w-5 text-[var(--color-muted)]/50 mb-1" />
            <p className="text-[9px] text-[var(--color-muted)]/70">No image generated yet</p>
          </div>
        )}

        {/* Hover Controls for existing media (only when not loading/error) */}
        {!isGeneratingImg && !isGeneratingVid && !hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {clipImage && (
              <Button
                size="sm"
                className="h-7 px-2.5 font-mono text-[9px] uppercase tracking-wider bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/80 text-[var(--color-accent-fg)]"
                onClick={() => onGenerateVideo(clip.id)}
                aria-label={clipVideo ? "Regenerate video" : "Generate video"}
              >
                <Video className="h-3 w-3 mr-1" />
                {clipVideo ? "Regen Video" : "Generate Video"}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-2.5 font-mono text-[9px] uppercase tracking-wider bg-black/50 hover:bg-black/80 border border-white/10"
              onClick={() => onGenerateImage(clip.id)}
              aria-label={clipImage ? "Regenerate image" : "Generate image"}
            >
              <ImageIcon className="h-3 w-3 mr-1" />
              {clipImage ? "Regen Image" : "Generate Image"}
            </Button>
          </div>
        )}

        {/* Generate Image Initial Button (when no media exists and not loading) */}
        {!clipImage && !isGeneratingImg && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 p-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-full text-[9px] font-mono uppercase tracking-wider bg-[var(--color-surface)]/80 hover:bg-[var(--color-surface)] border border-[var(--color-border)]/40 text-[var(--color-fg)]"
              onClick={() => onGenerateImage(clip.id)}
              aria-label="Generate image"
            >
              <ImageIcon className="h-3 w-3 mr-1.5" />
              Generate Image
            </Button>
          </div>
        )}

        {/* Loading Overlay */}
        {(isGeneratingImg || isGeneratingVid) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/80 backdrop-blur-[2px] animate-in fade-in duration-300">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-accent)]" />
            <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-fg)]">
              {isGeneratingImg ? "Generating Image..." : "Generating Video..."}
            </p>
          </div>
        )}

        {/* Error Overlay */}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 bg-black/85 backdrop-blur-[1px] animate-in fade-in duration-300">
            <AlertCircle className="h-4.5 w-4.5 text-[var(--color-danger)] mb-1" />
            <p className="text-[9px] text-[var(--color-danger)] font-medium text-center line-clamp-2 px-1 mb-1.5 leading-snug">
              {errorMsg || "Generation failed"}
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="h-6 px-2 text-[8px] font-mono uppercase tracking-widest bg-white/10 hover:bg-white/20 border-transparent text-white"
              onClick={() => {
                if (genState?.type === "image") {
                  onGenerateImage(clip.id);
                } else {
                  onGenerateVideo(clip.id);
                }
              }}
              aria-label="Retry generation"
            >
              <RefreshCw className="h-2 w-2 mr-1" />
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
