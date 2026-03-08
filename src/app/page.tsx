"use client";

import { useState, useCallback } from "react";
import { interpret, type InterpretResult } from "@/lib/interpreter";
import type { Trace } from "@/types/memory";
import { CodeEditor } from "@/components/visualizer/code-editor";
import { Visualizer } from "@/components/visualizer/visualizer";

export default function Home() {
  const [mode, setMode] = useState<"edit" | "visualize">("edit");
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = useCallback((code: string) => {
    setIsRunning(true);
    setError(null);
    // Use setTimeout to allow UI to update before running the interpreter
    setTimeout(() => {
      const result: InterpretResult = interpret(code);
      setIsRunning(false);
      if (result.success && result.trace) {
        setTrace(result.trace);
        setMode("visualize");
      } else {
        setError(result.error || "Unknown error occurred");
      }
    }, 50);
  }, []);

  const handleBack = useCallback(() => {
    setMode("edit");
    setTrace(null);
  }, []);

  if (mode === "visualize" && trace) {
    return <Visualizer trace={trace} onBack={handleBack} />;
  }

  return <CodeEditor onRun={handleRun} error={error} isRunning={isRunning} />;
}
