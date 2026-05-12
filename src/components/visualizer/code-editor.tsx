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
  Pencil,
  FileCode,
} from "lucide-react";
import { EXAMPLES } from "@/lib/examples";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface CodeEditorProps {
  onRun: (code: string) => void;
  error: string | null;
  isRunning: boolean;
}

// ─── Types ─────────────────────────────────────────────────────────

interface CustomSnippet {
  id: string;
  title: string;
}

type TabId = number | string;

// ─── Syntax Highlighting ───────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CPP_KEYWORDS = new Set([
  "if", "else", "while", "for", "return", "break", "continue",
  "switch", "case", "default", "struct", "class", "new", "delete",
  "typedef", "const", "nullptr", "true", "false", "namespace", "using",
  "template", "typename", "public", "private", "protected", "virtual",
  "override", "static", "extern", "sizeof", "this", "throw", "try", "catch",
]);

const CPP_TYPES = new Set([
  "int", "void", "double", "float", "char", "bool", "string",
  "auto", "long", "short", "unsigned", "signed", "size_t",
]);

const CPP_BUILTINS = new Set([
  "cout", "cin", "endl", "cerr", "printf", "scanf", "NULL", "std",
]);

function highlightCpp(code: string): string {
  const out: string[] = [];
  let i = 0;
  const n = code.length;

  while (i < n) {
    if (code[i] === "/" && code[i + 1] === "/") {
      let end = code.indexOf("\n", i);
      if (end === -1) end = n;
      out.push(`<span class="syn-cmt">${escapeHtml(code.slice(i, end))}</span>`);
      i = end;
      continue;
    }

    if (code[i] === "/" && code[i + 1] === "*") {
      let end = code.indexOf("*/", i + 2);
      if (end === -1) end = n; else end += 2;
      out.push(`<span class="syn-cmt">${escapeHtml(code.slice(i, end))}</span>`);
      i = end;
      continue;
    }

    if (code[i] === '"') {
      let j = i + 1;
      while (j < n && code[j] !== '"' && code[j] !== "\n") {
        if (code[j] === "\\") j++;
        j++;
      }
      if (j < n && code[j] === '"') j++;
      out.push(`<span class="syn-str">${escapeHtml(code.slice(i, j))}</span>`);
      i = j;
      continue;
    }

    if (code[i] === "'") {
      let j = i + 1;
      while (j < n && code[j] !== "'" && code[j] !== "\n") {
        if (code[j] === "\\") j++;
        j++;
      }
      if (j < n && code[j] === "'") j++;
      out.push(`<span class="syn-str">${escapeHtml(code.slice(i, j))}</span>`);
      i = j;
      continue;
    }

    if (code[i] === "#") {
      let end = code.indexOf("\n", i);
      if (end === -1) end = n;
      out.push(`<span class="syn-prep">${escapeHtml(code.slice(i, end))}</span>`);
      i = end;
      continue;
    }

    if (code[i] >= "0" && code[i] <= "9") {
      let j = i;
      while (j < n && /[0-9a-fA-FxX.]/.test(code[j])) j++;
      out.push(`<span class="syn-num">${code.slice(i, j)}</span>`);
      i = j;
      continue;
    }

    if (/[a-zA-Z_]/.test(code[i])) {
      let j = i;
      while (j < n && /[a-zA-Z0-9_]/.test(code[j])) j++;
      const word = code.slice(i, j);

      if (CPP_TYPES.has(word)) {
        out.push(`<span class="syn-type">${word}</span>`);
      } else if (CPP_KEYWORDS.has(word)) {
        out.push(`<span class="syn-kw">${word}</span>`);
      } else if (CPP_BUILTINS.has(word)) {
        out.push(`<span class="syn-bi">${word}</span>`);
      } else {
        let k = j;
        while (k < n && (code[k] === " " || code[k] === "\t")) k++;
        if (code[k] === "(") {
          out.push(`<span class="syn-fn">${escapeHtml(word)}</span>`);
        } else {
          out.push(escapeHtml(word));
        }
      }
      i = j;
      continue;
    }

    if (code[i] === "\n") {
      out.push("\n");
      i++;
      continue;
    }

    out.push(escapeHtml(code[i]));
    i++;
  }

  return out.join("");
}

// ─── Code Formatting ───────────────────────────────────────────────

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

// ─── Constants & Persistence ───────────────────────────────────────

const BLANK_TEMPLATE = `int main() {
    
    return 0;
}
`;

