import type { Trace, Step, MemoryItem, StackFrame, CodeFunction } from "@/types/memory";

// ============================================================
// TOKENIZER
// ============================================================

enum TT {
  // Keywords
  Struct, Int, Void, Bool, Char, Double,
  New, Delete, Nullptr, While, For, If, Else, Return,
  True, False, Cout, Endl,
  // Literals & identifiers
  IntLit, Ident,
  // Multi-char operators
  Arrow, Eq, Neq, Lte, Gte, And, Or, PlusPlus, MinusMinus, PlusEq, MinusEq,
  ScopeRes,
  // Single-char
  LBrace, RBrace, LParen, RParen, LBracket, RBracket,
  Semi, Comma, Dot, Assign,
  Plus, Minus, Star, Slash, Percent, Amp, Lt, Gt, Not, Colon,
  // Special
  Eof,
}

interface Token { type: TT; value: string; line: number; }

const KEYWORDS: Record<string, TT> = {
  struct: TT.Struct, int: TT.Int, void: TT.Void, bool: TT.Bool,
  char: TT.Char, double: TT.Double, new: TT.New, delete: TT.Delete,
  nullptr: TT.Nullptr, while: TT.While, for: TT.For, if: TT.If,
  else: TT.Else, return: TT.Return, true: TT.True, false: TT.False,
  cout: TT.Cout, endl: TT.Endl,
};

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0, line = 1;
  while (i < code.length) {
    const c = code[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (code[i] === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (code[i] === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
    const two = code.substring(i, i + 2);
    const twoMap: Record<string, TT> = {
      '->': TT.Arrow, '==': TT.Eq, '!=': TT.Neq, '<=': TT.Lte,
      '>=': TT.Gte, '&&': TT.And, '||': TT.Or, '++': TT.PlusPlus,
      '--': TT.MinusMinus, '+=': TT.PlusEq, '-=': TT.MinusEq,
      '::': TT.ScopeRes,
    };
    if (two in twoMap) {
      tokens.push({ type: twoMap[two], value: two, line });
      i += 2; continue;
    }
    const oneMap: Record<string, TT> = {
      '{': TT.LBrace, '}': TT.RBrace, '(': TT.LParen, ')': TT.RParen,
      '[': TT.LBracket, ']': TT.RBracket, ';': TT.Semi, ',': TT.Comma,
      '.': TT.Dot, '=': TT.Assign, '+': TT.Plus, '-': TT.Minus,
      '*': TT.Star, '/': TT.Slash, '%': TT.Percent, '&': TT.Amp,
      '<': TT.Lt, '>': TT.Gt, '!': TT.Not, ':': TT.Colon,
    };
    if (c in oneMap) {
      tokens.push({ type: oneMap[c], value: c, line });
      i++; continue;
    }
    if (c >= '0' && c <= '9') {
      let s = i;
      while (i < code.length && code[i] >= '0' && code[i] <= '9') i++;
      tokens.push({ type: TT.IntLit, value: code.substring(s, i), line });
      continue;
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let s = i;
      while (i < code.length && (/[a-zA-Z0-9_]/).test(code[i])) i++;
      const word = code.substring(s, i);
      tokens.push({ type: word in KEYWORDS ? KEYWORDS[word] : TT.Ident, value: word, line });
      continue;
    }
    if (c === '"') {
      let s = i; i++;
      while (i < code.length && code[i] !== '"') { if (code[i] === '\\') i++; i++; }
      i++;
      tokens.push({ type: TT.Ident, value: code.substring(s, i), line });
      continue;
    }
    i++;
  }
  tokens.push({ type: TT.Eof, value: '', line });
  return tokens;
}

// ============================================================
// PARSER - AST node types as plain objects
// ============================================================

type Expr = Record<string, any>;
type Stmt = Record<string, any>;

interface StructField { type: string; name: string; arraySize: number | null; }
interface ConstructorDef { params: ParamDef[]; initList: { field: string; value: Expr }[]; }
interface StructDef { name: string; fields: StructField[]; constructors: ConstructorDef[]; }
interface ParamDef { type: string; isRef: boolean; name: string; }
interface FuncDef { name: string; returnType: string; params: ParamDef[]; body: Stmt[]; bodyLines: string[]; }
interface Program { structs: Record<string, StructDef>; functions: Record<string, FuncDef>; main: Stmt[]; }

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) { this.tokens = tokens; }

  peek(): Token { return this.tokens[this.pos]; }
  advance(): Token { return this.tokens[this.pos++]; }
  expect(t: TT): Token {
    const tok = this.advance();
    if (tok.type !== t) throw new Error(`Expected ${t}, got "${tok.value}" at line ${tok.line}`);
    return tok;
  }
  match(t: TT): Token | null {
    if (this.peek().type === t) return this.advance();
    return null;
  }
  at(t: TT): boolean { return this.peek().type === t; }

  parseProgram(): Program {
    const structs: Record<string, StructDef> = {};
    const functions: Record<string, FuncDef> = {};
    const main: Stmt[] = [];
    while (!this.at(TT.Eof)) {
      if (this.at(TT.Struct) && this.isStructDef()) {
        const s = this.parseStructDef();
        structs[s.name] = s;
      } else if (this.isFuncDef()) {
        const f = this.parseFuncDef();
        functions[f.name] = f;
      } else {
        main.push(this.parseStatement());
      }
    }
    return { structs, functions, main };
  }

  private isStructDef(): boolean {
    if (!this.at(TT.Struct)) return false;
    const saved = this.pos;
    this.advance();
    if (!this.at(TT.Ident)) { this.pos = saved; return false; }
    this.advance();
    const result = this.at(TT.LBrace);
    this.pos = saved;
    return result;
  }

  private isFuncDef(): boolean {
    const saved = this.pos;
    try {
      this.parseType();
      if (!this.at(TT.Ident)) { this.pos = saved; return false; }
      this.advance();
      const result = this.at(TT.LParen);
      this.pos = saved;
      return result;
    } catch { this.pos = saved; return false; }
  }

  private isVarDecl(): boolean {
    const saved = this.pos;
    try {
      const firstTok = this.peek();
      if (firstTok.type === TT.Int || firstTok.type === TT.Bool ||
          firstTok.type === TT.Char || firstTok.type === TT.Double ||
          firstTok.type === TT.Void) {
        this.advance();
        while (this.at(TT.Star)) this.advance();
        const r = this.at(TT.Ident);
        this.pos = saved; return r;
      }
      if (firstTok.type === TT.Ident) {
        this.advance();
        if (this.at(TT.Star)) {
          while (this.at(TT.Star)) this.advance();
          const r = this.at(TT.Ident); this.pos = saved; return r;
        }
        if (this.at(TT.Ident)) { this.pos = saved; return true; }
        this.pos = saved; return false;
      }
      this.pos = saved; return false;
    } catch { this.pos = saved; return false; }
  }

  parseType(): string {
    const tok = this.advance();
    let base: string;
    if (tok.type === TT.Int || tok.type === TT.Void || tok.type === TT.Bool ||
        tok.type === TT.Char || tok.type === TT.Double) {
      base = tok.value;
    } else if (tok.type === TT.Ident) {
      base = tok.value;
    } else {
      throw new Error(`Expected type, got "${tok.value}" at line ${tok.line}`);
    }
    while (this.at(TT.Star)) { this.advance(); base += '*'; }
    return base;
  }

  parseStructDef(): StructDef {
    this.expect(TT.Struct);
    const name = this.expect(TT.Ident).value;
    this.expect(TT.LBrace);
    const fields: StructField[] = [];
    const constructors: ConstructorDef[] = [];
    while (!this.at(TT.RBrace) && !this.at(TT.Eof)) {
      // Destructor: ~StructName() { ... } — skip entirely
      if (this.at(TT.Not) || (this.at(TT.Minus) && this.tokens[this.pos + 1]?.value === name)) {
        this.skipUntilAfterBrace();
        continue;
      }
      // Constructor: StructName( ... ) [: init_list] { ... }
      if (this.at(TT.Ident) && this.peek().value === name) {
        const saved = this.pos;
        this.advance();
        if (this.at(TT.LParen)) {
          constructors.push(this.parseConstructorBody());
          continue;
        }
        this.pos = saved;
      }
      // Regular field declaration
      const ft = this.parseType();
      const fn = this.expect(TT.Ident).value;
      let arrSize: number | null = null;
      if (this.match(TT.LBracket)) {
        arrSize = parseInt(this.expect(TT.IntLit).value);
        this.expect(TT.RBracket);
      }
      this.expect(TT.Semi);
      fields.push({ type: ft, name: fn, arraySize: arrSize });
    }
    this.expect(TT.RBrace);
    this.expect(TT.Semi);
    return { name, fields, constructors };
  }

  private parseConstructorBody(): ConstructorDef {
    this.expect(TT.LParen);
    const params: ParamDef[] = [];
    if (!this.at(TT.RParen)) {
      params.push(this.parseParam());
      while (this.match(TT.Comma)) params.push(this.parseParam());
    }
    this.expect(TT.RParen);

    const initList: { field: string; value: Expr }[] = [];
    if (this.match(TT.Colon)) {
      do {
        const field = this.expect(TT.Ident).value;
        this.expect(TT.LParen);
        const value = this.parseExpr();
        this.expect(TT.RParen);
        initList.push({ field, value });
      } while (this.match(TT.Comma));
    }

    // Skip constructor body { ... }
    this.expect(TT.LBrace);
    let depth = 1;
    while (depth > 0 && !this.at(TT.Eof)) {
      if (this.at(TT.LBrace)) depth++;
      if (this.at(TT.RBrace)) depth--;
      if (depth > 0) this.advance();
    }
    this.expect(TT.RBrace);

    return { params, initList };
  }

  private skipUntilAfterBrace() {
    while (!this.at(TT.LBrace) && !this.at(TT.Eof)) this.advance();
    if (this.at(TT.LBrace)) {
      this.advance();
      let depth = 1;
      while (depth > 0 && !this.at(TT.Eof)) {
        if (this.at(TT.LBrace)) depth++;
        if (this.at(TT.RBrace)) depth--;
        if (depth > 0) this.advance();
      }
      if (this.at(TT.RBrace)) this.advance();
    }
  }

  parseFuncDef(): FuncDef {
    const retType = this.parseType();
    const name = this.expect(TT.Ident).value;
    this.expect(TT.LParen);
    const params: ParamDef[] = [];
    if (!this.at(TT.RParen)) {
      params.push(this.parseParam());
      while (this.match(TT.Comma)) params.push(this.parseParam());
    }
    this.expect(TT.RParen);
    const body = this.parseBlock();
    return { name, returnType: retType, params, body, bodyLines: [] };
  }

  private parseParam(): ParamDef {
    const pt = this.parseType();
    const isRef = !!this.match(TT.Amp);
    const pn = this.expect(TT.Ident).value;
    return { type: pt, isRef, name: pn };
  }

  parseBlock(): Stmt[] {
    this.expect(TT.LBrace);
    const stmts: Stmt[] = [];
    while (!this.at(TT.RBrace) && !this.at(TT.Eof)) stmts.push(this.parseStatement());
    this.expect(TT.RBrace);
    return stmts;
  }

  parseStatement(): Stmt {
    const tok = this.peek();
    if (tok.type === TT.While) return this.parseWhile();
    if (tok.type === TT.For) return this.parseFor();
    if (tok.type === TT.If) return this.parseIf();
    if (tok.type === TT.Return) return this.parseReturn();
    if (tok.type === TT.Delete) return this.parseDelete();
    if (tok.type === TT.LBrace) return { kind: 'block', body: this.parseBlock(), line: tok.line };
    if (this.isVarDecl()) return this.parseVarDecl();
    // cout statement - skip it
    if (tok.type === TT.Cout) {
      this.advance();
      while (!this.at(TT.Semi) && !this.at(TT.Eof)) this.advance();
      this.expect(TT.Semi);
      return { kind: 'noop', line: tok.line };
    }
    const expr = this.parseExpr();
    if (this.match(TT.Assign)) {
      const val = this.parseExpr();
      this.expect(TT.Semi);
      return { kind: 'assign', target: expr, value: val, line: tok.line };
    }
    if (this.match(TT.PlusEq)) {
      const val = this.parseExpr();
      this.expect(TT.Semi);
      return { kind: 'assign', target: expr, value: { kind: 'binop', op: '+', left: expr, right: val }, line: tok.line };
    }
    if (this.match(TT.MinusEq)) {
      const val = this.parseExpr();
      this.expect(TT.Semi);
      return { kind: 'assign', target: expr, value: { kind: 'binop', op: '-', left: expr, right: val }, line: tok.line };
    }
    this.expect(TT.Semi);
    return { kind: 'expr_stmt', expr, line: tok.line };
  }

  parseVarDecl(): Stmt {
    const line = this.peek().line;
    const vtype = this.parseType();
    const name = this.expect(TT.Ident).value;
    let init: Expr | null = null;
    if (this.match(TT.Assign)) init = this.parseExpr();
    this.expect(TT.Semi);
    return { kind: 'var_decl', varType: vtype, name, init, line };
  }

  parseWhile(): Stmt {
    const line = this.peek().line;
    this.expect(TT.While);
    this.expect(TT.LParen);
    const cond = this.parseExpr();
    this.expect(TT.RParen);
    const body = this.at(TT.LBrace) ? this.parseBlock() : [this.parseStatement()];
    return { kind: 'while', cond, body, line };
  }

  parseFor(): Stmt {
    const line = this.peek().line;
    this.expect(TT.For);
    this.expect(TT.LParen);
    let init: Stmt | null = null;
    if (!this.at(TT.Semi)) init = this.isVarDecl() ? this.parseVarDecl() : this.parseStatement();
    else this.expect(TT.Semi);
    let cond: Expr | null = null;
    if (!this.at(TT.Semi)) cond = this.parseExpr();
    this.expect(TT.Semi);
    let update: Stmt | null = null;
    if (!this.at(TT.RParen)) {
      const expr = this.parseExpr();
      if (this.match(TT.Assign)) {
        const val = this.parseExpr();
        update = { kind: 'assign', target: expr, value: val, line };
      } else if (this.match(TT.PlusEq)) {
        const val = this.parseExpr();
        update = { kind: 'assign', target: expr, value: { kind: 'binop', op: '+', left: expr, right: val }, line };
      } else {
        update = { kind: 'expr_stmt', expr, line };
      }
    }
    this.expect(TT.RParen);
    const body = this.at(TT.LBrace) ? this.parseBlock() : [this.parseStatement()];
    return { kind: 'for', init, cond, update, body, line };
  }

  parseIf(): Stmt {
    const line = this.peek().line;
    this.expect(TT.If);
    this.expect(TT.LParen);
    const cond = this.parseExpr();
    this.expect(TT.RParen);
    const then = this.at(TT.LBrace) ? this.parseBlock() : [this.parseStatement()];
    let els: Stmt[] | null = null;
    if (this.match(TT.Else)) {
      els = this.at(TT.If) ? [this.parseIf()] : (this.at(TT.LBrace) ? this.parseBlock() : [this.parseStatement()]);
    }
    return { kind: 'if', cond, then, else: els, line };
  }

  parseReturn(): Stmt {
    const line = this.peek().line;
    this.expect(TT.Return);
    let val: Expr | null = null;
    if (!this.at(TT.Semi)) val = this.parseExpr();
    this.expect(TT.Semi);
    return { kind: 'return', value: val, line };
  }

  parseDelete(): Stmt {
    const line = this.peek().line;
    this.expect(TT.Delete);
    let isArray = false;
    if (this.match(TT.LBracket)) { this.expect(TT.RBracket); isArray = true; }
    const expr = this.parseExpr();
    this.expect(TT.Semi);
    return { kind: 'delete', isArray, expr, line };
  }

  // Expression parsing with operator precedence
  parseExpr(): Expr { return this.parseOr(); }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.at(TT.Or)) { this.advance(); left = { kind: 'binop', op: '||', left, right: this.parseAnd() }; }
    return left;
  }
  private parseAnd(): Expr {
    let left = this.parseEquality();
    while (this.at(TT.And)) { this.advance(); left = { kind: 'binop', op: '&&', left, right: this.parseEquality() }; }
    return left;
  }
  private parseEquality(): Expr {
    let left = this.parseComparison();
    while (this.at(TT.Eq) || this.at(TT.Neq)) {
      const op = this.advance().value; left = { kind: 'binop', op, left, right: this.parseComparison() };
    }
    return left;
  }
  private parseComparison(): Expr {
    let left = this.parseAdditive();
    while (this.at(TT.Lt) || this.at(TT.Gt) || this.at(TT.Lte) || this.at(TT.Gte)) {
      const op = this.advance().value; left = { kind: 'binop', op, left, right: this.parseAdditive() };
    }
    return left;
  }
  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.at(TT.Plus) || this.at(TT.Minus)) {
      const op = this.advance().value; left = { kind: 'binop', op, left, right: this.parseMultiplicative() };
    }
    return left;
  }
  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    while (this.at(TT.Star) || this.at(TT.Slash) || this.at(TT.Percent)) {
      const op = this.advance().value; left = { kind: 'binop', op, left, right: this.parseUnary() };
    }
    return left;
  }
  private parseUnary(): Expr {
    if (this.at(TT.Not)) { this.advance(); return { kind: 'unop', op: '!', expr: this.parseUnary() }; }
    if (this.at(TT.Star)) { this.advance(); return { kind: 'deref', expr: this.parseUnary() }; }
    if (this.at(TT.Amp)) { this.advance(); return { kind: 'addr_of', expr: this.parseUnary() }; }
    if (this.at(TT.Minus)) { this.advance(); return { kind: 'unop', op: '-', expr: this.parseUnary() }; }
    if (this.at(TT.PlusPlus)) { this.advance(); return { kind: 'pre_inc', expr: this.parseUnary() }; }
    if (this.at(TT.MinusMinus)) { this.advance(); return { kind: 'pre_dec', expr: this.parseUnary() }; }
    return this.parsePostfix();
  }
  private parsePostfix(): Expr {
    let expr = this.parsePrimary();
    for (;;) {
      if (this.at(TT.Arrow)) {
        this.advance();
        expr = { kind: 'arrow', ptr: expr, field: this.expect(TT.Ident).value };
      } else if (this.at(TT.Dot)) {
        this.advance();
        expr = { kind: 'member', obj: expr, field: this.expect(TT.Ident).value };
      } else if (this.at(TT.LBracket)) {
        this.advance();
        const idx = this.parseExpr();
        this.expect(TT.RBracket);
        expr = { kind: 'index', array: expr, index: idx };
      } else if (this.at(TT.LParen) && expr.kind === 'var_ref') {
        this.advance();
        const args: Expr[] = [];
        if (!this.at(TT.RParen)) {
          args.push(this.parseExpr());
          while (this.match(TT.Comma)) args.push(this.parseExpr());
        }
        this.expect(TT.RParen);
        expr = { kind: 'call', name: expr.name, args };
      } else if (this.at(TT.PlusPlus)) {
        this.advance(); expr = { kind: 'post_inc', expr };
      } else if (this.at(TT.MinusMinus)) {
        this.advance(); expr = { kind: 'post_dec', expr };
      } else break;
    }
    return expr;
  }
  private parsePrimary(): Expr {
    const tok = this.peek();
    if (tok.type === TT.IntLit) { this.advance(); return { kind: 'int_lit', value: parseInt(tok.value) }; }
    if (tok.type === TT.Nullptr) { this.advance(); return { kind: 'nullptr' }; }
    if (tok.type === TT.True) { this.advance(); return { kind: 'bool_lit', value: true }; }
    if (tok.type === TT.False) { this.advance(); return { kind: 'bool_lit', value: false }; }
    if (tok.type === TT.Ident) { this.advance(); return { kind: 'var_ref', name: tok.value }; }
    if (tok.type === TT.LParen) {
      this.advance();
      const expr = this.parseExpr();
      this.expect(TT.RParen);
      return expr;
    }
    if (tok.type === TT.New) {
      this.advance();
      const typeName = this.advance().value;
      if (this.at(TT.LBracket)) {
        this.advance();
        const size = this.parseExpr();
        this.expect(TT.RBracket);
        return { kind: 'new_array', type: typeName, size };
      }
      if (this.at(TT.LParen)) {
        this.advance();
        const args: Expr[] = [];
        if (!this.at(TT.RParen)) {
          args.push(this.parseExpr());
          while (this.match(TT.Comma)) args.push(this.parseExpr());
        }
        this.expect(TT.RParen);
        return { kind: 'new_obj', type: typeName, args };
      }
      return { kind: 'new_obj', type: typeName, args: [] };
    }
    throw new Error(`Unexpected token "${tok.value}" at line ${tok.line}`);
  }
}

