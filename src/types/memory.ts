export interface MemoryItem {
  id: string;
  label: string;
  address?: string;
  value?: string;
  pointsTo?: string;
  children?: MemoryItem[];
  orphaned?: boolean;
  changed?: boolean;
}

export interface StackFrame {
  name: string;
  variables: MemoryItem[];
}

export interface Step {
  line: number;
  activeFunction: string;
  callerLine?: number;
  explanation: string;
  output?: string;
  stack: StackFrame[];
  heap: MemoryItem[];
}

export interface CodeFunction {
  name: string;
  lines: string[];
}

export interface Trace {
  title: string;
  description: string;
  structs: string;
  functions: CodeFunction[];
  steps: Step[];
}
