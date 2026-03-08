"use client";

import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  ChevronsLeft,
  ChevronsRight,
  Keyboard,
  Minus,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ControlsProps {
  step: number;
  totalSteps: number;
  isPlaying: boolean;
  playSpeed: number;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  onGoToEnd: () => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onGoToStep?: (step: number) => void;
}

const SPEEDS = [0.5, 1, 1.5, 2, 3];

export function Controls({
  step,
  totalSteps,
  isPlaying,
  playSpeed,
  onPrev,
  onNext,
  onReset,
  onGoToEnd,
  onTogglePlay,
  onSpeedChange,
  onGoToStep,
}: ControlsProps) {
  const progress = totalSteps > 1 ? ((step) / (totalSteps - 1)) * 100 : 100;
  const speedIdx = SPEEDS.indexOf(playSpeed);

  return (
    <div className="border-t-2 border-card-border bg-card px-5 py-3">
      {/* Progress bar — full width, clickable */}
      <div
        className="group mb-3 h-1.5 w-full cursor-pointer rounded-full bg-card-border transition-all hover:h-2.5"
        onClick={(e) => {
          if (!onGoToStep) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          onGoToStep(Math.round(pct * (totalSteps - 1)));
        }}
      >
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        {/* Left: transport controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={onReset}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-card-border/60 hover:text-foreground disabled:opacity-25"
            disabled={step === 0}
            title="Go to first step"
          >
            <ChevronsLeft size={18} />
          </button>
          <button
            onClick={onPrev}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-card-border/60 hover:text-foreground disabled:opacity-25"
            disabled={step === 0}
            title="Previous step (←)"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={onTogglePlay}
            className={cn(
              "rounded-xl p-3 transition-all",
              isPlaying
                ? "bg-warning/15 text-warning hover:bg-warning/25"
                : "bg-accent/15 text-accent hover:bg-accent/25"
            )}
            title={isPlaying ? "Pause" : "Auto-play"}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            onClick={onNext}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-card-border/60 hover:text-foreground disabled:opacity-25"
            disabled={step === totalSteps - 1}
            title="Next step (→ or Space)"
          >
            <ChevronRight size={20} />
          </button>
          <button
            onClick={onGoToEnd}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-card-border/60 hover:text-foreground disabled:opacity-25"
            disabled={step === totalSteps - 1}
            title="Go to last step"
          >
            <ChevronsRight size={18} />
          </button>
        </div>

        {/* Center: step counter */}
        <div className="flex items-center gap-4">
          <span className="text-sm tabular-nums text-muted-foreground">
            <span className="font-bold text-foreground">{step + 1}</span>
            <span className="text-muted/40"> / {totalSteps}</span>
          </span>
        </div>

        {/* Right: speed control + keyboard hint */}
        <div className="flex items-center gap-4">
          {/* Speed control */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => speedIdx > 0 && onSpeedChange(SPEEDS[speedIdx - 1])}
              disabled={speedIdx <= 0}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-card-border/60 hover:text-foreground disabled:opacity-25"
              title="Slower"
            >
              <Minus size={13} />
            </button>
            <span className="min-w-[40px] text-center text-xs tabular-nums text-muted-foreground">
              {playSpeed}x
            </span>
            <button
              onClick={() => speedIdx < SPEEDS.length - 1 && onSpeedChange(SPEEDS[speedIdx + 1])}
              disabled={speedIdx >= SPEEDS.length - 1}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-card-border/60 hover:text-foreground disabled:opacity-25"
              title="Faster"
            >
              <Plus size={13} />
            </button>
          </div>

          <div className="hidden items-center gap-1.5 text-[11px] text-muted/30 sm:flex">
            <Keyboard size={13} />
            <span>← → Space R</span>
          </div>
        </div>
      </div>
    </div>
  );
}