// ============================================================
// EXECUTOR - Memory model and tree-walking interpreter
// ============================================================

type Value = number | boolean | string | null | StructValue | Value[];
interface StructValue { __type: string; [field: string]: Value; }
interface Ref { container: Record<string, any> | any[]; key: string | number; }
class ReturnSignal { constructor(public value: Value) {} }

const MAX_STEPS = 2000;
const MAX_LOOP = 500;

class Executor {
  structDefs: Record<string, StructDef> = {};
  funcDefs: Record<string, FuncDef> = {};
  stack: { name: string; vars: Record<string, Value>; types: Record<string, string> }[] = [];
  heap: Record<string, Value> = {};
  private nextAddr = 1;
  steps: { line: number; fn: string; callerLine?: number; explanation: string;
    stack: any[]; heap: Record<string, Value>; }[] = [];
  private stepCount = 0;
  private callStack: { fn: string; callerLine: number }[] = [];
  private codeLines: string[] = [];
  freed: Set<string> = new Set();

  constructor(private program: Program, codeLines: string[]) {
    this.structDefs = program.structs;
    this.funcDefs = program.functions;
    this.codeLines = codeLines;
  }

  run() {
    this.stack.push({ name: 'main', vars: {}, types: {} });
    this.snapshot(0, 'Begin execution');
    try {
      this.execBlock(this.program.main, 'main');
    } catch (e: any) {
      if (e instanceof ReturnSignal) { /* ok */ }
      else {
        this.snapshot(0, `Runtime error: ${e.message}`);
        throw e;
      }
    }
  }