const BRACKET_PAIRS: Record<string, string> = {
  "(": ")",
  "{": "}",
  "[": "]",
};
const CLOSE_BRACKETS = new Set([")", "}", "]"]);
const QUOTE_CHARS = new Set(['"', "'"]);
const DELETE_PAIRS: Record<string, string> = {
  "(": ")", "{": "}", "[": "]", '"': '"', "'": "'",
};

const STORAGE_KEY = "memviz_state";

interface SavedState {
  tab: TabId;
  codes: Record<string, string>;
  custom: CustomSnippet[];
}

function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const custom: CustomSnippet[] = parsed.custom || [];
      const codes: Record<string, string> = parsed.codes || {};
      let tab: TabId = parsed.tab ?? 0;

      if (parsed.tab === null) {
        if (codes["blank"] && codes["blank"].trim()) {
          const id = `c_${Date.now()}`;
          custom.push({ id, title: "My Code" });
          codes[id] = codes["blank"];
          tab = id;
        } else {
          tab = 0;
        }
        delete codes["blank"];
      }

      return { tab, codes, custom };
    }
  } catch {}
  return { tab: 0, codes: {}, custom: [] };
}

const MAX_CUSTOM_SNIPPETS = 20;

function saveState(tab: TabId, codes: Record<string, string>, custom: CustomSnippet[]) {
  const payload = JSON.stringify({ tab, codes, custom });
  try {
    localStorage.setItem(STORAGE_KEY, payload);
  } catch {
    // Quota exceeded — drop the oldest custom snippets' code until it fits
    const trimmedCodes = { ...codes };
    const trimmedCustom = [...custom];
    while (trimmedCustom.length > 1) {
      const removed = trimmedCustom.shift()!;
      if (String(tab) !== removed.id) {
        delete trimmedCodes[removed.id];
      }
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ tab, codes: trimmedCodes, custom: trimmedCustom })
        );
        return;
      } catch { /* keep trimming */ }
    }
    // Last resort: only keep the active tab's code
    const minimalCodes: Record<string, string> = {};
    const key = String(tab);
    if (key in codes) minimalCodes[key] = codes[key];
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ tab, codes: minimalCodes, custom: trimmedCustom })
      );
    } catch { /* storage completely full, nothing we can do */ }
  }
}

// ─── Component ─────────────────────────────────────────────────────

