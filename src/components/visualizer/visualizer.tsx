"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Trace, StackFrame } from "@/types/memory";
import type { MemoryItem } from "@/types/memory";
import { CodePanel } from "./code-panel";
import { MemoryBlock } from "./memory-block";
import { ArrowOverlay, collectPointers } from "./arrow-overlay";
import { Controls } from "./controls";
import { ThemeToggle } from "@/components/theme-toggle";

interface VisualizerProps {
  trace: Trace;
  onBack?: () => void;
}

function StackPanel({ frames }: { frames: StackFrame[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        Stack
      </h3>
      {frames.length === 0 ? (
        <p className="text-sm italic text-muted/50">empty</p>
      ) : (
        [...frames].reverse().map((frame, idx) => {
          const isTopFrame = idx === 0;
          const depth = frames.length - 1 - idx;
          return (
            <div
              key={`${frame.name}-${idx}`}
              data-active-frame={isTopFrame || undefined}
              className={`rounded-xl border-2 transition-all duration-300 ${
                isTopFrame
                  ? "border-accent/40 bg-card shadow-lg shadow-accent/5"
                  : "border-card-border/50 bg-card/60 opacity-70"
              }`}
            >
              <div className={`flex items-center gap-2 border-b px-4 py-2.5 ${
                isTopFrame
                  ? "border-accent/20 text-accent"
                  : "border-card-border/30 text-muted-foreground"
              }`}>
                <span className="text-sm font-bold">{frame.name}()</span>
                {depth > 0 && (
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">
                    depth {depth}
                  </span>
                )}
                {isTopFrame && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                    active
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1 p-2.5">
                {frame.variables.length === 0 ? (
                  <p className="px-3 py-1 text-sm italic text-muted/40">
                    no variables
                  </p>
                ) : (
                  frame.variables.map((v) => (
                    <MemoryBlock key={v.id} item={v} depth={1} />
                  ))
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function HeapPanel({ items }: { items: MemoryItem[] }) {
  const normal = items.filter((i) => !i.orphaned);
  const orphaned = items.filter((i) => i.orphaned);

  const arrayItems = normal.filter((i) => i.label.match(/\[\d+\]$/));
  const standaloneItems = normal.filter((i) => !i.label.match(/\[\d+\]$/));

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        Heap
      </h3>
      {items.length === 0 ? (
        <p className="text-sm italic text-muted/50">empty</p>
      ) : (
        <>
          {arrayItems.length > 0 && (
            <div className="flex flex-wrap items-start gap-3">
              {arrayItems.map((item) => (
                <div key={item.id} className="w-[240px] shrink-0">
                  <MemoryBlock item={item} depth={0} />
                </div>
              ))}
            </div>
          )}
          {standaloneItems.length > 0 && (
            <div className="flex flex-wrap items-start gap-3">
              {standaloneItems.map((item) => (
                <div key={item.id} className="w-[240px] shrink-0">
                  <MemoryBlock item={item} depth={0} />
                </div>
              ))}
            </div>
          )}
          {orphaned.length > 0 && (
            <div className="mt-2 animate-[fade-in_0.3s_ease-out] border-t-2 border-dashed border-danger/30 pt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-danger/60">
                Orphaned / Leaked Memory
              </p>
              <div className="flex flex-wrap items-start gap-3">
                {orphaned.map((item) => (
                  <div key={item.id} className="w-[240px] shrink-0">
                    <MemoryBlock item={item} depth={0} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Visualizer({ trace, onBack }: VisualizerProps) {
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const memoryRef = useRef<HTMLDivElement>(null);
  const memoryScrollRef = useRef<HTMLDivElement>(null);
  const isPlayingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStep = trace.steps[step];
  const pointers = collectPointers(currentStep.stack, currentStep.heap);

  // Auto-scroll the memory panel to show changed items or the active frame
  useEffect(() => {
    const container = memoryScrollRef.current;
    if (!container) return;

    // Small delay to let DOM update first
    const timer = setTimeout(() => {
      // Priority 1: scroll to the first changed item
      const changedEl = container.querySelector("[data-changed]") as HTMLElement | null;
      if (changedEl) {
        changedEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        return;
      }

      // Priority 2: scroll to the active stack frame
      const activeFrame = container.querySelector("[data-active-frame]") as HTMLElement | null;
      if (activeFrame) {
        activeFrame.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [step]);

  const goNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, trace.steps.length - 1));
  }, [trace.steps.length]);

  const goPrev = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const goReset = useCallback(() => {
    setStep(0);
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, []);

  const goToEnd = useCallback(() => {
    setStep(trace.steps.length - 1);
  }, [trace.steps.length]);

  const goToStep = useCallback((s: number) => {
    setStep(Math.max(0, Math.min(s, trace.steps.length - 1)));
  }, [trace.steps.length]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => {
      isPlayingRef.current = !p;
      return !p;
    });
  }, []);

  useEffect(() => {
    if (isPlaying) {
      const interval = Math.round(1500 / playSpeed);
      intervalRef.current = setInterval(() => {
        if (!isPlayingRef.current) return;
        setStep((s) => {
          if (s >= trace.steps.length - 1) {
            setIsPlaying(false);
            isPlayingRef.current = false;
            return s;
          }
          return s + 1;
        });
      }, interval);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, playSpeed, trace.steps.length]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        goNext();
      } else if (mod && e.key === "z") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "r") {
        goReset();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, goReset]);

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b-2 border-card-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="mr-1 flex items-center gap-1.5 rounded-lg border border-card-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Editor
            </button>
          )}
          <div className="hidden h-px w-4 bg-card-border sm:block" />
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-[10px] font-bold text-accent">
            C++
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold">{trace.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-muted/40 lg:inline">
            C++ Memory Visualizer
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Code panel */}
        <div className="max-h-[30vh] shrink-0 overflow-y-auto border-b-2 border-card-border lg:max-h-none lg:w-[400px] lg:border-b-0 lg:border-r-2">
          <CodePanel
            structs={trace.structs}
            functions={trace.functions}
            activeFunction={currentStep.activeFunction}
            activeLine={currentStep.line}
            callerLine={currentStep.callerLine}
            step={step}
          />
        </div>

        {/* Memory panel */}
        <div ref={memoryScrollRef} className="min-h-0 flex-1 overflow-auto bg-background">
          <div
            ref={memoryRef}
            className="relative flex min-h-full gap-8 p-6"
          >
            <div className="w-[260px] shrink-0">
              <StackPanel frames={currentStep.stack} />
            </div>
            <div className="min-w-0 flex-1">
              <HeapPanel items={currentStep.heap} />
            </div>
            <ArrowOverlay
              pointers={pointers}
              containerRef={memoryRef}
              step={step}
            />
          </div>
        </div>
      </div>

      {/* Explanation bar */}
      <div className="border-t-2 border-accent/20 bg-accent/4 px-5 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-bold tabular-nums text-accent">
            Step {step + 1}/{trace.steps.length}
          </span>
          <p className="min-w-0 text-sm font-medium leading-relaxed text-foreground">
            {currentStep.explanation}
          </p>
        </div>
      </div>

      {/* Controls */}
      <Controls
        step={step}
        totalSteps={trace.steps.length}
        isPlaying={isPlaying}
        playSpeed={playSpeed}
        onPrev={goPrev}
        onNext={goNext}
        onReset={goReset}
        onGoToEnd={goToEnd}
        onTogglePlay={togglePlay}
        onSpeedChange={setPlaySpeed}
        onGoToStep={goToStep}
      />
    </div>
  );
}
