"use client";

import { MemoryItem } from "@/types/memory";
import { cn } from "@/lib/utils";

interface MemoryBlockProps {
  item: MemoryItem;
  depth?: number;
}

export function MemoryBlock({ item, depth = 0 }: MemoryBlockProps) {
  const isStruct = !!item.children;
  const isOrphaned = item.orphaned;
  const isPointer = item.pointsTo !== undefined;
  const isChanged = item.changed;

  if (isStruct) {
    return (
      <div
        data-cell-id={item.id}
        data-changed={isChanged || undefined}
        className={cn(
          "rounded-xl border-2 transition-all duration-300",
          isOrphaned
            ? "border-dashed border-danger/40 bg-danger-dim/30"
            : depth === 0
              ? "border-card-border bg-card"
              : "border-card-border/40 bg-card/40",
          isChanged && "ring-2 ring-success/50"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 border-b px-4 py-2 text-sm font-bold",
            isOrphaned
              ? "border-danger/20 text-danger/80"
              : depth === 0
                ? "border-card-border/60 text-foreground"
                : "border-card-border/30 text-muted-foreground"
          )}
        >
          <span>{item.label}</span>
          {item.address && (
            <span className="ml-auto font-mono text-[10px] font-normal text-muted/30">
              {item.address}
            </span>
          )}
          {isOrphaned && (
            <span className="rounded-full bg-danger/20 px-2.5 py-0.5 text-[10px] font-semibold text-danger">
              LEAKED
            </span>
          )}
        </div>
        <div className="flex flex-col gap-0.5 p-2">
          {item.children!.map((child) => (
            <MemoryBlock key={child.id} item={child} depth={depth + 1} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      data-cell-id={item.id}
      data-changed={isChanged || undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-4 py-1.5 text-sm transition-all duration-300",
        isChanged && "cell-changed",
        isOrphaned && "opacity-40"
      )}
    >
      <span className="min-w-0 shrink-0 font-medium text-muted-foreground">
        {item.label}
        {item.address && (
          <span className="ml-1.5 font-mono text-[10px] text-muted/25">
            {item.address}
          </span>
        )}
      </span>
      <span className="text-muted/30">=</span>
      <span className="shrink-0 font-bold">
        {isPointer ? (
          <span data-arrow-src={item.id} className="inline-flex items-center gap-1 text-accent">
            <svg width="28" height="12" viewBox="0 0 28 12" className="shrink-0">
              <circle cx="4" cy="6" r="3.5" fill="currentColor" opacity={0.85} />
              <line x1="7.5" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <polygon points="27,6 20,2 20,10" fill="currentColor" />
            </svg>
          </span>
        ) : item.value === "nullptr" ? (
          <span className="rounded-md bg-danger/15 px-2 py-0.5 text-xs font-bold text-danger">
            null
          </span>
        ) : item.value === "?" ? (
          <span className="text-lg text-muted/30">?</span>
        ) : (
          <span className="text-base text-success">{item.value}</span>
        )}
      </span>
    </div>
  );
}
