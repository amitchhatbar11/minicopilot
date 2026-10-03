/**
 * A small recursive-descent parser for Pieter Wuille's Concrete Policy
 * language. It produces a hierarchical AST (`PolicyAstNode`) that the React
 * Flow visualizer renders. The WASM engine is the source of truth for
 * compilation; this tree is purely for visualization of the *input* policy.
 *
 * Grammar handled:
 *   pk(NAME)
 *   older(N) | after(N)
 *   sha256(HEX) | hash256(HEX) | ripemd160(HEX) | hash160(HEX)
 *   and(P, P, ...)
 *   or(W@P, W@P, ...)          (weights optional -> default 1)
 *   thresh(k, P, P, ...)
 */
import type { PolicyAstNode, PolicyKind } from './types.js';

let counter = 0;
const nextId = () => `n${counter++}`;

export function parsePolicyToAst(policy: string): PolicyAstNode {
  counter = 0;
  const p = new PolicyParser(policy);
  const node = p.parseExpr();
  p.skipWs();
  if (!p.atEnd()) {
    throw new Error(`Unexpected trailing input in policy at position ${p.pos}`);
  }
  return node;
}

class PolicyParser {
  pos = 0;
  constructor(private readonly src: string) {}

  atEnd(): boolean {
    return this.pos >= this.src.length;
  }

  skipWs(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) {
      this.pos++;
    }
  }

  private peek(): string {
    return this.src[this.pos] ?? '';
  }

  private readIdent(): string {
    this.skipWs();
    const start = this.pos;
    while (this.pos < this.src.length && /[A-Za-z0-9_]/.test(this.src[this.pos])) {
      this.pos++;
    }
    return this.src.slice(start, this.pos);
  }

  private expect(ch: string): void {
    this.skipWs();
    if (this.src[this.pos] !== ch) {
      throw new Error(
        `Expected '${ch}' at position ${this.pos}, found '${this.peek()}'`
      );
    }
    this.pos++;
  }

  /** Read a raw argument token up to the next ',' or ')'. */
  private readArg(): string {
    this.skipWs();
    const start = this.pos;
    while (this.pos < this.src.length && ![',', ')'].includes(this.src[this.pos])) {
      this.pos++;
    }
    return this.src.slice(start, this.pos).trim();
  }

  parseExpr(): PolicyAstNode {
    this.skipWs();
    const name = this.readIdent();
    if (!name) {
      throw new Error(`Expected a fragment at position ${this.pos}`);
    }

    switch (name) {
      case 'pk':
      case 'pkh': {
        this.expect('(');
        const key = this.readArg();
        this.expect(')');
        return leaf('PK', `pk(${key})`, key);
      }
      case 'older': {
        this.expect('(');
        const v = this.readArg();
        this.expect(')');
        return leaf('OLDER', `older(${v})`, v);
      }
      case 'after': {
        this.expect('(');
        const v = this.readArg();
        this.expect(')');
        return leaf('AFTER', `after(${v})`, v);
      }
      case 'sha256':
      case 'hash256':
      case 'ripemd160':
      case 'hash160': {
        this.expect('(');
        const v = this.readArg();
        this.expect(')');
        return leaf('HASH', `${name}(${shorten(v)})`, v);
      }
      case 'and': {
        this.expect('(');
        const children = this.parseArgList();
        this.expect(')');
        return {
          id: nextId(),
          kind: 'AND',
          label: 'AND',
          children,
        };
      }
      case 'or': {
        this.expect('(');
        const { children, weights } = this.parseWeightedArgList();
        this.expect(')');
        return {
          id: nextId(),
          kind: 'OR',
          label: 'OR',
          weights,
          children,
        };
      }
      case 'thresh': {
        this.expect('(');
        const k = parseInt(this.readArg(), 10);
        const children: PolicyAstNode[] = [];
        this.skipWs();
        while (this.peek() === ',') {
          this.expect(',');
          children.push(this.parseExpr());
          this.skipWs();
        }
        this.expect(')');
        return {
          id: nextId(),
          kind: 'THRESH',
          label: `THRESH ${k}/${children.length}`,
          threshold: k,
          children,
        };
      }
      default:
        // Unknown/miniscript-level fragments still get a node so the tree
        // never blows up on unexpected input.
        if (this.peek() === '(') {
          this.expect('(');
          const children = this.parseArgList();
          this.expect(')');
          return {
            id: nextId(),
            kind: 'UNKNOWN',
            label: name,
            children,
          };
        }
        return leaf('UNKNOWN', name);
    }
  }

  private parseArgList(): PolicyAstNode[] {
    const out: PolicyAstNode[] = [];
    out.push(this.parseExpr());
    this.skipWs();
    while (this.peek() === ',') {
      this.expect(',');
      out.push(this.parseExpr());
      this.skipWs();
    }
    return out;
  }

  private parseWeightedArgList(): { children: PolicyAstNode[]; weights: number[] } {
    const children: PolicyAstNode[] = [];
    const weights: number[] = [];
    const readOne = () => {
      const before = this.pos;
      // Optional "weight@" prefix.
      const maybe = this.readIdentOrNumber();
      this.skipWs();
      if (this.peek() === '@') {
        this.expect('@');
        weights.push(parseInt(maybe, 10) || 1);
      } else {
        this.pos = before;
        weights.push(1);
      }
      children.push(this.parseExpr());
    };
    readOne();
    this.skipWs();
    while (this.peek() === ',') {
      this.expect(',');
      readOne();
      this.skipWs();
    }
    return { children, weights };
  }

  private readIdentOrNumber(): string {
    this.skipWs();
    const start = this.pos;
    while (this.pos < this.src.length && /[0-9]/.test(this.src[this.pos])) {
      this.pos++;
    }
    return this.src.slice(start, this.pos);
  }
}

function leaf(kind: PolicyKind, label: string, value?: string): PolicyAstNode {
  return { id: nextId(), kind, label, value, children: [] };
}

function shorten(hex: string): string {
  if (hex.length <= 12) return hex;
  return `${hex.slice(0, 6)}…${hex.slice(-4)}`;
}
