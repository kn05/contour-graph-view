import type { MatchCtx, QueryNode, Result } from "./types";
import { MAX_QUERY_LENGTH, MAX_QUERY_TOKENS } from "./constants";

interface Token {
  kind: "atom" | "and" | "or" | "not" | "left" | "right";
  value: string;
}

function readQuoted(query: string, start: number): Result<{ value: string; next: number }> {
  let value = "";
  for (let i = start + 1; i < query.length; i += 1) {
    const char = query[i];
    if (char === "\"") return { ok: true, value: { value, next: i + 1 }, warnings: [] };
    if (char === "\\" && i + 1 < query.length) {
      const next = query[i + 1];
      if (next !== undefined) value += next;
      i += 1;
      continue;
    }
    if (char !== undefined) value += char;
  }
  return { ok: false, error: "Search query has an unterminated quote." };
}

function readAtom(query: string, start: number): Result<{ value: string; next: number }> {
  let value = "";
  let index = start;
  while (index < query.length) {
    const char = query[index];
    if (char === undefined || /\s/u.test(char) || char === "(" || char === ")") break;
    if (char === "\"") {
      const quoted = readQuoted(query, index);
      if (!quoted.ok) return quoted;
      value += quoted.value.value;
      index = quoted.value.next;
      continue;
    }
    value += char;
    index += 1;
  }
  return { ok: true, value: { value, next: index }, warnings: [] };
}

function tokenize(query: string): Result<Token[]> {
  const tokens: Token[] = [];
  let index = 0;
  while (index < query.length) {
    if (tokens.length >= MAX_QUERY_TOKENS) {
      return { ok: false, error: `Search query exceeds ${MAX_QUERY_TOKENS} tokens.` };
    }
    const char = query[index];
    if (char === undefined) break;
    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "left", value: char });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ kind: "right", value: char });
      index += 1;
      continue;
    }
    if (char === "-") {
      tokens.push({ kind: "not", value: char });
      index += 1;
      continue;
    }
    const atom = readAtom(query, index);
    if (!atom.ok) return atom;
    if (atom.value.value.length === 0) return { ok: false, error: `Invalid token at ${index}.` };
    const upper = atom.value.value.toUpperCase();
    const kind = upper === "AND" ? "and" : upper === "OR" ? "or" : "atom";
    tokens.push({ kind, value: atom.value.value });
    index = atom.value.next;
  }
  return { ok: true, value: tokens, warnings: [] };
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): Result<QueryNode | null> {
    if (this.tokens.length === 0) return { ok: true, value: null, warnings: [] };
    const node = this.parseOr();
    if (!node.ok) return node;
    if (this.index !== this.tokens.length) {
      return { ok: false, error: `Unexpected token: ${this.tokens[this.index]?.value ?? "end"}.` };
    }
    return node;
  }

  private parseOr(): Result<QueryNode> {
    let left = this.parseAnd();
    if (!left.ok) return left;
    while (this.peek("or")) {
      this.index += 1;
      const right = this.parseAnd();
      if (!right.ok) return right;
      left = { ok: true, value: { kind: "or", left: left.value, right: right.value }, warnings: [] };
    }
    return left;
  }

  private parseAnd(): Result<QueryNode> {
    let left = this.parseUnary();
    if (!left.ok) return left;
    while (this.canStartUnary()) {
      if (this.peek("and")) this.index += 1;
      const right = this.parseUnary();
      if (!right.ok) return right;
      left = { ok: true, value: { kind: "and", left: left.value, right: right.value }, warnings: [] };
    }
    return left;
  }

  private parseUnary(): Result<QueryNode> {
    if (this.peek("not")) {
      this.index += 1;
      const node = this.parseUnary();
      if (!node.ok) return node;
      return { ok: true, value: { kind: "not", node: node.value }, warnings: [] };
    }
    if (this.peek("left")) {
      this.index += 1;
      const node = this.parseOr();
      if (!node.ok) return node;
      if (!this.peek("right")) return { ok: false, error: "Search query has an unmatched parenthesis." };
      this.index += 1;
      return node;
    }
    const token = this.tokens[this.index];
    if (token?.kind !== "atom") return { ok: false, error: `Expected a search term at ${this.index}.` };
    this.index += 1;
    return parseTerm(token.value);
  }

  private canStartUnary(): boolean {
    const kind = this.tokens[this.index]?.kind;
    return kind === "atom" || kind === "not" || kind === "left" || kind === "and";
  }

  private peek(kind: Token["kind"]): boolean {
    return this.tokens[this.index]?.kind === kind;
  }
}

function parseTerm(raw: string): Result<QueryNode> {
  const split = raw.indexOf(":");
  if (split < 0) {
    return { ok: true, value: { kind: "term", field: null, value: raw.toLowerCase() }, warnings: [] };
  }
  const field = raw.slice(0, split).toLowerCase();
  const value = raw.slice(split + 1).toLowerCase();
  if (field !== "path" && field !== "file" && field !== "tag") {
    return { ok: false, error: `Unsupported search operator: ${field}:` };
  }
  if (value.length === 0) return { ok: false, error: `Search operator ${field}: needs a value.` };
  return { ok: true, value: { kind: "term", field, value }, warnings: [] };
}

export function parseQuery(query: string): Result<QueryNode | null> {
  if (query.length > MAX_QUERY_LENGTH) {
    return { ok: false, error: `Search query exceeds ${MAX_QUERY_LENGTH} characters.` };
  }
  const tokens = tokenize(query.trim());
  if (!tokens.ok) return tokens;
  return new Parser(tokens.value).parse();
}

export function matchQuery(node: QueryNode | null, ctx: MatchCtx): boolean {
  if (node === null) return true;
  if (node.kind === "not") return !matchQuery(node.node, ctx);
  if (node.kind === "and") return matchQuery(node.left, ctx) && matchQuery(node.right, ctx);
  if (node.kind === "or") return matchQuery(node.left, ctx) || matchQuery(node.right, ctx);

  const value = node.value.toLowerCase();
  if (node.field === "path") return ctx.path.toLowerCase().includes(value);
  if (node.field === "file") return ctx.name.toLowerCase().includes(value);
  if (node.field === "tag") {
    for (const tag of ctx.tags) {
      if (tag.toLowerCase().includes(value.replace(/^#/u, ""))) return true;
    }
    return false;
  }
  return ctx.path.toLowerCase().includes(value) || ctx.name.toLowerCase().includes(value);
}
