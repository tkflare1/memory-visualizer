"use client";

import { useEffect, useRef } from "react";
import { CodeFunction } from "@/types/memory";
import { cn } from "@/lib/utils";

interface CodePanelProps {
  structs: string;
  functions: CodeFunction[];
  activeFunction: string;
  activeLine: number;
  callerLine?: number;
  step?: number;
}

const KEYWORDS = new Set([
  "struct", "int", "void", "new", "nullptr", "return", "delete",
  "char", "bool", "double", "float", "long", "short", "unsigned",
  "const", "if", "else", "for", "while", "true", "false",
]);

function highlightCpp(line: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex =
    /(\b\w+\b|->|::|[{}()\[\];,=*&]|\/\/.*$|"[^"]*"|'[^']*'|\d+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("//")) {
      tokens.push(<span key={match.index} className="text-muted/40 italic">{token}</span>);
    } else if (KEYWORDS.has(token)) {
      tokens.push(<span key={match.index} className="text-purple-400">{token}</span>);
    } else if (/^\d+$/.test(token)) {
      tokens.push(<span key={match.index} className="text-amber-400">{token}</span>);
    } else if (token === "->" || token === "::") {
      tokens.push(<span key={match.index} className="text-cyan-400">{token}</span>);
    } else if (/^[{}()\[\];,]$/.test(token)) {
      tokens.push(<span key={match.index} className="text-muted-foreground/50">{token}</span>);
    } else if (token === "*" || token === "&") {
      tokens.push(<span key={match.index} className="text-cyan-400">{token}</span>);
    } else {
      tokens.push(token);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) tokens.push(line.slice(lastIndex));
  return tokens;
}

export function CodePanel({
  structs,
  functions,
  activeFunction,
  activeLine,
  callerLine,
  step,
}: CodePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [step, activeLine, activeFunction]);

  return (
    <div ref={containerRef} className="flex flex-col gap-5 p-5">
      {structs.trim() && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted/60">
            Struct Definitions
          </h3>
          <pre className="rounded-xl border-2 border-card-border bg-code-bg text-[13px] leading-relaxed">
            {structs.split("\n").map((line, i) => (
              <div key={i} className="px-4 py-0.5 text-muted-foreground/80">
                {line ? highlightCpp(line) : "\u00A0"}
              </div>
            ))}
          </pre>
        </div>
      )}

      {functions.map((func) => {
        const isActive = func.name === activeFunction;
        const isCallerFunc =
          callerLine !== undefined && func.name !== activeFunction;

        return (
          <div key={func.name}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted/60">
              {func.name}()
              {isActive && (
                <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-accent">
                  executing
                </span>
              )}
              {isCallerFunc && (
                <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-warning">
                  waiting
                </span>
              )}
            </h3>
            <pre className="overflow-x-auto rounded-xl border-2 border-card-border bg-code-bg text-[13px] leading-relaxed">
              {func.lines.map((line, i) => {
                const isActiveLine = isActive && i === activeLine;
                const isCallerLine =
                  isCallerFunc && callerLine !== undefined && i === callerLine;

                return (
                  <div
                    key={i}
                    ref={isActiveLine ? activeLineRef : undefined}
                    data-active-line={isActiveLine || undefined}
                    className={cn(
                      "flex items-center border-l-4 border-transparent px-4 py-[4px] transition-all duration-200",
                      isActiveLine &&
                        "border-l-accent bg-accent/10 text-foreground font-medium",
                      isCallerLine &&
                        "border-l-warning/70 bg-warning-dim text-foreground/70",
                      !isActiveLine &&
                        !isCallerLine &&
                        "text-muted-foreground/60"
                    )}
                  >
                    {isActiveLine && (
                      <span className="mr-1 shrink-0 text-accent">
                        <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor"><polygon points="0,0 8,5 0,10" /></svg>
                      </span>
                    )}
                    <span className={cn(
                      "mr-3 w-6 shrink-0 select-none text-right",
                      isActiveLine ? "font-bold text-accent" : "text-muted/30"
                    )}>
                      {i + 1}
                    </span>
                    <span>{highlightCpp(line)}</span>
                  </div>
                );
              })}
            </pre>
          </div>
        );
      })}
    </div>
  );
}
