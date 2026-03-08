"use client";

import { useEffect, useState, useCallback } from "react";

interface Pointer {
  sourceId: string;
  targetId: string;
  color: string;
  label: string;
  fromStack: boolean;
}

interface Arrow {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  linePath: string;
  headPath: string;
  color: string;
  label: string;
  showLabel: boolean;
}

const COLORS = [
  "#3b82f6", "#f97316", "#22c55e", "#a855f7",
  "#06b6d4", "#ec4899", "#eab308", "#ef4444",
  "#10b981", "#8b5cf6", "#f43f5e", "#14b8a6",
];

function hashColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export function collectPointers(
  stack: { variables: { id: string; label?: string; pointsTo?: string; children?: unknown[] }[] }[],
  heap: { id: string; label?: string; pointsTo?: string; children?: unknown[] }[]
): Pointer[] {
  const pointers: Pointer[] = [];

  function extractLabel(item: { label?: string; id: string }): string {
    if (item.label) {
      const parts = item.label.split(" ");
      return parts[parts.length - 1] || item.id;
    }
    return item.id;
  }

  function traverse(items: { id: string; label?: string; pointsTo?: string; children?: unknown[] }[], fromStack: boolean) {
    for (const item of items) {
      if (item.pointsTo) {
        const label = extractLabel(item);
        pointers.push({ sourceId: item.id, targetId: item.pointsTo, color: hashColor(label), label, fromStack });
      }
      if ("children" in item && Array.isArray(item.children)) {
        traverse(item.children as typeof items, fromStack);
      }
    }
  }

  for (const frame of stack) traverse(frame.variables as any, true);
  traverse(heap as any, false);
  return pointers;
}

function bezierEndAngle(
  _p0x: number, _p0y: number,
  _p1x: number, _p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number,
): number {
  const dx = p3x - p2x;
  const dy = p3y - p2y;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return Math.atan2(p3y - _p1y, p3x - _p1x);
  }
  return Math.atan2(dy, dx);
}

// Pull back the line endpoint by `dist` pixels along the approach angle
function pullBack(x: number, y: number, angle: number, dist: number): [number, number] {
  return [x - dist * Math.cos(angle), y - dist * Math.sin(angle)];
}

function buildArrowhead(tx: number, ty: number, angle: number, size: number): string {
  const spread = Math.PI / 5.5; // ~33 degree spread for a solid arrowhead
  const x1 = tx - size * Math.cos(angle - spread);
  const y1 = ty - size * Math.sin(angle - spread);
  const x2 = tx - size * Math.cos(angle + spread);
  const y2 = ty - size * Math.sin(angle + spread);
  return `M ${tx} ${ty} L ${x1} ${y1} L ${x2} ${y2} Z`;
}

