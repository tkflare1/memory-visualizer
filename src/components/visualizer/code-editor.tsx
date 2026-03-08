"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Play,
  ChevronDown,
  AlertTriangle,
  Plus,
  Trash2,
  AlignLeft,
  Copy,
  Check,
  RotateCcw,
} from "lucide-react";
import { EXAMPLES } from "@/lib/examples";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface CodeEditorProps {
  onRun: (code: string) => void;
  error: string | null;
  isRunning: boolean;
}

const BRACKET_PAIRS: Record<string, string> = {
  "(": ")",
  "{": "}",
  "[": "]",
};
const CLOSE_BRACKETS = new Set([")", "}", "]"]);

function formatCppCode(code: string): string {
  const lines = code.split("\n");
  const result: string[] = [];
  let indent = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      result.push("");
      continue;
    }

    if (trimmed.startsWith("}") || trimmed === "};") {
      indent = Math.max(0, indent - 1);
    }

    result.push("    ".repeat(indent) + trimmed);

    const opens = (trimmed.match(/{/g) || []).length;
    const closes = (trimmed.match(/}/g) || []).length;
    indent = Math.max(0, indent + opens - closes);

    if (trimmed.startsWith("}")) {
      indent = Math.max(0, indent);
    }
  }

  return result.join("\n");
}