  private alloc(val: Value): string {
    const addr = `${this.nextAddr++}`;
    this.heap[addr] = val;
    return addr;
  }

  defaultValue(typeStr: string): Value {
    const base = typeStr.replace(/\*/g, '');
    if (typeStr.includes('*')) return null;
    if (base === 'int' || base === 'double' || base === 'char') return null;
    if (base === 'bool') return null;
    if (base in this.structDefs) return this.makeStruct(base);
    return null;
  }

  makeStruct(typeName: string): StructValue {
    const sd = this.structDefs[typeName];
    if (!sd) throw new Error(`Unknown struct type: ${typeName}`);
    const obj: StructValue = { __type: typeName };
    for (const f of sd.fields) {
      if (f.arraySize !== null) {
        obj[f.name] = Array.from({ length: f.arraySize }, () => this.defaultValue(f.type));
      } else if (!f.type.includes('*') && f.type in this.structDefs) {
        obj[f.name] = this.makeStruct(f.type);
      } else {
        obj[f.name] = this.defaultValue(f.type);
      }
    }
    return obj;
  }

  private frame() { return this.stack[this.stack.length - 1]; }
  private activeFn() { return this.callStack.length > 0 ? this.callStack[this.callStack.length - 1].fn : 'main'; }
  private callerLine() { return this.callStack.length > 0 ? this.callStack[this.callStack.length - 1].callerLine : undefined; }