interface ArrowOverlayProps {
  pointers: Pointer[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  step: number;
}

export function ArrowOverlay({ pointers, containerRef, step }: ArrowOverlayProps) {
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  const computeArrows = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const cRect = container.getBoundingClientRect();
    const sL = container.scrollLeft;
    const sT = container.scrollTop;
    const result: Arrow[] = [];
    const targetYOffsets: Record<string, number> = {};
    const HEAD = 12;

    for (const { sourceId, targetId, color, label, fromStack } of pointers) {
      const srcEl = container.querySelector(`[data-cell-id="${sourceId}"]`) as HTMLElement | null;
      const tgtEl = container.querySelector(`[data-cell-id="${targetId}"]`) as HTMLElement | null;
      if (!srcEl || !tgtEl) continue;

      const sr = srcEl.getBoundingClientRect();
      const tr = tgtEl.getBoundingClientRect();

      const sx = sr.right - cRect.left + sL + 3;
      const sy = sr.top + sr.height / 2 - cRect.top + sT;

      const yOff = (targetYOffsets[targetId] || 0) * 10;
      targetYOffsets[targetId] = (targetYOffsets[targetId] || 0) + 1;

      const tx = tr.left - cRect.left + sL - 2;
      const ty = tr.top + tr.height / 2 - cRect.top + sT + yOff;

      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const absDy = Math.abs(dy);
      const absDx = Math.abs(dx);

      let headAngle: number;
      let linePath: string;

      if (dist < 40) {
        // Self-reference loop
        const loopR = 55;
        const cp1x = sx + loopR, cp1y = sy - loopR;
        const cp2x = tx + loopR, cp2y = ty - loopR;
        headAngle = bezierEndAngle(sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty);
        const [lx, ly] = pullBack(tx, ty, headAngle, HEAD * 0.7);
        linePath = `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${lx} ${ly}`;
      } else if (dx > 0 && absDy < absDx * 0.7) {
        // Forward and relatively flat — straight line (covers adjacent nodes)
        headAngle = Math.atan2(dy, dx);
        const [lx, ly] = pullBack(tx, ty, headAngle, HEAD * 0.7);
        linePath = `M ${sx} ${sy} L ${lx} ${ly}`;
      } else if (dx > 0) {
        // Forward but steep — gentle curve
        const curve = Math.min(absDy * 0.25, 40);
        const cp1x = sx + dx * 0.5, cp1y = sy + (dy > 0 ? -curve : curve);
        const cp2x = tx - dx * 0.3, cp2y = ty + (dy > 0 ? curve : -curve);
        headAngle = bezierEndAngle(sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty);
        const [lx, ly] = pullBack(tx, ty, headAngle, HEAD * 0.7);
        linePath = `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${lx} ${ly}`;
      } else if (dx < -30) {
        // Backwards arrow — must curve to avoid crossing over content
        const bump = Math.max(70, absDy * 0.35 + 35);
        if (absDy < 60) {
          const topY = Math.min(sy, ty) - bump;
          const cp1x = sx + 50, cp1y = topY;
          const cp2x = tx - 50, cp2y = topY;
          headAngle = bezierEndAngle(sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty);
          const [lx, ly] = pullBack(tx, ty, headAngle, HEAD * 0.7);
          linePath = `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${lx} ${ly}`;
        } else {
          headAngle = Math.atan2(dy, dx);
          const [lx, ly] = pullBack(tx, ty, headAngle, HEAD * 0.7);
          linePath = `M ${sx} ${sy} L ${lx} ${ly}`;
        }
      } else {
        // Nearly vertical — straight line
        headAngle = Math.atan2(dy, dx);
        const [lx, ly] = pullBack(tx, ty, headAngle, HEAD * 0.7);
        linePath = `M ${sx} ${sy} L ${lx} ${ly}`;
      }

      const headPath = buildArrowhead(tx, ty, headAngle, HEAD);
      result.push({ sx, sy, tx, ty, linePath, headPath, color, label, showLabel: !fromStack });
    }

    setArrows(result);
  }, [pointers, containerRef]);

  useEffect(() => {
    const f = requestAnimationFrame(computeArrows);
    return () => cancelAnimationFrame(f);
  }, [computeArrows, step]);

  useEffect(() => {
    const h = () => computeArrows();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [computeArrows]);

  const c = containerRef.current;
  const w = c ? c.scrollWidth : "100%";
  const h = c ? c.scrollHeight : "100%";

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 z-10 overflow-visible"
      width={w}
      height={h}
    >
      <defs>
        <filter id="arrow-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {arrows.map((a, i) => {
        const dimmed = hovered !== null && hovered !== i;
        const active = hovered === i;
        const strokeW = active ? 3 : 2;
        return (
          <g
            key={`${step}-${i}`}
            style={{
              opacity: dimmed ? 0.08 : 1,
              transition: "opacity 0.2s ease, filter 0.2s ease",
              pointerEvents: "auto",
              cursor: "pointer",
              filter: active ? "url(#arrow-glow)" : "none",
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Source dot */}
            <circle cx={a.sx} cy={a.sy} r={active ? 5 : 4} fill={a.color} />

            {/* Line / curve — ends at base of arrowhead */}
            <path
              d={a.linePath}
              fill="none"
              stroke={a.color}
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Arrowhead — filled triangle with tip exactly at target */}
            <path
              d={a.headPath}
              fill={a.color}
              strokeLinejoin="round"
            />

            {/* Label — only for heap pointers where source isn't obvious */}
            {a.showLabel && a.label && (
              <g>
                <rect
                  x={a.sx + 8}
                  y={a.sy - 12}
                  width={a.label.length * 7.5 + 14}
                  height={22}
                  rx={6}
                  fill="var(--background, #09090b)"
                  stroke={a.color}
                  strokeWidth={active ? 1.5 : 1}
                  opacity={0.92}
                />
                <text
                  x={a.sx + 8 + (a.label.length * 7.5 + 14) / 2}
                  y={a.sy + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={a.color}
                  fontFamily="var(--font-mono), monospace"
                >
                  {a.label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
