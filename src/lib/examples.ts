export interface Example {
  title: string;
  description: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    title: "Simple Pointers",
    description: "Basic int pointers, new, dereference, and address-of.",
    code: `int* p = new int;
*p = 42;
int* q = p;
*q = 99;
int x = *p;
`,
  },
  {
    title: "Linked List — Build",
    description: "Build a singly-linked list with 3 nodes and traverse it.",
    code: `struct Node {
    int data;
    Node* next;
};

Node* head = new Node;
head->data = 1;
head->next = new Node;
head->next->data = 2;
head->next->next = new Node;
head->next->next->data = 3;
head->next->next->next = nullptr;

Node* curr = head;
`,
  },
  {
    title: "Linked List — Delete Node",
    description: "Remove the second node from a 3-node list.",
    code: `struct Node {
    int data;
    Node* next;
};

Node* head = new Node;
head->data = 10;
head->next = new Node;
head->next->data = 20;
head->next->next = new Node;
head->next->next->data = 30;
head->next->next->next = nullptr;

Node* toDelete = head->next;
head->next = toDelete->next;
delete toDelete;
`,
  },
  {
    title: "Cats Problem",
    description: "Classic Stanford CS106B pointer tracing with structs, arrays, and memory leaks.",
    code: `struct Lion {
    int roar;
    int* meow;
    int purr[2];
};

struct Savanna {
    int giraffe;
    Lion cat;
    Lion* kitten;
};

Lion* explore(Savanna* prairie) {
    Lion* leader = &(prairie->cat);
    leader->meow = new int;
    *(leader->meow) = 2;
    prairie = new Savanna;
    prairie->cat.roar = 6;
    prairie->kitten = leader;
    prairie->kitten->roar = 8;
    prairie->kitten->meow = &(prairie->kitten->purr[1]);
    leader->purr[0] = 4;
    return leader;
}

Savanna* habitat = new Savanna[3];
habitat[1].giraffe = 3;
habitat[1].kitten = nullptr;
habitat[0] = habitat[1];
habitat[2].kitten = explore(habitat);
habitat[2].kitten->roar = 4;
`,
  },
  {
    title: "Pointer Tracing — Functions",
    description: "Pass-by-value vs pass-by-reference with Node pointers.",
    code: `struct Node {
    int data;
    Node* next;
};

void changeData(Node* list) {
    list->data = 137;
}

void tryReassign(Node* list) {
    list = new Node;
    list->data = 42;
    list->next = nullptr;
}

void realReassign(Node*& list) {
    list->data = 99;
}

Node* head = new Node;
head->data = 1;
head->next = new Node;
head->next->data = 2;
head->next->next = nullptr;
changeData(head);
tryReassign(head);
realReassign(head);
`,
  },
  {
    title: "Array of Structs",
    description: "Allocate an array of structs and modify individual elements.",
    code: `struct Point {
    int x;
    int y;
};

Point* pts = new Point[3];
pts[0].x = 1;
pts[0].y = 2;
pts[1].x = 3;
pts[1].y = 4;
pts[2].x = 5;
pts[2].y = 6;
`,
  },
];
