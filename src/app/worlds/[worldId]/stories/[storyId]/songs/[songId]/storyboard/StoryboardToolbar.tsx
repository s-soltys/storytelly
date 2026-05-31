"use client";

import Link from "next/link";
import { ArrowLeft, Loader2, Check, FileAudio, Wand2, Image as ImageIcon, Video, Download, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type SongSectionDto, type SongClipDto } from "@/lib/api";

interface StoryboardToolbarProps {
  worldId: string;
  storyId: string;
  songId: string;
  subtitles: string;
  sections: SongSectionDto[];
  clips: SongClipDto[];
  isSaving: boolean;
  isTranscribing: boolean;
  isAnalyzing: boolean;
  isGeneratingBulkImages: boolean;
  onTranscribe: () => void;
  onAnalyze: () => void;
  onGenerateBulkImages: () => void;
  onExport: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  exportUrl: string;
}

export function StoryboardToolbar({
  worldId,
  storyId,
  songId,
  subtitles,
  sections,
  clips,
  isSaving,
  isTranscribing,
  isAnalyzing,
  isGeneratingBulkImages,
  onTranscribe,
  onGenerateBulkImages,
  onAnalyze,
  onExport,
  exportUrl,
}: StoryboardToolbarProps) {
  
  // Step calculations
  const hasSubtitles = subtitles.trim().length > 0;
  const hasSections = sections.length > 0;
  const hasClips = clips.length > 0;
  const hasAnyImages = clips.some(c => c.images && c.images.length > 0);
  const allClipsHaveImages = hasClips && clips.every(c => c.images && c.images.length > 0);
  const hasAnyVideos = clips.some(c => c.videos && c.videos.length > 0);
  const allClipsHaveVideos = hasClips && clips.every(c => c.videos && c.videos.length > 0);

  const steps = [
    {
      id: "transcribe",
      label: "Transcribe",
      description: "Get lyrics timestamps",
      icon: FileAudio,
      status: isTranscribing 
        ? "loading" 
        : hasSubtitles 
          ? "completed" 
          : "active",
      action: onTranscribe,
      btnLabel: hasSubtitles ? "Re-transcribe" : "Transcribe",
    },
    {
      id: "analyze",
      label: "Analyze",
      description: "Generate storyboard layout",
      icon: Wand2,
      status: isAnalyzing 
        ? "loading" 
        : hasSections 
          ? "completed" 
          : hasSubtitles 
            ? "active" 
            : "disabled",
      action: onAnalyze,
      btnLabel: hasSections ? "Re-analyze" : "Analyze",
    },
    {
      id: "images",
      label: "Generate Images",
      description: "AI scenes visuals",
      icon: ImageIcon,
      status: isGeneratingBulkImages 
        ? "loading" 
        : allClipsHaveImages 
          ? "completed" 
          : hasSections 
            ? "active" 
            : "disabled",
      action: onGenerateBulkImages,
      btnLabel: allClipsHaveImages ? "Regen Missing" : "Generate Images",
    },
    {
      id: "videos",
      label: "Generate Videos",
      description: "Animate selected clips",
      icon: Video,
      status: allClipsHaveVideos 
        ? "completed" 
        : hasAnyImages 
          ? "active" 
          : "disabled",
      action: null, // Done inline on clip cards
      btnLabel: "Generate Inline",
    },
    {
      id: "export",
      label: "Export ZIP",
      description: "Download package",
      icon: Download,
      status: (hasAnyVideos || hasAnyImages) ? "active" : "disabled",
      action: null, // Handled by <a> tag in render
      btnLabel: "Export ZIP",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Bar Navigation & Saved Status */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href={`/worlds/${worldId}/stories/${storyId}`}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to story
          </Link>
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[var(--color-muted)] bg-[var(--color-surface)]/40 px-2 py-0.5 rounded border border-[var(--color-border)]/20">
            {isSaving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-[var(--color-accent)]" /> 
                <span className="text-[var(--color-accent)]">Saving...</span>
              </>
            ) : (
              <>
                <Check className="h-3 w-3 text-emerald-500" /> 
                <span className="text-emerald-500">Saved</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stepper Wizard Container */}
      <div className="bg-[var(--color-surface)]/25 border border-[var(--color-border)]/35 rounded-xl p-4 shadow-sm">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-muted)]/80 mb-3.5">
          Storyboard Pipeline
        </h2>

        {/* Stepper items row */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-2 items-start relative">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isCompleted = step.status === "completed";
            const isActive = step.status === "active";
            const isLoading = step.status === "loading";
            const isDisabled = step.status === "disabled";

            return (
              <div key={step.id} className="flex flex-col h-full relative">
                {/* Stepper Line connectors on desktop */}
                {idx < steps.length - 1 && (
                  <div className="hidden md:block absolute top-5 left-[calc(50%+20px)] right-[calc(-50%+20px)] h-0.5 bg-[var(--color-border)]/25 z-0">
                    <div 
                      className={`h-full bg-[var(--color-accent)]/50 transition-all duration-500 ${
                        isCompleted ? "w-full" : "w-0"
                      }`}
                    />
                  </div>
                )}

                {/* Step contents */}
                <div className="flex flex-row md:flex-col items-center md:text-center gap-3 md:gap-2 z-10">
                  {/* Circular Badge */}
                  <div
                    className={`flex items-center justify-center h-10 w-10 rounded-full border transition-all duration-300 ${
                      isLoading 
                        ? "border-[var(--color-accent)] bg-[var(--color-surface)] glow-accent/20"
                        : isCompleted
                          ? "border-emerald-500/80 bg-emerald-950/20 text-emerald-500 shadow-sm"
                          : isActive
                            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)] glow-accent/10"
                            : "border-[var(--color-border)]/50 bg-[var(--color-surface)]/60 text-[var(--color-muted)]/50"
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4.5 w-4.5 animate-spin text-[var(--color-accent)]" />
                    ) : isCompleted ? (
                      <Check className="h-4.5 w-4.5 stroke-[2.5]" />
                    ) : (
                      <Icon className="h-4.5 w-4.5" />
                    )}
                  </div>

                  {/* Text details */}
                  <div className="flex-1 md:flex-initial flex flex-col md:items-center">
                    <span 
                      className={`text-[11px] font-semibold tracking-wide ${
                        isDisabled ? "text-[var(--color-muted)]/50" : "text-[var(--color-fg)]"
                      }`}
                    >
                      {step.label}
                    </span>
                    <span className="text-[9px] text-[var(--color-muted)]/70 mt-0.5 hidden md:block">
                      {step.description}
                    </span>
                  </div>

                  {/* Action button */}
                  <div className="shrink-0 md:mt-1.5">
                    {step.id === "export" ? (
                      <Button
                        size="sm"
                        variant={isDisabled ? "secondary" : "primary"}
                        disabled={isDisabled}
                        asChild
                        className={`h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider ${
                          isDisabled 
                            ? "bg-transparent text-[var(--color-muted)]/30 border border-[var(--color-border)]/10" 
                            : "bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/80 text-[var(--color-accent-fg)]"
                        }`}
                      >
                        <a href={exportUrl} onClick={onExport} download>
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </a>
                      </Button>
                    ) : step.action ? (
                      <Button
                        size="sm"
                        variant={isActive ? "primary" : "secondary"}
                        disabled={isDisabled || isLoading}
                        onClick={step.action}
                        className={`h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider ${
                          isActive && !isLoading
                            ? "bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/80 text-[var(--color-accent-fg)]"
                            : "bg-[var(--color-surface-2)]/30 text-[var(--color-muted)]/80 hover:text-[var(--color-fg)] border border-[var(--color-border)]/20"
                        }`}
                      >
                        {isLoading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        {step.btnLabel}
                      </Button>
                    ) : (
                      <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-muted)]/40 px-2 py-0.5 border border-[var(--color-border)]/10 rounded bg-[var(--color-surface)]/20 select-none">
                        {step.btnLabel}
                      </span>
                    )}
                  </div>
                </div>

                {/* Mobile Chevron separator */}
                {idx < steps.length - 1 && (
                  <div className="md:hidden flex justify-center py-1 text-[var(--color-border)]/40">
                    <ChevronRight className="h-4 w-4 rotate-90" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
