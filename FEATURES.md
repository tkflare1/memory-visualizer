# C++ Memory Visualizer — Complete Feature Documentation

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Client-Side C++ Interpreter](#3-client-side-c-interpreter)
4. [Memory Model](#4-memory-model)
5. [Visualization Engine](#5-visualization-engine)
6. [Step-by-Step Execution](#6-step-by-step-execution)
7. [Pointer Arrow System](#7-pointer-arrow-system)
8. [Orphaned Memory Detection](#8-orphaned-memory-detection)
9. [Recursion Visualization](#9-recursion-visualization)
10. [Code Editor](#10-code-editor)
11. [UI/UX Design](#11-uiux-design)
12. [Keyboard Shortcuts](#12-keyboard-shortcuts)
13. [Supported C++ Subset](#13-supported-c-subset)
14. [Deployment](#14-deployment)
15. [How to Explain Each Feature to Students](#15-how-to-explain-each-feature-to-students)

---

## 1. Overview

The C++ Memory Visualizer is a web-based tool for teaching pointer tracing, linked lists, memory management, and recursion in the style of Stanford's CS106B curriculum. Unlike Python Tutor, it runs **entirely in the browser** with no backend server or LLM API — the C++ code is interpreted client-side in TypeScript.

**Key Value Proposition:**
- Students paste any CS106B-style C++ code and see stack/heap memory change step by step
- Every pointer relationship is drawn as a visual arrow
- Orphaned/leaked memory is detected and highlighted in real time
- Recursion is visualized with incremental stack frame creation and backtracking
- No ads, no account required, no server dependency

**Live URL:** https://cs198b-visualizer.vercel.app

---

## 2. Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui patterns |
| Fonts | Geist Sans + Geist Mono |
| Deployment | Vercel |

### File Structure

```
src/
├── app/
│   ├── globals.css          # CSS variables, themes, animations
│   ├── layout.tsx           # Root layout with fonts and metadata
│   └── page.tsx             # Main page: edit mode ↔ visualize mode
├── components/
│   ├── theme-toggle.tsx     # Light/dark mode switch
│   └── visualizer/
│       ├── arrow-overlay.tsx # SVG pointer arrow rendering
│       ├── code-editor.tsx  # Code input page with examples
│       ├── code-panel.tsx   # Syntax-highlighted code display
│       ├── controls.tsx     # Playback controls (play/pause/step)
│       ├── memory-block.tsx # Stack/heap variable rendering
│       └── visualizer.tsx   # Main visualization layout
├── lib/
│   ├── examples.ts          # Pre-loaded code examples
│   ├── interpreter.ts       # C++ tokenizer, parser, executor, serializer
│   └── utils.ts             # cn() utility for class merging
└── types/
    └── memory.ts            # TypeScript interfaces for Trace/Step/MemoryItem
```

### Data Flow

```
User Code (string)
    │
    ▼
Tokenizer → Token[]
    │
    ▼
Parser → Program (AST: structs, functions, main statements)
    │
    ▼
Executor → Steps[] (raw snapshots of stack + heap at each line)
    │
    ▼
Serializer → Trace (MemoryItem trees with change detection + orphan detection)
    │
    ▼
React Components → Visual rendering with SVG arrows
```

---

## 3. Client-Side C++ Interpreter

The interpreter (`src/lib/interpreter.ts`) is a complete pipeline that runs in the browser with **zero server calls**.

### 3.1 Tokenizer

Converts raw C++ source code into a stream of typed tokens.

**Implementation:**
- Single-pass character scanner with line number tracking
- Supports all CS106B-relevant tokens: keywords, identifiers, integer literals, operators, punctuation
- Handles single-line (`//`) and multi-line (`/* */`) comments
- Recognizes string literals with escape character support
- Two-character operators (`->`, `==`, `!=`, `<=`, `>=`, `&&`, `||`, `++`, `--`, `+=`, `-=`, `::`) are matched before single-character operators

**Token Types (enum TT):**
- Keywords: `struct`, `int`, `void`, `bool`, `char`, `double`, `new`, `delete`, `nullptr`, `while`, `for`, `if`, `else`, `return`, `true`, `false`, `cout`, `endl`
- Literals: `IntLit`, `Ident`
- Operators: `Arrow`, `Eq`, `Neq`, `Lte`, `Gte`, `And`, `Or`, `PlusPlus`, `MinusMinus`, `PlusEq`, `MinusEq`, `ScopeRes`
- Punctuation: `LBrace`, `RBrace`, `LParen`, `RParen`, `LBracket`, `RBracket`, `Semi`, `Comma`, `Dot`, `Assign`, etc.

### 3.2 Parser

Recursive descent parser that builds an AST from the token stream.

**Key Parsing Methods:**

| Method | What It Parses |
|--------|---------------|
| `parseProgram()` | Top-level: structs, functions, main statements |
| `parseStructDef()` | Struct with fields, constructors (initializer lists), destructors |
| `parseFuncDef()` | Function signature + body |
| `parseStatement()` | var_decl, assign, while, for, if, return, delete, expr_stmt, block, cout (skipped) |
| `parseExpr()` | Full expression with operator precedence |

**Operator Precedence (lowest to highest):**
1. `||` (logical OR)
2. `&&` (logical AND)
3. `==`, `!=` (equality)
4. `<`, `>`, `<=`, `>=` (comparison)
5. `+`, `-` (additive)
6. `*`, `/`, `%` (multiplicative)
7. `!`, `*` (deref), `&` (address-of), `-` (unary), `++`, `--` (prefix)
8. `->`, `.`, `[]`, `()`, `++`, `--` (postfix)

**Constructor Parsing:**
The parser detects constructor definitions inside struct bodies by checking if the current token matches the struct name followed by `(`. It parses:
- Parameter list
- Optional initializer list after `:` (e.g., `val(x), next(nullptr)`)
- Body (skipped — only the initializer list matters for our execution model)

```cpp
// This is fully parsed and executed correctly:
struct ListNode {
    int val;
    ListNode* next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode* next) : val(x), next(next) {}
};
```

### 3.3 Executor

Tree-walking interpreter that executes the AST and maintains a virtual memory model.

**Core State:**
- `stack[]` — Array of stack frames, each with `vars` (variable values) and `types` (variable types)
- `heap{}` — Map from address strings to values
- `nextAddr` — Auto-incrementing address counter
- `callStack[]` — Tracks function call chain for caller line resolution
- `steps[]` — Recorded snapshots at each significant point

**Execution Model:**
- `execBlock()` iterates through statements in a block
- `execStmt()` dispatches by statement kind (var_decl, assign, while, for, if, return, delete, expr_stmt)
- `evalExpr()` evaluates expressions recursively
- `resolveRef()` resolves lvalue references for assignment targets

**Key Implementation Details:**

1. **Pointer Representation:** Pointers are stored as string addresses (e.g., `"1"`, `"2.next"`). `null` represents `nullptr`.

2. **Struct Values:** Structs on the heap are JavaScript objects with a `__type` field and named fields matching the struct definition.

3. **Array Allocation:** `new Type[n]` creates a heap entry with `__type`, `__count`, and `__elements` array.

4. **Pass-by-Reference:** Reference parameters (`Node*& list`) are stored as `{__isRef: true, container, key}` objects that resolve to the actual value through the container.

5. **Deep Cloning:** Struct assignment uses `JSON.parse(JSON.stringify(val))` to simulate C++ value semantics — assigning one struct to another creates a deep copy, not a shared reference.

6. **Constructor Execution:** When `new StructType(args...)` is called, the executor finds a matching constructor by parameter count, pushes a temporary stack frame with the constructor parameters, evaluates each initializer list expression, then pops the frame.

7. **Safety Limits:** `MAX_STEPS = 2000` and `MAX_LOOP = 500` prevent infinite execution.

---

## 4. Memory Model

### Stack

Each function call creates a stack frame with:
- **name** — Function name (e.g., "main", "reverseList")
- **vars** — Map of variable names to values
- **types** — Map of variable names to their C++ type strings

Stack frames are displayed top-down (most recent call at the top) with visual distinction between active and waiting frames.

### Heap

The heap is a flat map from address strings to values:
- **Primitive:** `heap["2"] = 42` (a `new int` with value 42)
- **Struct:** `heap["1"] = { __type: "Node", data: 1, next: "2" }` (Node pointing to address 2)
- **Array:** `heap["1"] = { __type: "Node[]", __count: 3, __elements: [...] }`

### Memory Addresses

Each heap block displays a simulated memory address (e.g., `0x100`, `0x200`) in the block header. These are derived from the internal address counter: address N displays as `0x` followed by `N * 256` in hex. Array elements show offsets (e.g., `0x100+64`, `0x100+128`).

Addresses are rendered in a very subtle, muted style (10px monospace, 25-30% opacity) so they're visible for students who want to see them but don't clutter the visualization.

### Snapshots

At each significant execution point, the executor calls `snapshot()` which:
1. Checks the step limit
2. Resolves `__isRef` variables to their actual values
3. Deep-clones the entire stack and heap state via `JSON.parse(JSON.stringify())`
4. Records the snapshot with line number, active function, caller line, and explanation text

---

## 5. Visualization Engine

### Serializer

The serializer (`serializeTrace()`) transforms raw executor snapshots into the `Trace` format consumed by React components.

**Key Responsibilities:**

1. **Code Function Extraction:** Splits the source code into per-function line arrays, skipping struct definitions. This enables per-function code display in the code panel.

2. **Stack Variable Serialization:** Converts each variable to a `MemoryItem` with:
   - `id` — Unique identifier (e.g., `s_head`)
   - `label` — Type and name (e.g., `ListNode* head`)
   - `value` — For primitives (e.g., `"42"`)
   - `pointsTo` — For pointers, the target heap item's id

3. **Heap Serialization:** Recursively converts heap values to `MemoryItem` trees:
   - Structs become items with `children` (one per field)
   - Arrays are expanded into individual element items
   - Pointer fields get `pointsTo` references
   - Each top-level block gets a display `address`

4. **Change Detection:** Compares the current step's serialized heap with the previous step's. Any item whose serialized value differs gets `changed = true`, which triggers green highlight animation.

5. **Orphaned Memory Detection:** (See Section 8)

6. **Line Resolution:** Maps raw source line numbers to function-relative line indices for code panel highlighting.

---

## 6. Step-by-Step Execution

Every meaningful state change produces a visual step. Here is exactly when snapshots are taken:

| Event | Snapshot Explanation |
|-------|---------------------|
| Program start | "Begin execution" |
| Variable declaration | The code line (e.g., `int* p = new int;`) |
| Assignment | The code line (e.g., `head->next = new Node;`) |
| Function entry | `Enter functionName(param=value, ...)` |
| If-condition check | `if (condition) {  →  true` or `→  false` |
| While-condition check | `while (condition) {  →  true` or `→  false` |
| For-condition check | `for (...) {  →  true` or `→  false` |
| Return statement | The code line (e.g., `return head;`) |
| Delete statement | The code line (e.g., `delete toDelete;`) |
| Expression statement | The code line |

**For loops** execute the update expression (e.g., `i++`) silently — the state change is visible in the next condition check snapshot, avoiding redundant steps.

**While loops** show every condition check, including the final `→ false` that exits the loop, so students see exactly when and why the loop terminates.

---

## 7. Pointer Arrow System

### Architecture

The arrow system (`arrow-overlay.tsx`) renders SVG arrows on a transparent overlay positioned absolutely over the memory panel.

### Pointer Collection

`collectPointers()` walks the **active (topmost) stack frame** and **all heap items** to find `pointsTo` relationships. During recursion, only the active frame's arrows are drawn — waiting frames still show their variable values but don't emit arrows, preventing spaghetti overlap.

### Arrow Routing Algorithm

Each arrow is classified and routed based on the relative position of source and target:

| Condition | Route |
|-----------|-------|
| Distance < 40px (self-reference) | Clockwise loop arc |
| Forward, angle < ~35° | **Straight line** (most common — adjacent nodes) |
| Forward, steep angle | Gentle bezier curve |
| Backward (dx < -30) | Compact curve routed **below** the nodes |
| Nearly vertical | Straight line |

**Design Principle:** Arrows are straight whenever possible. Curves are only used when the path would cross over content or the angle is too steep for a clean straight line.

### Arrow Rendering

Each arrow consists of three SVG elements:
1. **Source dot** — Filled circle at the pointer icon position
2. **Line path** — Straight line or bezier curve, ending at the base of the arrowhead
3. **Arrowhead** — Filled triangle computed manually (not an SVG marker) for pixel-perfect connection

**Source Anchoring:** Arrows start from the `data-arrow-src` attribute on the pointer icon SVG, not from the row's edge. This ensures the arrow visually originates right at the `→` icon.

**Target Convergence:** When multiple arrows point to the same target, they're offset vertically by 6px each to prevent overlap.

### Interactivity

- **Hover to highlight:** Hovering an arrow applies a glow filter and dims all other arrows to 8% opacity
- **Cursor:** Arrows have `pointer-events: auto` and `cursor: pointer`
- **Color consistency:** Each pointer gets a deterministic color based on a hash of its variable name

---

## 8. Orphaned Memory Detection

### How It Works

After serializing the heap for each step, a **reachability analysis** determines which heap blocks are orphaned:

1. **Seed from stack:** Walk all pointer variables in **every** stack frame (not just active — waiting frames still hold references) and mark their targets as reachable.

2. **Transitive closure:** Repeatedly scan all reachable heap items for pointer fields. Any target they point to is also marked reachable. Repeat until no new items are found.

3. **Mark orphans:** Any top-level heap block where **none** of its ids (including children) are in the reachable set is marked `orphaned = true`.

### Visual Presentation

Orphaned items are:
- Separated into a distinct **"Orphaned / Leaked Memory"** section below normal heap items
- Rendered with dashed red borders and faded opacity
- Labeled with a red **"LEAKED"** badge

### Example: Cats Problem

```cpp
leader->meow = new int;        // Step 8: new int allocated
*(leader->meow) = 2;           // Step 9: value set to 2
// ...
leader->meow = &(purr[1]);     // Step 14: new int now ORPHANED (1 leak)
// ...
// explore() returns             // Step 17: new Savanna also ORPHANED (2 leaks)
```

The leaked `new int` (value 2) and `new Savanna` are both detected and displayed in the leaked section. This matches the Stanford CS106B expected answer exactly.

---

## 9. Recursion Visualization

### Incremental Stack Growth

When a recursive function is called, the visualization shows:

1. **Function entry snapshot** — A new stack frame appears with the function's parameter values (e.g., `Enter reverseList(head=→1)`)
2. **Condition check** — The if/while condition is evaluated and displayed as `→ true` or `→ false`
3. **Deeper recursion** — If the condition allows, another frame appears
4. **Base case** — When the condition is finally `→ true` (or `→ false` depending on the check), the deepest frame is at the top

### Backtracking

As the recursion unwinds:
1. The `return` statement shows the value being returned
2. The next step shows the frame removed and the caller's variable receiving the return value
3. Each unwinding level's mutations (e.g., `head->next->next = head`) are individually visible

### Arrow Decluttering During Recursion

Only the **active (topmost) stack frame** draws arrows. Waiting frames show their variable values but no arrows. This prevents the catastrophic arrow overlap that occurs when 3+ frames all point to the same heap nodes.

### Example: reverseList

```
Step  5: main > reverseList           Enter reverseList(head=→1)
Step  6: main > reverseList           if (!head || !(head->next)) {  →  false
Step  7: main > reverseList > rL      Enter reverseList(head=→2)
Step  8: main > reverseList > rL      if (!head || !(head->next)) {  →  false
Step  9: main > rL > rL > rL          Enter reverseList(head=→3)
Step 10: main > rL > rL > rL          if (!head || !(head->next)) {  →  true    ← BASE CASE
Step 11: main > rL > rL > rL          return head;
Step 12: main > reverseList > rL      ListNode* p = reverseList(head->next);     ← UNWIND
...
Step 20: main                          ListNode* result = reverseList(a);
```

---

## 10. Code Editor

### Features

| Feature | Implementation |
|---------|---------------|
| **Syntax highlighting** | Regex-based highlighting for keywords, types, numbers, strings, comments, operators |
| **Line numbers** | Synchronized scroll with textarea, rendered in a separate `div` |
| **Tab indentation** | Tab key inserts 4 spaces; Shift+Tab dedents |
| **Auto-indent** | Enter key matches the previous line's indentation; adds extra indent after `{` |
| **Bracket auto-close** | Typing `(`, `{`, or `[` auto-inserts the matching closer |
| **Format button** | `formatCppCode()` re-indents the entire file based on brace depth |
| **Copy button** | Copies code to clipboard |
| **Clear button** | Empties the editor |
| **Reset button** | Reloads the current example |
| **Run shortcut** | Cmd+Enter (Mac) / Ctrl+Enter (Windows) |
| **Line/char count** | Displayed at top right |

### Pre-loaded Examples

1. **Simple Pointers** — `new int`, dereference, address-of
2. **Linked List — Build** — Build a 3-node singly-linked list
3. **Linked List — Delete Node** — Remove the second node
4. **Cats Problem** — Classic Stanford CS106B pointer tracing with structs, arrays, memory leaks
5. **Pointer Tracing — Functions** — Pass-by-value vs pass-by-reference
6. **Reverse Linked List** — Recursive reversal with struct constructors
7. **Array of Structs** — `new Type[n]` with field access
8. **Blank** — Write your own code from scratch

---

## 11. UI/UX Design

### Theming

Two themes are supported: **dark** (default) and **light**.

**Implementation:**
- CSS variables defined in `globals.css` under `:root` (dark) and `.light` selectors
- Theme class (`dark`/`light`) toggled on `document.documentElement`
- Persisted in `localStorage` under `"theme"` key
- Toggle button in the header (sun/moon icon)

**Color Palette:**

| Variable | Dark Value | Purpose |
|----------|-----------|---------|
| `--background` | `#09090b` | Page background |
| `--card` | `#18181b` | Card/panel background |
| `--foreground` | `#fafafa` | Primary text |
| `--accent` | `#3b82f6` | Active highlights, buttons |
| `--success` | `#22c55e` | Changed values |
| `--warning` | `#f59e0b` | Caller line, depth badges |
| `--danger` | `#ef4444` | Errors, leaked memory |

### Animations

- **Active line pulse:** The currently executing line pulses with an accent-colored background
- **Changed value glow:** Heap items that changed in the current step get a green ring animation
- **Smooth transitions:** All border, opacity, and color changes use 300ms transitions

### Layout

```
┌────────────────────────────────────────────────────────┐
│  Header: ◀ Editor  |  C++ Memory Visualization  |  ☀  │
├──────────┬─────────────────────────────────────────────┤
│          │                                             │
│  Code    │   STACK              HEAP                   │
│  Panel   │   ┌─────────┐      ┌──────────┐            │
│          │   │ main()   │      │ ListNode │            │
│  (400px) │   │ head = → │ ──── │ val = 1  │            │
│          │   └─────────┘      │ next = → │ ────        │
│          │                    └──────────┘             │
├──────────┴─────────────────────────────────────────────┤
│  Step 5/20  |  Enter reverseList(head=→1)              │
├────────────────────────────────────────────────────────┤
│  « ‹  ▶  › »    ━━━━━━━━━━━━━━━━━━░░░░    5/20  1x   │
└────────────────────────────────────────────────────────┘
```

### Auto-Scrolling

- **Code panel:** The active line is scrolled into view (`block: "center"`) when the step changes
- **Memory panel:** Priority 1: scroll to `[data-changed]` items. Priority 2: scroll to `[data-active-frame]`

---

## 12. Keyboard Shortcuts

### Visualizer

| Shortcut | Action |
|----------|--------|
| `→` Arrow Right | Next step |
| `←` Arrow Left | Previous step |
| `Space` | Next step |
| `Cmd+Z` / `Ctrl+Z` | Previous step (undo) |
| `Cmd+Shift+Z` / `Ctrl+Shift+Z` | Next step (redo) |
| `R` | Reset to step 1 |

### Code Editor

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` / `Ctrl+Enter` | Run & Visualize |
| `Tab` | Insert 4 spaces |
| `Shift+Tab` | Remove indentation |
| `Enter` | New line with auto-indent |
| `(`, `{`, `[` | Auto-close bracket |

---

## 13. Supported C++ Subset

### Types

- Primitives: `int`, `double`, `char`, `bool`, `void`
- Pointers: `Type*`, `Type**`
- Structs: `struct Name { ... };` with fields, arrays, nested structs
- Constructors: Initializer list syntax (`Name(args) : field(val), ... {}`)

### Statements

- Variable declaration: `int x = 5;`, `Node* p = new Node;`
- Assignment: `x = 10;`, `p->data = 42;`, `*p = 99;`
- `if` / `else if` / `else`
- `while` loops
- `for` loops (init; condition; update)
- `return`
- `new Type`, `new Type(args)`, `new Type[n]`
- `delete p`, `delete[] arr`
- `cout << ...` (parsed and skipped — no output)

### Expressions

- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Logical: `&&`, `||`, `!`
- Pointer ops: `*p` (dereference), `&x` (address-of), `p->field`, `obj.field`
- Array indexing: `arr[i]`
- Increment/decrement: `++i`, `i++`, `--i`, `i--`
- Compound assignment: `+=`, `-=`
- Function calls: `func(args)`

### Functions

- Return types: any supported type
- Parameters: by value and by reference (`Type& param`)
- Recursion: fully supported with proper stack frame management
- Nested calls: `f(g(x))` works correctly

### Not Supported

- Classes (only structs)
- Templates / generics
- Standard library (string, vector, map, etc.)
- Multiple return values
- Operator overloading
- Inheritance
- Exceptions (try/catch)
- File I/O
- Preprocessor directives (#include, #define)

---

## 14. Deployment

### Build

```bash
npm run build    # Next.js production build
```

### Deploy to Vercel

```bash
vercel --prod --yes
```

### GitHub Repository

https://github.com/tkflare1/memory-visualizer

### Environment

- Node.js 18+
- npm 9+
- No environment variables required
- No database
- No API keys
- Fully static export

---

## 15. How to Explain Each Feature to Students

### "What is this tool?"

> "This is a memory visualizer for C++ code. You paste any code that uses pointers, structs, linked lists, or recursion, and it shows you exactly what's happening in memory — step by step. Think of it like Python Tutor, but specifically designed for C++ pointer tracing problems like the ones we do in CS106B."

### "How does it work without a server?"

> "The entire C++ interpreter runs in your browser. When you click 'Run & Visualize', the code is tokenized, parsed into an AST, and executed by a tree-walking interpreter — all in TypeScript. No server, no compilation step, no API calls. That's why it's instant."

### "What are the boxes on the right?"

> "The left column is the **stack** — these are your local variables and function parameters. The right side is the **heap** — these are things you created with `new`. Each box shows the struct's fields and their current values. The small hex number in the corner is the memory address."

### "What do the arrows mean?"

> "Every arrow represents a pointer. It starts at the variable or field that holds the pointer, and points to the memory block it references. The color is consistent — the same pointer always has the same color. If you hover over an arrow, all other arrows fade out so you can see just that one relationship."

### "Why is that box red and says 'LEAKED'?"

> "That means this memory block has become **orphaned** — no pointer anywhere in your program can reach it anymore. In C++, this is a memory leak. The tool detects this automatically by walking all pointers from the stack through the heap. If a block isn't reachable, it's leaked."

### "How do I see recursion?"

> "Step through the code and watch the stack grow. Each recursive call adds a new frame at the top — you can see the parameters it was called with (like `head=→2`). The `if` condition shows `→ true` or `→ false` so you know whether it's the base case. When the function returns, the frame disappears and you see the caller's variables update."

### "What does the green glow mean?"

> "Green highlight means that value **just changed** in this step. It helps you immediately spot what's different from the previous step, especially in large diagrams like the Cats Problem."

### "Can I use this for my homework?"

> "Absolutely. Paste any code that uses the types and operations we cover in class — structs, pointers, `new`/`delete`, linked lists, recursion. The visualizer supports the same C++ subset we use. Just note it doesn't support the Stanford C++ library (Vector, Map, etc.) — it's pure C++ structs and pointers."

### "How do I navigate?"

> "Arrow keys step forward and back. Space also steps forward. Cmd+Z goes back (like undo), Cmd+Shift+Z goes forward (like redo). You can also click anywhere on the progress bar to jump to a specific step, or use the play button to auto-advance."

### "What's the difference between the while arrow and the if arrow?"

> "Both show the condition result — `→ true` or `→ false`. For `while` loops, you see this check **every iteration**, including the final `→ false` that exits the loop. For `if` statements, you see it once. This way you can follow exactly why a loop ran 3 times and then stopped."

### "Does it catch null pointer dereferences?"

> "Yes. If your code tries to dereference a null pointer (like `head->next` when `head` is nullptr), the visualizer will show a runtime error with a clear message: 'Null pointer dereference'. It also catches infinite loops (after 500 iterations) and excessive step counts (after 2000 steps)."

---

## Appendix A: Example Trace — Cats Problem

The Cats Problem from Stanford CS106B involves two structs (`Lion`, `Savanna`), an `explore()` function, and results in 2 memory leaks.

**18 Steps:**

| # | Event | Orphans | Key Visual Change |
|---|-------|---------|-------------------|
| 1 | Begin execution | 0 | Empty stack and heap |
| 2 | `Savanna* habitat = new Savanna[3]` | 0 | 3 Savanna blocks appear on heap |
| 3 | `habitat[1].giraffe = 3` | 0 | giraffe field glows green with value 3 |
| 4 | `habitat[1].kitten = nullptr` | 0 | kitten shows null badge |
| 5 | `habitat[0] = habitat[1]` | 0 | habitat[0] copies all fields from habitat[1] |
| 6 | Enter explore(prairie=→1) | 0 | New stack frame appears with prairie and leader |
| 7 | `Lion* leader = &(prairie->cat)` | 0 | leader points to habitat[0].cat |
| 8 | `leader->meow = new int` | 0 | New int block appears on heap |
| 9 | `*(leader->meow) = 2` | 0 | Heap int value changes to 2 |
| 10 | `prairie = new Savanna` | 0 | New Savanna block appears |
| 11 | `prairie->cat.roar = 6` | 0 | New Savanna's cat.roar = 6 |
| 12 | `prairie->kitten = leader` | 0 | New Savanna's kitten points to habitat[0].cat |
| 13 | `prairie->kitten->roar = 8` | 0 | habitat[0].cat.roar changes to 8 |
| 14 | `prairie->kitten->meow = &(purr[1])` | **1** | meow now points to purr[1]; heap int **LEAKED** |
| 15 | `leader->purr[0] = 4` | 1 | purr[0] = 4 |
| 16 | `return leader` | 1 | About to exit explore() |
| 17 | `habitat[2].kitten = explore(habitat)` | **2** | explore() frame gone; new Savanna **LEAKED** |
| 18 | `habitat[2].kitten->roar = 4` | 2 | Final state with 2 leaked blocks |

## Appendix B: Example Trace — Reverse Linked List

**20 Steps** showing full recursive descent and backtracking:

| # | Stack Depth | Event |
|---|-------------|-------|
| 1 | 1 (main) | Begin execution |
| 2 | 1 | Build node 1 |
| 3 | 1 | Build node 2 |
| 4 | 1 | Build node 3 |
| 5 | 2 | Enter reverseList(head=→1) |
| 6 | 2 | if → false (not base case) |
| 7 | 3 | Enter reverseList(head=→2) |
| 8 | 3 | if → false (not base case) |
| 9 | 4 | Enter reverseList(head=→3) |
| 10 | 4 | if → **true** (BASE CASE: head->next is null) |
| 11 | 4 | return head (→3) |
| 12 | 3 | p = reverseList result; depth back to 3 |
| 13 | 3 | head->next->next = head (node 3→next = node 2) |
| 14 | 3 | head->next = nullptr (node 2→next = null) |
| 15 | 3 | return p (→3) |
| 16 | 2 | p = reverseList result; depth back to 2 |
| 17 | 2 | head->next->next = head (node 2→next = node 1) |
| 18 | 2 | head->next = nullptr (node 1→next = null) |
| 19 | 2 | return p (→3) |
| 20 | 1 | result = reverseList(a); back in main |

---

*Document generated for the C++ Memory Visualizer project. For questions or contributions, see the GitHub repository.*