  private snapshot(line: number, explanation: string) {
    if (this.stepCount++ > MAX_STEPS) throw new Error('Execution limit exceeded (too many steps)');
    // Resolve __isRef vars to their actual values before snapshotting
    const snapshotStack = this.stack.map(frame => {
      const vars: Record<string, Value> = {};
      const types: Record<string, string> = { ...frame.types };
      const refKeys: string[] = [];
      for (const [k, v] of Object.entries(frame.vars)) {
        if (v && typeof v === 'object' && '__isRef' in (v as any)) {
          vars[k] = (v as any).container[(v as any).key];
          refKeys.push(k);
        } else {
          vars[k] = v;
        }
      }
      return { name: frame.name, vars, types, refKeys };
    });
    this.steps.push({
      line, fn: this.activeFn(), callerLine: this.callerLine(), explanation,
      stack: JSON.parse(JSON.stringify(snapshotStack)),
      heap: JSON.parse(JSON.stringify(this.heap)),
    });
  }

  private deref(addr: string): Value {
    if (!addr) throw new Error('Null pointer dereference');
    const parts = addr.split('.');
    let obj: any = this.heap[parts[0]];
    if (obj === undefined) throw new Error(`Invalid memory access at address ${addr}`);
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      if (obj && typeof obj === 'object' && '__elements' in obj) {
        obj = obj.__elements[parseInt(p)];
      } else if (Array.isArray(obj)) {
        obj = obj[parseInt(p)];
      } else if (obj && typeof obj === 'object') {
        obj = obj[p];
      } else {
        throw new Error(`Cannot access sub-field "${p}" of ${typeof obj}`);
      }
    }
    return obj;
  }

  private derefForArrow(addr: string): any {
    if (!addr) throw new Error('Null pointer dereference');
    const parts = addr.split('.');
    let obj: any = this.heap[parts[0]];
    if (obj === undefined) throw new Error(`Invalid memory access at address ${addr}`);
    if (typeof obj === 'object' && obj && '__elements' in obj) {
      if (parts.length === 1) return obj.__elements[0];
      let cur: any = obj.__elements[parseInt(parts[1])];
      for (let i = 2; i < parts.length; i++) {
        if (Array.isArray(cur)) cur = cur[parseInt(parts[i])];
        else if (typeof cur === 'object' && cur) cur = cur[parts[i]];
      }
      return cur;
    }
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      if (Array.isArray(obj)) obj = obj[parseInt(p)];
      else if (typeof obj === 'object' && obj) obj = obj[p];
    }
    return obj;
  }

  private refAt(addr: string): Ref {
    const parts = addr.split('.');
    if (parts.length === 1) return { container: this.heap, key: parts[0] };
    let obj: any = this.heap[parts[0]];
    if (typeof obj === 'object' && obj && '__elements' in obj) {
      let cur: any = obj.__elements;
      for (let i = 1; i < parts.length - 1; i++) {
        const p = parts[i];
        if (Array.isArray(cur)) cur = cur[parseInt(p)];
        else if (typeof cur === 'object' && cur) cur = cur[p];
      }
      const last = parts[parts.length - 1];
      return { container: cur, key: Array.isArray(cur) ? parseInt(last) : last };
    }
    let cur: any = obj;
    for (let i = 1; i < parts.length - 1; i++) {
      const p = parts[i];
      if (Array.isArray(cur)) cur = cur[parseInt(p)];
      else if (typeof cur === 'object' && cur) cur = cur[p];
    }
    const last = parts[parts.length - 1];
    return { container: cur, key: Array.isArray(cur) ? parseInt(last) : last };
  }

  resolveRef(expr: Expr): Ref {
    if (expr.kind === 'var_ref') {
      for (let i = this.stack.length - 1; i >= 0; i--) {
        if (expr.name in this.stack[i].vars) return { container: this.stack[i].vars, key: expr.name };
      }
      throw new Error(`Undefined variable: ${expr.name}`);
    }
    if (expr.kind === 'arrow') {
      const ptrVal = this.evalExpr(expr.ptr) as string;
      if (!ptrVal) throw new Error('Null pointer dereference');
      const obj = this.derefForArrow(ptrVal);
      if (typeof obj !== 'object' || obj === null) throw new Error('Cannot use -> on non-struct');
      return { container: obj, key: expr.field };
    }
    if (expr.kind === 'member') {
      const ref = this.resolveRef(expr.obj);
      const obj = (ref.container as any)[ref.key];
      if (typeof obj !== 'object' || obj === null) throw new Error('Cannot use . on non-struct');
      return { container: obj, key: expr.field };
    }
    if (expr.kind === 'index') {
      const baseVal = this.evalExpr(expr.array);
      const idx = this.evalExpr(expr.index) as number;
      if (typeof baseVal === 'string') {
        const obj = this.heap[baseVal];
        if (obj && typeof obj === 'object' && '__elements' in (obj as any)) {
          return { container: (obj as any).__elements, key: idx };
        }
      }
      if (Array.isArray(baseVal)) return { container: baseVal, key: idx };
      throw new Error(`Cannot index into ${typeof baseVal}`);
    }
    if (expr.kind === 'deref') {
      const addr = this.evalExpr(expr.expr) as string;
      return this.refAt(addr);
    }
    throw new Error(`Not an lvalue: ${expr.kind}`);
  }

  evalExpr(expr: Expr): Value {
    switch (expr.kind) {
      case 'int_lit': return expr.value;
      case 'nullptr': return null;
      case 'bool_lit': return expr.value;
      case 'var_ref': {
        for (let i = this.stack.length - 1; i >= 0; i--) {
          const f = this.stack[i];
          if (expr.name in f.vars) {
            const v = f.vars[expr.name];
            if (v && typeof v === 'object' && '__isRef' in (v as any)) {
              return ((v as any).container as any)[(v as any).key];
            }
            return v;
          }
        }
        throw new Error(`Undefined variable: ${expr.name}`);
      }
      case 'arrow': {
        const ptrVal = this.evalExpr(expr.ptr) as string;
        const obj = this.derefForArrow(ptrVal);
        if (typeof obj !== 'object' || obj === null) throw new Error(`Cannot use -> on ${typeof obj}`);
        return (obj as any)[expr.field];
      }
      case 'member': {
        const obj = this.evalExpr(expr.obj);
        if (typeof obj !== 'object' || obj === null) throw new Error('Cannot use . on non-object');
        return (obj as any)[expr.field];
      }
      case 'index': {
        const base = this.evalExpr(expr.array);
        const idx = this.evalExpr(expr.index) as number;
        if (typeof base === 'string') {
          const heapObj = this.heap[base];
          if (heapObj && typeof heapObj === 'object' && '__elements' in (heapObj as any)) {
            return (heapObj as any).__elements[idx];
          }
        }
        if (Array.isArray(base)) return base[idx];
        throw new Error(`Cannot index into ${typeof base}`);
      }
      case 'deref': {
        const addr = this.evalExpr(expr.expr) as string;
        return this.deref(addr);
      }
      case 'addr_of': return this.computeAddr(expr.expr);
      case 'new_obj': {
        const tn = expr.type;
        let val: Value;
        if (tn in this.structDefs) {
          val = this.makeStruct(tn);
          const sd = this.structDefs[tn];
          const ctor = sd.constructors?.find(c => c.params.length === expr.args.length);
          if (ctor && ctor.initList.length > 0) {
            // Push temporary frame with constructor params so init expressions resolve
            const ctorFrame: { name: string; vars: Record<string, Value>; types: Record<string, string> } =
              { name: '__ctor', vars: {}, types: {} };
            for (let i = 0; i < ctor.params.length; i++) {
              ctorFrame.vars[ctor.params[i].name] = this.evalExpr(expr.args[i]);
              ctorFrame.types[ctor.params[i].name] = ctor.params[i].type;
            }
            this.stack.push(ctorFrame);
            for (const init of ctor.initList) {
              (val as any)[init.field] = this.evalExpr(init.value);
            }
            this.stack.pop();
          } else if (expr.args.length > 0) {
            const fields = sd.fields;
            for (let i = 0; i < Math.min(expr.args.length, fields.length); i++) {
              (val as any)[fields[i].name] = this.evalExpr(expr.args[i]);
            }
          }
        } else if (tn === 'int' || tn === 'double' || tn === 'char') {
          val = expr.args.length > 0 ? this.evalExpr(expr.args[0]) : null;
        } else {
          val = expr.args.length > 0 ? this.evalExpr(expr.args[0]) : null;
        }
        return this.alloc(val);
      }
      case 'new_array': {
        const tn = expr.type;
        const count = this.evalExpr(expr.size) as number;
        const elements = Array.from({ length: count }, () => {
          if (tn in this.structDefs) return this.makeStruct(tn);
          return this.defaultValue(tn);
        });
        return this.alloc({ __type: `${tn}[]`, __count: count, __elements: elements } as any);
      }
      case 'binop': {
        const l = this.evalExpr(expr.left);
        const r = this.evalExpr(expr.right);
        switch (expr.op) {
          case '+': return (l as number) + (r as number);
          case '-': return (l as number) - (r as number);
          case '*': return (l as number) * (r as number);
          case '/': return Math.trunc((l as number) / (r as number));
          case '%': return (l as number) % (r as number);
          case '==': return l === r;
          case '!=': return l !== r;
          case '<': return (l as number) < (r as number);
          case '>': return (l as number) > (r as number);
          case '<=': return (l as number) <= (r as number);
          case '>=': return (l as number) >= (r as number);
          case '&&': return !!(l) && !!(r);
          case '||': return !!(l) || !!(r);
          default: throw new Error(`Unknown operator: ${expr.op}`);
        }
      }
      case 'unop': {
        const v = this.evalExpr(expr.expr);
        if (expr.op === '-') return -(v as number);
        if (expr.op === '!') return !v;
        throw new Error(`Unknown unary op: ${expr.op}`);
      }
      case 'call': return this.callFunction(expr.name, expr.args, expr);
      case 'pre_inc': case 'pre_dec': {
        const ref = this.resolveRef(expr.expr);
        const cur = (ref.container as any)[ref.key] as number;
        const nv = expr.kind === 'pre_inc' ? cur + 1 : cur - 1;
        (ref.container as any)[ref.key] = nv;
        return nv;
      }
      case 'post_inc': case 'post_dec': {
        const ref = this.resolveRef(expr.expr);
        const cur = (ref.container as any)[ref.key] as number;
        (ref.container as any)[ref.key] = expr.kind === 'post_inc' ? cur + 1 : cur - 1;
        return cur;
      }
      case 'noop': return null;
      default: throw new Error(`Cannot evaluate expression kind: ${expr.kind}`);
    }
  }

  private computeAddr(expr: Expr): string {
    if (expr.kind === 'var_ref') {
      for (let i = this.stack.length - 1; i >= 0; i--) {
        if (expr.name in this.stack[i].vars) {
          const val = this.stack[i].vars[expr.name];
          if (typeof val === 'string') return val;
          throw new Error(`Cannot take address of non-pointer variable ${expr.name}`);
        }
      }
      throw new Error(`Undefined variable: ${expr.name}`);
    }
    if (expr.kind === 'arrow') {
      const ptrVal = this.evalExpr(expr.ptr) as string;
      if (ptrVal === null) throw new Error('Null pointer dereference');
      const parts = ptrVal.split('.');
      const baseObj = this.heap[parts[0]];
      if (baseObj && typeof baseObj === 'object' && '__elements' in (baseObj as any)) {
        if (parts.length === 1) return `${ptrVal}.0.${expr.field}`;
        return `${ptrVal}.${expr.field}`;
      }
      return `${ptrVal}.${expr.field}`;
    }
    if (expr.kind === 'member') {
      const innerAddr = this.computeAddr(expr.obj);
      return `${innerAddr}.${expr.field}`;
    }
    if (expr.kind === 'index') {
      const base = this.evalExpr(expr.array);
      const idx = this.evalExpr(expr.index) as number;
      if (typeof base === 'string') {
        const obj = this.heap[base];
        if (obj && typeof obj === 'object' && '__elements' in (obj as any)) {
          return `${base}.${idx}`;
        }
      }
      return `${base}.${idx}`;
    }
    if (expr.kind === 'deref') {
      return this.evalExpr(expr.expr) as string;
    }
    throw new Error(`Cannot take address of: ${expr.kind}`);
  }

  private callFunction(name: string, argExprs: Expr[], callExpr: Expr): Value {
    const fdef = this.funcDefs[name];
    if (!fdef) throw new Error(`Undefined function: ${name}`);
    const frame: { name: string; vars: Record<string, Value>; types: Record<string, string> } =
      { name, vars: {}, types: {} };
    for (let i = 0; i < fdef.params.length; i++) {
      const param = fdef.params[i];
      if (param.isRef) {
        const ref = this.resolveRef(argExprs[i]);
        frame.vars[param.name] = { __isRef: true, container: ref.container, key: ref.key } as any;
      } else {
        const val = this.evalExpr(argExprs[i]);
        frame.vars[param.name] = JSON.parse(JSON.stringify(val));
      }
      frame.types[param.name] = param.type;
    }
    this.stack.push(frame);
    const callerLine = (callExpr as any).line || 0;
    this.callStack.push({ fn: name, callerLine });
    let result: Value = null;
    try {
      this.execBlock(fdef.body, name);
    } catch (e) {
      if (e instanceof ReturnSignal) result = e.value;
      else throw e;
    }
    this.stack.pop();
    this.callStack.pop();
    return result;
  }

  execBlock(stmts: Stmt[], fnName: string) {
    for (const stmt of stmts) {
      this.execStmt(stmt, fnName);
    }
  }

  private execStmt(stmt: Stmt, fnName: string) {
    if (!stmt || stmt.kind === 'noop') return;
    const line = stmt.line || 0;
    const codeLine = this.codeLines[line - 1]?.trim() || '';

    switch (stmt.kind) {
      case 'var_decl': {
        const f = this.frame();
        if (stmt.init) {
          f.vars[stmt.name] = this.evalExpr(stmt.init);
        } else {
          f.vars[stmt.name] = this.defaultValue(stmt.varType);
        }
        f.types[stmt.name] = stmt.varType;
        this.snapshot(line, codeLine || `Declare ${stmt.varType} ${stmt.name}`);
        break;
      }
      case 'assign': {
        const ref = this.resolveRefForAssign(stmt.target);
        const val = this.evalExpr(stmt.value);
        if (ref) {
          // Deep-clone objects to simulate C++ value semantics for struct copy
          (ref.container as any)[ref.key] =
            (val !== null && typeof val === 'object') ? JSON.parse(JSON.stringify(val)) : val;
        }
        this.snapshot(line, codeLine || 'Assignment');
        break;
      }
      case 'while': {
        let iterations = 0;
        while (this.evalExpr(stmt.cond)) {
          if (iterations++ > MAX_LOOP) throw new Error('Infinite loop detected');
          this.execBlock(stmt.body, fnName);
        }
        break;
      }
      case 'for': {
        if (stmt.init) this.execStmt(stmt.init, fnName);
        let iterations = 0;
        while (!stmt.cond || this.evalExpr(stmt.cond)) {
          if (iterations++ > MAX_LOOP) throw new Error('Infinite loop detected');
          this.execBlock(stmt.body, fnName);
          if (stmt.update) this.execStmt(stmt.update, fnName);
        }
        break;
      }
      case 'if': {
        if (this.evalExpr(stmt.cond)) {
          this.execBlock(stmt.then, fnName);
        } else if (stmt.else) {
          this.execBlock(stmt.else, fnName);
        }
        break;
      }
      case 'return': {
        const val = stmt.value ? this.evalExpr(stmt.value) : null;
        this.snapshot(line, codeLine || `Return ${val}`);
        throw new ReturnSignal(val);
      }
      case 'delete': {
        const addr = this.evalExpr(stmt.expr) as string;
        if (addr && typeof addr === 'string' && addr in this.heap) {
          delete this.heap[addr];
          this.freed.add(addr);
        }
        this.snapshot(line, codeLine || 'Delete');
        break;
      }
      case 'expr_stmt': {
        this.evalExpr(stmt.expr);
        this.snapshot(line, codeLine || 'Expression');
        break;
      }
      case 'block': {
        this.execBlock(stmt.body, fnName);
        break;
      }
    }
  }

  private resolveRefForAssign(expr: Expr): Ref | null {
    if (expr.kind === 'var_ref') {
      for (let i = this.stack.length - 1; i >= 0; i--) {
        if (expr.name in this.stack[i].vars) {
          const v = this.stack[i].vars[expr.name];
          if (v && typeof v === 'object' && '__isRef' in (v as any)) {
            return { container: (v as any).container, key: (v as any).key };
          }
          return { container: this.stack[i].vars, key: expr.name };
        }
      }
      throw new Error(`Undefined variable: ${expr.name}`);
    }
    return this.resolveRef(expr);
  }
}