export function CodeEditor({ onRun, error, isRunning }: CodeEditorProps) {
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [selectedExample, setSelectedExample] = useState<number | null>(0);
  const [showExamples, setShowExamples] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const lineCount = code.split("\n").length;
  const isMac = useMemo(() => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent), []);

  function selectExample(idx: number) {
    setSelectedExample(idx);
    setCode(EXAMPLES[idx].code);
    setShowExamples(false);
  }

  function handleNew() {
    setSelectedExample(null);
    setCode("");
    textareaRef.current?.focus();
  }

  function handleClear() {
    setCode("");
    textareaRef.current?.focus();
  }

  function handleFormat() {
    setCode(formatCppCode(code));
  }

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleReset() {
    if (selectedExample !== null) {
      setCode(EXAMPLES[selectedExample].code);
    }
  }

  // Sync line numbers scroll with textarea scroll
  const syncScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Handle Tab, Shift+Tab, Enter auto-indent, bracket auto-close
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = textareaRef.current;
    if (!ta) return;

    const { selectionStart, selectionEnd, value } = ta;

    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab: dedent
        const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
        const lineText = value.slice(lineStart, selectionEnd);
        const dedented = lineText.replace(/^(    |\t)/, "");
        const removed = lineText.length - dedented.length;
        const newVal = value.slice(0, lineStart) + dedented + value.slice(selectionEnd);
        setCode(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = Math.max(lineStart, selectionStart - removed);
          ta.selectionEnd = Math.max(lineStart, selectionEnd - removed);
        });
      } else {
        // Tab: insert 4 spaces
        const newVal = value.slice(0, selectionStart) + "    " + value.slice(selectionEnd);
        setCode(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart + 4;
        });
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const currentLine = value.slice(lineStart, selectionStart);
      const indentMatch = currentLine.match(/^(\s*)/);
      let indent = indentMatch ? indentMatch[1] : "";

      // Increase indent after {
      const trimmedBefore = value.slice(0, selectionStart).trimEnd();
      if (trimmedBefore.endsWith("{")) {
        indent += "    ";
      }

      const insertion = "\n" + indent;
      const newVal = value.slice(0, selectionStart) + insertion + value.slice(selectionEnd);
      setCode(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + insertion.length;
      });
      return;
    }

    // Auto-close brackets
    if (BRACKET_PAIRS[e.key]) {
      e.preventDefault();
      const close = BRACKET_PAIRS[e.key];
      const insertion = e.key + close;
      const newVal = value.slice(0, selectionStart) + insertion + value.slice(selectionEnd);
      setCode(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + 1;
      });
      return;
    }

    // Skip over closing bracket if already there
    if (CLOSE_BRACKETS.has(e.key) && value[selectionStart] === e.key) {
      e.preventDefault();
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + 1;
      });
    }
  }

  // Ctrl/Cmd + Enter to run
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (code.trim() && !isRunning) onRun(code);
      }
    }
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [code, isRunning, onRun]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b-2 border-card-border bg-card px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-sm font-bold text-accent">
            C++
          </div>
          <div>
            <h1 className="text-lg font-bold">CS198 Memory Visualizer</h1>
            <p className="text-sm text-muted-foreground">
              Paste C++ code below and run to visualize stack &amp; heap memory
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left side: examples */}
        <div className="hidden w-[280px] shrink-0 flex-col border-r-2 border-card-border bg-card/50 md:flex">
          <div className="flex items-center justify-between border-b border-card-border px-5 py-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted/60">
              Examples
            </h2>
            <button
              onClick={handleNew}
              className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20"
              title="New blank snippet"
            >
              <Plus size={13} />
              New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* "Blank" option */}
            <button
              onClick={handleNew}
              className={cn(
                "w-full border-b border-card-border/30 px-5 py-4 text-left transition-colors",
                selectedExample === null
                  ? "bg-accent/8 text-foreground"
                  : "text-muted-foreground hover:bg-card-border/20 hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Plus size={14} className="text-accent" />
                Blank — Write your own
              </div>
              <div className="mt-1 text-xs leading-relaxed text-muted/60">
                Start from scratch with an empty editor.
              </div>
            </button>

            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => selectExample(i)}
                className={cn(
                  "w-full border-b border-card-border/30 px-5 py-4 text-left transition-colors",
                  i === selectedExample
                    ? "bg-accent/8 text-foreground"
                    : "text-muted-foreground hover:bg-card-border/20 hover:text-foreground"
                )}
              >
                <div className="text-sm font-semibold">{ex.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted/60">
                  {ex.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right side: editor */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Mobile example selector */}
          <div className="relative border-b border-card-border md:hidden">
            <button
              onClick={() => setShowExamples(!showExamples)}
              className="flex w-full items-center justify-between px-5 py-3 text-sm text-muted-foreground"
            >
              <span>
                {selectedExample !== null
                  ? `Example: ${EXAMPLES[selectedExample].title}`
                  : "Blank — Write your own"}
              </span>
              <ChevronDown size={16} />
            </button>
            {showExamples && (
              <div className="absolute inset-x-0 top-full z-20 border-b border-card-border bg-card shadow-lg">
                <button
                  onClick={handleNew}
                  className="w-full px-5 py-3 text-left text-sm text-muted-foreground hover:bg-card-border/20"
                >
                  <Plus size={14} className="mr-1.5 inline text-accent" />
                  Blank — Write your own
                </button>
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => selectExample(i)}
                    className="w-full px-5 py-3 text-left text-sm text-muted-foreground hover:bg-card-border/20"
                  >
                    {ex.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1.5 border-b border-card-border/60 bg-code-bg px-4 py-2">
            <button
              onClick={handleFormat}
              disabled={!code.trim()}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-card-border/30 hover:text-foreground disabled:opacity-30"
              title="Format code (fix indentation)"
            >
              <AlignLeft size={13} />
              Format
            </button>
            <button
              onClick={handleCopy}
              disabled={!code.trim()}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-card-border/30 hover:text-foreground disabled:opacity-30"
              title="Copy code to clipboard"
            >
              {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              {copied ? "Copied!" : "Copy"}
            </button>
            {selectedExample !== null && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-card-border/30 hover:text-foreground"
                title="Reset to original example code"
              >
                <RotateCcw size={13} />
                Reset
              </button>
            )}
            <button
              onClick={handleClear}
              disabled={!code.trim()}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-danger/60 transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-30"
              title="Clear all code"
            >
              <Trash2 size={13} />
              Clear
            </button>

            <div className="ml-auto flex items-center gap-3 text-[11px] text-muted/40">
              <span>{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
              <span>{code.length} chars</span>
            </div>
          </div>

          {/* Code textarea with line numbers */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full">
              {/* Line numbers gutter */}
              <div
                ref={lineNumbersRef}
                className="shrink-0 select-none overflow-hidden bg-code-bg pr-2 pt-6 text-right"
                style={{ width: "52px" }}
                aria-hidden
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div
                    key={i}
                    className="px-2 font-mono text-[14px] leading-relaxed text-muted/25"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onScroll={syncScroll}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                className={cn(
                  "h-full min-w-0 flex-1 resize-none bg-code-bg py-6 pl-2 pr-6 font-mono text-[14px] leading-relaxed text-foreground outline-none",
                  "placeholder:text-muted/30"
                )}
                placeholder="Paste or write your C++ code here..."
              />
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="flex items-start gap-3 border-t-2 border-danger/30 bg-danger-dim px-5 py-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
              <pre className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-danger">
                {error}
              </pre>
            </div>
          )}

          {/* Run button */}
          <div className="flex items-center justify-between border-t-2 border-card-border bg-card px-5 py-3.5">
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-muted/50">
                Supports structs, pointers, new/delete, arrays, functions, loops
              </p>
              <p className="text-[11px] text-muted/30">
                <kbd className="rounded border border-card-border bg-background px-1.5 py-0.5 font-mono text-[10px]">
                  {isMac ? "⌘" : "Ctrl"}
                </kbd>
                {" + "}
                <kbd className="rounded border border-card-border bg-background px-1.5 py-0.5 font-mono text-[10px]">
                  Enter
                </kbd>
                {" to run"}
              </p>
            </div>
            <button
              onClick={() => onRun(code)}
              disabled={isRunning || !code.trim()}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-6 py-2.5 text-sm font-bold transition-all",
                "bg-accent text-white shadow-lg shadow-accent/20 hover:bg-accent/85 hover:shadow-accent/30",
                "disabled:cursor-not-allowed disabled:shadow-none",
                isRunning ? "opacity-80" : "disabled:opacity-40"
              )}
            >
              {isRunning ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                </svg>
              ) : (
                <Play size={16} />
              )}
              {isRunning ? "Running..." : "Run & Visualize"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