export function CodeEditor({ onRun, error, isRunning }: CodeEditorProps) {
  const [codesMap, setCodesMap] = useState<Record<string, string>>({});
  const [customSnippets, setCustomSnippets] = useState<CustomSnippet[]>([]);
  const [selectedTab, setSelectedTab] = useState<TabId>(0);
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [showExamples, setShowExamples] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  const lineCount = code.split("\n").length;
  const [modKey, setModKey] = useState("Ctrl");

  const highlighted = useMemo(() => highlightCpp(code) + "\n", [code]);

  const isCustomTab = typeof selectedTab === "string";
  const isExampleTab = typeof selectedTab === "number";

  const currentTabLabel = useMemo(() => {
    if (isExampleTab) return EXAMPLES[selectedTab as number]?.title ?? "Example";
    const snippet = customSnippets.find(s => s.id === selectedTab);
    return snippet?.title ?? "Untitled";
  }, [selectedTab, customSnippets, isExampleTab]);

  // ── Mount: restore from localStorage ──
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) {
      setModKey("⌘");
    }
    const saved = loadState();
    setSelectedTab(saved.tab);
    setCodesMap(saved.codes);
    setCustomSnippets(saved.custom);
    const key = String(saved.tab);
    if (key in saved.codes) {
      setCode(saved.codes[key]);
    } else if (typeof saved.tab === "number" && saved.tab < EXAMPLES.length) {
      setCode(EXAMPLES[saved.tab].code);
    } else {
      setCode(BLANK_TEMPLATE);
    }
  }, []);

  // ── Persist on change ──
  useEffect(() => {
    setCodesMap(prev => {
      const next = { ...prev, [String(selectedTab)]: code };
      saveState(selectedTab, next, customSnippets);
      return next;
    });
  }, [code, selectedTab, customSnippets]);

  // ── Tab switching ──
  function switchTab(id: TabId) {
    const currentKey = String(selectedTab);
    const updatedMap = { ...codesMap, [currentKey]: code };
    setCodesMap(updatedMap);

    setSelectedTab(id);
    setShowExamples(false);
    setEditingId(null);

    const newKey = String(id);
    if (newKey in updatedMap) {
      setCode(updatedMap[newKey]);
    } else if (typeof id === "number" && id < EXAMPLES.length) {
      setCode(EXAMPLES[id].code);
    } else {
      setCode(BLANK_TEMPLATE);
    }
  }

  // ── Custom snippet management ──
  function handleNew() {
    if (customSnippets.length >= MAX_CUSTOM_SNIPPETS) {
      const oldest = customSnippets[0];
      if (String(selectedTab) === oldest.id) {
        setCustomSnippets(prev => prev.slice(1));
      } else {
        setCustomSnippets(prev => prev.slice(1));
        setCodesMap(prev => {
          const next = { ...prev };
          delete next[oldest.id];
          return next;
        });
      }
    }
    const id = `c_${Date.now()}`;
    const snippet: CustomSnippet = { id, title: "Untitled" };
    setCustomSnippets(prev => [...prev, snippet]);
    switchTab(id);
    setEditingId(id);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function handleDeleteSnippet(id: string) {
    setCustomSnippets(prev => prev.filter(s => s.id !== id));
    setCodesMap(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (String(selectedTab) === id) {
      setSelectedTab(0);
      const savedCode = codesMap[String(0)];
      setCode(savedCode ?? EXAMPLES[0].code);
    }
    if (editingId === id) setEditingId(null);
  }

  function handleRenameSnippet(id: string, title: string) {
    setCustomSnippets(prev =>
      prev.map(s => s.id === id ? { ...s, title: title.trim() || "Untitled" } : s)
    );
    setEditingId(null);
  }

  function selectExample(idx: number) {
    switchTab(idx);
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
    if (isExampleTab) {
      setCode(EXAMPLES[selectedTab as number].code);
    } else {
      setCode(BLANK_TEMPLATE);
    }
  }

  // ── Scroll sync ──
  const syncScroll = useCallback(() => {
    if (textareaRef.current) {
      const { scrollTop, scrollLeft } = textareaRef.current;
      if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = scrollTop;
      if (highlightRef.current) {
        highlightRef.current.scrollTop = scrollTop;
        highlightRef.current.scrollLeft = scrollLeft;
      }
    }
  }, []);

  // ── Keyboard handling ──
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = textareaRef.current;
    if (!ta) return;

    const { selectionStart, selectionEnd, value } = ta;

    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
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
      const baseIndent = indentMatch ? indentMatch[1] : "";

      const charBefore = value[selectionStart - 1];
      const charAfter = value[selectionStart];

      if (charBefore === "{" && charAfter === "}") {
        const innerIndent = baseIndent + "    ";
        const insertion = "\n" + innerIndent + "\n" + baseIndent;
        const newVal = value.slice(0, selectionStart) + insertion + value.slice(selectionEnd);
        setCode(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart + 1 + innerIndent.length;
        });
        return;
      }

      let indent = baseIndent;
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

    if (e.key === "Backspace" && selectionStart === selectionEnd) {
      const before = value[selectionStart - 1];
      const after = value[selectionStart];
      if (before && after && before in DELETE_PAIRS && DELETE_PAIRS[before] === after) {
        e.preventDefault();
        const newVal = value.slice(0, selectionStart - 1) + value.slice(selectionStart + 1);
        setCode(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart - 1;
        });
        return;
      }
    }

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

    if (CLOSE_BRACKETS.has(e.key) && value[selectionStart] === e.key) {
      e.preventDefault();
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + 1;
      });
      return;
    }

    if (QUOTE_CHARS.has(e.key)) {
      if (value[selectionStart] === e.key) {
        e.preventDefault();
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart + 1;
        });
        return;
      }
      const charBefore = value[selectionStart - 1];
      if (!charBefore || /[\s({[,;=+\-*/<>!&|^~%?:]/.test(charBefore)) {
        e.preventDefault();
        const insertion = e.key + e.key;
        const newVal = value.slice(0, selectionStart) + insertion + value.slice(selectionEnd);
        setCode(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart + 1;
        });
        return;
      }
    }
  }

  // ── Global shortcuts ──
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

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b-2 border-card-border bg-card px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-sm font-bold text-accent">
            C++
          </div>
          <div>
            <h1 className="text-lg font-bold">C++ Memory Visualizer</h1>
            <p className="text-sm text-muted-foreground">
              Paste C++ code below and run to visualize stack &amp; heap memory
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left side: sidebar */}
        <div className="hidden w-[280px] shrink-0 flex-col border-r-2 border-card-border bg-card/50 md:flex">
          <div className="flex items-center justify-between border-b border-card-border px-5 py-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted/60">
              Snippets
            </h2>
            <button
              onClick={handleNew}
              className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20"
              title={`Create a new snippet (${customSnippets.length}/${MAX_CUSTOM_SNIPPETS})`}
            >
              <Plus size={13} />
              New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* Custom snippets */}
            {customSnippets.length > 0 && (
              <>
                <div className="px-5 pb-1 pt-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted/40">
                    Your Code
                  </span>
                </div>
                {customSnippets.map((snippet) => (
                  <div
                    key={snippet.id}
                    onClick={() => switchTab(snippet.id)}
                    className={cn(
                      "group flex w-full cursor-pointer items-start justify-between border-b border-card-border/30 px-5 py-3.5 text-left transition-colors",
                      selectedTab === snippet.id
                        ? "bg-accent/8 text-foreground"
                        : "text-muted-foreground hover:bg-card-border/20 hover:text-foreground"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      {editingId === snippet.id ? (
                        <input
                          autoFocus
                          defaultValue={snippet.title}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => handleRenameSnippet(snippet.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameSnippet(snippet.id, e.currentTarget.value);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full rounded border border-accent/40 bg-background/50 px-1.5 py-0.5 text-sm font-semibold outline-none focus:border-accent"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <FileCode size={14} className="shrink-0 text-accent/60" />
                          <span className="truncate text-sm font-semibold">{snippet.title}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingId(snippet.id); }}
                            className="shrink-0 rounded p-0.5 text-muted/30 opacity-0 transition-all hover:text-accent group-hover:opacity-100"
                            title="Rename snippet"
                          >
                            <Pencil size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSnippet(snippet.id); }}
                      className="ml-2 shrink-0 rounded p-1 text-muted/30 opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                      title="Delete snippet"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <div className="px-5 pb-1 pt-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted/40">
                    Built-in Examples
                  </span>
                </div>
              </>
            )}

            {/* Built-in examples */}
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => selectExample(i)}
                className={cn(
                  "w-full border-b border-card-border/30 px-5 py-4 text-left transition-colors",
                  i === selectedTab
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
              <span>{currentTabLabel}</span>
              <ChevronDown size={16} />
            </button>
            {showExamples && (
              <div className="absolute inset-x-0 top-full z-20 max-h-80 overflow-y-auto border-b border-card-border bg-card shadow-lg">
                <button
                  onClick={handleNew}
                  className="w-full border-b border-card-border/30 px-5 py-3 text-left text-sm text-accent hover:bg-card-border/20"
                >
                  <Plus size={14} className="mr-1.5 inline" />
                  New snippet
                </button>
                {customSnippets.map((snippet) => (
                  <button
                    key={snippet.id}
                    onClick={() => { switchTab(snippet.id); setShowExamples(false); }}
                    className={cn(
                      "w-full px-5 py-3 text-left text-sm hover:bg-card-border/20",
                      selectedTab === snippet.id ? "text-accent" : "text-muted-foreground"
                    )}
                  >
                    <FileCode size={14} className="mr-1.5 inline text-accent/60" />
                    {snippet.title}
                  </button>
                ))}
                {customSnippets.length > 0 && (
                  <div className="border-t border-card-border/30" />
                )}
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => { selectExample(i); setShowExamples(false); }}
                    className={cn(
                      "w-full px-5 py-3 text-left text-sm hover:bg-card-border/20",
                      selectedTab === i ? "text-accent" : "text-muted-foreground"
                    )}
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
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-card-border/30 hover:text-foreground"
              title={isExampleTab ? "Reset to original example code" : "Reset to blank template"}
            >
              <RotateCcw size={13} />
              Reset
            </button>
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

          {/* Code textarea with syntax highlighting overlay */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full">
              {/* Line numbers gutter */}
              <div
                ref={lineNumbersRef}
                className="shrink-0 select-none overflow-hidden border-r border-card-border/30 bg-code-bg pr-2 pt-6 text-right"
                style={{ width: "54px" }}
                aria-hidden
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div
                    key={i}
                    className="px-2 font-mono text-[14px] leading-relaxed text-muted/30"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Editor area: highlight layer + textarea */}
              <div className="relative min-w-0 flex-1 bg-code-bg">
                <pre
                  ref={highlightRef}
                  className="editor-highlight pointer-events-none absolute inset-0 overflow-hidden whitespace-pre bg-transparent py-6 pl-3 pr-6 font-mono text-[14px] leading-relaxed"
                  aria-hidden
                >
                  <code dangerouslySetInnerHTML={{ __html: highlighted }} />
                </pre>

                <textarea
                  ref={textareaRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onScroll={syncScroll}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  wrap="off"
                  className={cn(
                    "relative z-10 h-full w-full resize-none bg-transparent py-6 pl-3 pr-6 font-mono text-[14px] leading-relaxed text-transparent outline-none",
                    "placeholder:text-muted/30"
                  )}
                  style={{ caretColor: "var(--foreground)" }}
                  placeholder="Write your C++ code here..."
                />
              </div>
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
                  {modKey}
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