// ============================================================
// SERIALIZER - Convert executor state to Trace format
// ============================================================

function addrToId(addr: string): string {
  return 'h' + addr.replace(/\./g, '_');
}

function serializeTrace(executor: Executor, codeLines: string[], program: Program): Trace {
  const structDefsStr = Object.values(program.structs).map(s => {
    const fields = s.fields.map(f =>
      `    ${f.type} ${f.name}${f.arraySize !== null ? `[${f.arraySize}]` : ''};`
    ).join('\n');
    return `struct ${s.name} {\n${fields}\n};`;
  }).join('\n\n');

  const functions: CodeFunction[] = [];
  const mainLines: string[] = [];
  let inFunc = false;
  let inStruct = false;
  let braceDepth = 0;
  let currentFunc: string[] = [];
  let currentFuncName = '';

  for (const rawLine of codeLines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    // Skip struct definitions entirely (multi-line)
    if (inStruct) {
      if (trimmed.includes('}')) inStruct = false;
      continue;
    }
    if (trimmed.startsWith('struct ') && trimmed.includes('{')) {
      if (trimmed.includes('}')) continue; // single-line struct
      inStruct = true;
      continue;
    }
    if (trimmed.startsWith('struct ')) continue;

    if (!inFunc) {
      const funcMatch = trimmed.match(/^(\w[\w*\s]*?)\s+(\w+)\s*\(/);
      if (funcMatch && funcMatch[2] in program.functions) {
        inFunc = true;
        currentFuncName = funcMatch[2];
        currentFunc = [trimmed];
        braceDepth = (trimmed.match(/{/g) || []).length - (trimmed.match(/}/g) || []).length;
        if (braceDepth <= 0 && trimmed.includes('{') && trimmed.includes('}')) {
          functions.push({ name: currentFuncName, lines: currentFunc });
          inFunc = false;
          currentFunc = [];
        }
        continue;
      }
      mainLines.push(trimmed);
    } else {
      currentFunc.push(trimmed);
      braceDepth += (trimmed.match(/{/g) || []).length;
      braceDepth -= (trimmed.match(/}/g) || []).length;
      if (braceDepth <= 0) {
        functions.push({ name: currentFuncName, lines: currentFunc });
        inFunc = false;
        currentFunc = [];
      }
    }
  }
  if (mainLines.length > 0) {
    functions.unshift({ name: 'main', lines: mainLines });
  }

  // Helper to serialize heap from raw snap data
  function serializeHeapFromSnap(heap: Record<string, any>): MemoryItem[] {
    const items: MemoryItem[] = [];
    for (const [addr, val] of Object.entries(heap)) {
      if (val && typeof val === 'object' && '__elements' in val) {
        for (let idx = 0; idx < val.__count; idx++) {
          items.push(serializeHeapValue(`${addr}.${idx}`, `${val.__type.replace('[]', '')} [${idx}]`, val.__elements[idx], executor.structDefs));
        }
      } else {
        const label = val && typeof val === 'object' && '__type' in val
          ? val.__type : typeof val === 'number' ? 'int' : 'value';
        items.push(serializeHeapValue(addr, label, val, executor.structDefs));
      }
    }
    return items;
  }

  // Find the calling function for a given snap (for callerLine resolution)
  function findCallerFunction(snap: any): string {
    // The caller is the frame below the top frame
    if (snap.stack.length >= 2) {
      return snap.stack[snap.stack.length - 2].name;
    }
    return 'main';
  }

  const steps: Step[] = executor.steps.map((snap, stepIdx) => {
    // Stack frames: __isRef is already resolved in snapshot
    const stackFrames: StackFrame[] = snap.stack.map((f: any) => {
      const refKeys: Set<string> = new Set(f.refKeys || []);
      return {
        name: f.name,
        variables: Object.entries(f.vars).map(([name, val]) =>
          serializeStackVar(name, val as Value, f.types[name] || 'int', executor.structDefs)
        ),
      };
    });

    // Serialize current and previous heap
    const heapItems = serializeHeapFromSnap(snap.heap);

    // Change detection: compare with previous step's serialized heap
    if (stepIdx > 0) {
      const prevHeapItems = serializeHeapFromSnap(executor.steps[stepIdx - 1].heap);
      const prevMap = new Map<string, string>();
      buildValueMap(prevHeapItems, prevMap);
      const curMap = new Map<string, string>();
      buildValueMap(heapItems, curMap);
      for (const item of flattenItems(heapItems)) {
        const pv = prevMap.get(item.id);
        const cv = curMap.get(item.id);
        if (pv !== cv) item.changed = true;
      }
    }

    // Resolve callerLine in the correct calling function
    const callerFn = findCallerFunction(snap);

    return {
      line: findLineInFunction(snap.fn, snap.line, functions, codeLines),
      activeFunction: snap.fn,
      callerLine: snap.callerLine !== undefined
        ? findLineInFunction(callerFn, snap.callerLine, functions, codeLines)
        : undefined,
      explanation: snap.explanation,
      stack: stackFrames,
      heap: heapItems,
    };
  });

  return {
    title: 'C++ Memory Visualization',
    description: 'Step through your code and see how stack and heap memory changes.',
    structs: structDefsStr,
    functions,
    steps,
  };
}

function findLineInFunction(fnName: string, codeLine: number, functions: CodeFunction[], codeLines: string[]): number {
  const fn = functions.find(f => f.name === fnName);
  if (!fn) return 0;
  const targetLine = codeLines[codeLine - 1]?.trim();
  if (!targetLine) return 0;
  const idx = fn.lines.findIndex(l => l.trim() === targetLine);
  return idx >= 0 ? idx : 0;
}

function serializeStackVar(name: string, val: Value, typeStr: string, structs: Record<string, StructDef>): MemoryItem {
  const id = `s_${name}`;
  const label = `${typeStr} ${name}`;
  if (val === null || val === undefined) {
    if (typeStr.includes('*')) return { id, label, value: '?' };
    return { id, label, value: '?' };
  }
  if (typeof val === 'string') {
    return { id, label, pointsTo: addrToId(val) };
  }
  if (typeof val === 'number') return { id, label, value: String(val) };
  if (typeof val === 'boolean') return { id, label, value: val ? 'true' : 'false' };
  return { id, label, value: String(val) };
}

function serializeHeapValue(addr: string, label: string, val: Value, structs: Record<string, StructDef>): MemoryItem {
  const id = addrToId(addr);
  if (val === null || val === undefined) {
    return { id, label, value: '?' };
  }
  if (typeof val === 'number') {
    return { id, label, value: String(val) };
  }
  if (typeof val === 'boolean') {
    return { id, label, value: val ? 'true' : 'false' };
  }
  if (typeof val === 'object' && '__type' in (val as any)) {
    const sv = val as StructValue;
    const typeName = sv.__type;
    const sd = structs[typeName];
    const children: MemoryItem[] = [];
    if (sd) {
      for (const f of sd.fields) {
        const fieldVal = sv[f.name];
        const fieldAddr = `${addr}.${f.name}`;
        const fieldId = addrToId(fieldAddr);
        if (f.arraySize !== null && Array.isArray(fieldVal)) {
          const arrChildren: MemoryItem[] = fieldVal.map((elem, i) => {
            const eAddr = `${fieldAddr}.${i}`;
            const eId = addrToId(eAddr);
            if (typeof elem === 'string') return { id: eId, label: `${f.name}[${i}]`, pointsTo: addrToId(elem) };
            return { id: eId, label: `${f.name}[${i}]`, value: elem === null ? '?' : String(elem) };
          });
          children.push({ id: fieldId, label: `${f.type} ${f.name}[${f.arraySize}]`, children: arrChildren });
        } else if (!f.type.includes('*') && f.type in structs && typeof fieldVal === 'object' && fieldVal !== null) {
          children.push(serializeHeapValue(fieldAddr, `${f.type} ${f.name}`, fieldVal, structs));
        } else if (f.type.includes('*')) {
          if (fieldVal === null || fieldVal === undefined) {
            children.push({ id: fieldId, label: `${f.type} ${f.name}`, value: fieldVal === null ? 'nullptr' : '?' });
          } else if (typeof fieldVal === 'string') {
            children.push({ id: fieldId, label: `${f.type} ${f.name}`, pointsTo: addrToId(fieldVal) });
          } else {
            children.push({ id: fieldId, label: `${f.type} ${f.name}`, value: '?' });
          }
        } else {
          children.push({ id: fieldId, label: `${f.type} ${f.name}`, value: fieldVal === null || fieldVal === undefined ? '?' : String(fieldVal) });
        }
      }
    }
    return { id, label, children };
  }
  return { id, label, value: String(val) };
}

function buildValueMap(items: MemoryItem[], map: Map<string, string>) {
  for (const item of items) {
    map.set(item.id, JSON.stringify({ v: item.value, p: item.pointsTo }));
    if (item.children) buildValueMap(item.children, map);
  }
}
function flattenItems(items: MemoryItem[]): MemoryItem[] {
  const result: MemoryItem[] = [];
  for (const item of items) {
    result.push(item);
    if (item.children) result.push(...flattenItems(item.children));
  }
  return result;
}

// ============================================================
// PUBLIC API
// ============================================================

export interface InterpretResult {
  success: boolean;
  error?: string;
  trace?: Trace;
}

export function interpret(code: string): InterpretResult {
  try {
    const codeLines = code.split('\n');
    const tokens = tokenize(code);
    const parser = new Parser(tokens);
    const program = parser.parseProgram();
    const executor = new Executor(program, codeLines);
    executor.run();
    const trace = serializeTrace(executor, codeLines, program);
    if (trace.steps.length === 0) {
      return { success: false, error: 'No executable statements found.' };
    }
    return { success: true, trace };
  } catch (e: any) {
    return { success: false, error: e.message || 'Unknown error' };
  }
}
