import { Trace, MemoryItem, StackFrame, Step } from "@/types/memory";

export function buildCatsTrace(): Trace {
  const steps: Step[] = [];

  let stack: StackFrame[] = [];
  let heap: MemoryItem[] = [];

  function clone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  function find(id: string, items: MemoryItem[]): MemoryItem | null {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = find(id, item.children);
        if (found) return found;
      }
    }
    return null;
  }

  function h(id: string): MemoryItem {
    const item = find(id, heap);
    if (!item) throw new Error(`Heap item not found: ${id}`);
    return item;
  }

  function clearChanged(items: MemoryItem[]) {
    for (const item of items) {
      delete item.changed;
      if (item.children) clearChanged(item.children);
    }
  }

  function step(
    line: number,
    fn: string,
    explanation: string,
    callerLine?: number
  ) {
    steps.push({
      line,
      activeFunction: fn,
      explanation,
      callerLine,
      stack: clone(stack),
      heap: clone(heap),
    });
    clearChanged(heap);
    for (const frame of stack) clearChanged(frame.variables);
  }

  function makeSavanna(i: number): MemoryItem {
    return {
      id: `s${i}`,
      label: `Savanna [${i}]`,
      children: [
        { id: `s${i}_g`, label: "int giraffe", value: "?" },
        {
          id: `s${i}_cat`,
          label: "Lion cat",
          children: [
            { id: `s${i}_r`, label: "int roar", value: "?" },
            { id: `s${i}_m`, label: "int *meow", value: "?" },
            { id: `s${i}_p0`, label: "purr[0]", value: "?" },
            { id: `s${i}_p1`, label: "purr[1]", value: "?" },
          ],
        },
        { id: `s${i}_k`, label: "Lion *kitten", value: "?" },
      ],
    };
  }

  // Step 0: Enter kittens()
  stack = [{ name: "kittens", variables: [] }];
  step(0, "kittens", "Enter kittens() function.");

  // Step 1: Savanna *habitat = new Savanna[3]
  stack[0].variables = [
    {
      id: "habitat",
      label: "Savanna *habitat",
      pointsTo: "s0",
      changed: true,
    },
  ];
  heap = [makeSavanna(0), makeSavanna(1), makeSavanna(2)];
  step(
    1,
    "kittens",
    "Allocate an array of 3 Savannas on the heap. habitat points to the start of the array."
  );

  // Step 2: habitat[1].giraffe = 3
  h("s1_g").value = "3";
  h("s1_g").changed = true;
  step(2, "kittens", "Set habitat[1].giraffe to 3.");

  // Step 3: habitat[1].kitten = nullptr
  h("s1_k").value = "nullptr";
  h("s1_k").changed = true;
  step(3, "kittens", "Set habitat[1].kitten to nullptr.");

  // Step 4: habitat[0] = habitat[1] (struct copy)
  h("s0_g").value = "3";
  h("s0_g").changed = true;
  h("s0_k").value = "nullptr";
  h("s0_k").changed = true;
  step(
    4,
    "kittens",
    "Struct assignment: copy all fields of habitat[1] into habitat[0]. giraffe becomes 3, kitten becomes nullptr."
  );

  // Step 5: Enter explore(habitat)
  stack.push({
    name: "explore",
    variables: [
      {
        id: "prairie",
        label: "Savanna *prairie",
        pointsTo: "s0",
        changed: true,
      },
    ],
  });
  step(
    0,
    "explore",
    "Call explore(habitat). prairie is a copy of habitat, pointing to Savanna[0].",
    5
  );

  // Step 6: Lion *leader = &(prairie->cat)
  stack[1].variables.push({
    id: "leader",
    label: "Lion *leader",
    pointsTo: "s0_cat",
    changed: true,
  });
  step(
    1,
    "explore",
    "leader is set to the address of prairie->cat, which is habitat[0].cat.",
    5
  );

  // Step 7: leader->meow = new int
  heap.push({ id: "newint", label: "int", value: "?", changed: true });
  const meowCell = h("s0_m");
  delete meowCell.value;
  meowCell.pointsTo = "newint";
  meowCell.changed = true;
  step(
    2,
    "explore",
    "Allocate a new int on the heap. leader->meow (habitat[0].cat.meow) now points to it.",
    5
  );

  // Step 8: *(leader->meow) = 2
  h("newint").value = "2";
  h("newint").changed = true;
  step(
    3,
    "explore",
    "Dereference leader->meow and set the heap int to 2.",
    5
  );

  // Step 9: prairie = new Savanna
  heap.push({
    id: "newsav",
    label: "new Savanna",
    changed: true,
    children: [
      { id: "ns_g", label: "int giraffe", value: "?" },
      {
        id: "ns_cat",
        label: "Lion cat",
        children: [
          { id: "ns_r", label: "int roar", value: "?" },
          { id: "ns_m", label: "int *meow", value: "?" },
          { id: "ns_p0", label: "purr[0]", value: "?" },
          { id: "ns_p1", label: "purr[1]", value: "?" },
        ],
      },
      { id: "ns_k", label: "Lion *kitten", value: "?" },
    ],
  });
  stack[1].variables[0].pointsTo = "newsav";
  stack[1].variables[0].changed = true;
  step(
    4,
    "explore",
    "Allocate a new Savanna on the heap. prairie now points to it — no longer to habitat[0].",
    5
  );

  // Step 10: prairie->cat.roar = 6
  h("ns_r").value = "6";
  h("ns_r").changed = true;
  step(
    5,
    "explore",
    "Set prairie->cat.roar to 6 (in the newly allocated Savanna).",
    5
  );

  // Step 11: prairie->kitten = leader
  const nsKitten = h("ns_k");
  delete nsKitten.value;
  nsKitten.pointsTo = "s0_cat";
  nsKitten.changed = true;
  step(
    6,
    "explore",
    "Set prairie->kitten to leader, which points to habitat[0].cat.",
    5
  );

  // Step 12: prairie->kitten->roar = 8
  h("s0_r").value = "8";
  h("s0_r").changed = true;
  step(
    7,
    "explore",
    "prairie->kitten points to habitat[0].cat — set its roar to 8.",
    5
  );

  // Step 13: prairie->kitten->meow = &(prairie->kitten->purr[1])
  h("s0_m").pointsTo = "s0_p1";
  h("s0_m").changed = true;
  h("newint").orphaned = true;
  step(
    8,
    "explore",
    "meow now points to purr[1] instead of the heap int. The heap int (value 2) is now orphaned — memory leak!",
    5
  );

  // Step 14: leader->purr[0] = 4
  h("s0_p0").value = "4";
  h("s0_p0").changed = true;
  step(
    9,
    "explore",
    "Set leader->purr[0] (habitat[0].cat.purr[0]) to 4.",
    5
  );

  // Step 15: return leader — back to kittens
  stack.pop();
  const s2k = h("s2_k");
  delete s2k.value;
  s2k.pointsTo = "s0_cat";
  s2k.changed = true;
  h("newsav").orphaned = true;
  step(
    5,
    "kittens",
    "explore() returns leader (pointer to habitat[0].cat). habitat[2].kitten receives this pointer. The new Savanna is now also orphaned."
  );

  // Step 16: habitat[2].kitten->roar = 4
  h("s0_r").value = "4";
  h("s0_r").changed = true;
  step(
    6,
    "kittens",
    "habitat[2].kitten points to habitat[0].cat — set roar to 4."
  );

  // Step 17: Final state
  step(
    7,
    "kittens",
    "Final state. Two memory blocks are orphaned (leaked): the heap int and the new Savanna. No pointers can reach them."
  );

  return {
    title: "The Cats Problem",
    description:
      "A classic Stanford CS pointer tracing exercise with structs, arrays, and dynamic memory allocation.",
    structs: [
      "struct Lion {",
      "    int roar;",
      "    int *meow;",
      "    int purr[2];",
      "};",
      "",
      "struct Savanna {",
      "    int giraffe;",
      "    Lion cat;",
      "    Lion *kitten;",
      "};",
    ].join("\n"),
    functions: [
      {
        name: "kittens",
        lines: [
          "void kittens() {",
          "    Savanna *habitat = new Savanna[3];",
          "    habitat[1].giraffe = 3;",
          "    habitat[1].kitten = nullptr;",
          "    habitat[0] = habitat[1];",
          "    habitat[2].kitten = explore(habitat);",
          "    habitat[2].kitten->roar = 4;",
          "}",
        ],
      },
      {
        name: "explore",
        lines: [
          "Lion *explore(Savanna *prairie) {",
          "    Lion *leader = &(prairie->cat);",
          "    leader->meow = new int;",
          "    *(leader->meow) = 2;",
          "    prairie = new Savanna;",
          "    prairie->cat.roar = 6;",
          "    prairie->kitten = leader;",
          "    prairie->kitten->roar = 8;",
          "    prairie->kitten->meow = &(prairie->kitten->purr[1]);",
          "    leader->purr[0] = 4;",
          "    return leader;",
          "}",
        ],
      },
    ],
    steps,
  };
}
