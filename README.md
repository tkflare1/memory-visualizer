# C++ Memory Visualizer

An interactive, browser-based visualizer for C++ memory — stack frames, heap allocations, pointers, and linked lists. Paste any C++ code (CS106B-style) and step through execution to see exactly how memory changes.

**No server, no LLM, no API keys.** Everything runs client-side with a custom TypeScript interpreter.

## Features

- **Dynamic C++ interpretation** — paste any code using structs, pointers, `new`/`delete`, arrays, functions, and loops
- **Stack & heap visualization** — see stack frames grow/shrink and heap blocks allocated/freed in real time
- **Pointer arrows** — labeled, color-coded arrows show exactly where every pointer points
- **Step-by-step execution** — forward, backward, auto-play with speed control, click the progress bar to jump
- **Active line highlighting** — the currently executing line pulses with a blue indicator
- **Change detection** — modified memory cells flash green so you see what each step affected
- **Memory leak detection** — orphaned heap blocks are flagged with a "LEAKED" badge
- **Recursion support** — recursive calls show as stacked frames with depth badges
- **Pass-by-reference** — correctly handles `Node*&` and similar reference parameters
- **Code editor** — line numbers, Tab/Shift-Tab indentation, auto-indent, bracket auto-close, Format button
- **6 built-in examples** — Simple Pointers, Linked List Build, Linked List Delete, Cats Problem, Pointer Tracing with Functions, Array of Structs
- **Light & dark mode** — toggle between themes, persisted in localStorage
- **Keyboard shortcuts** — Arrow keys, Space, R to navigate; Ctrl/Cmd+Enter to run

## Supported C++ Subset

- `struct` definitions with nested fields
- Pointers (`*`, `&`, `->`, `.`)
- `new` / `new Type[n]` / `delete`
- Array subscript (`[]`)
- Functions with pass-by-value and pass-by-reference
- `if` / `else` / `while` / `for`
- Arithmetic, comparison, and logical operators
- `nullptr`, integer/boolean literals

## Tech Stack

- [Next.js](https://nextjs.org) 16 with Turbopack
- [Tailwind CSS](https://tailwindcss.com) v4
- [Lucide React](https://lucide.dev) icons
- [Geist](https://vercel.com/font) font family
- TypeScript throughout

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the visualizer.

## Deploy

```bash
npx vercel
```
