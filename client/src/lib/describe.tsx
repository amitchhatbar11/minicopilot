/**
 * Turns a policy AST into plain English for non-technical readers.
 *
 * The policy is flattened into its alternative "ways to unlock" (the top-level
 * ORs), each described as a checklist of conditions. OR weights (e.g. 99@ vs 1@)
 * become "everyday" vs "backup" labels.
 */
import type { ReactNode } from 'react';
import type { PolicyAstNode } from '../types';

const BLOCKS_PER_DAY = 144; // ~10 minutes per block

/** "about 90 days", "about 1 year", "about 16 hours". */
export function blocksToDuration(blocks: number): string {
  const days = blocks / BLOCKS_PER_DAY;
  if (days < 1) {
    const hours = Math.max(1, Math.round((blocks * 10) / 60));
    return `about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  if (days < 350) {
    const d = Math.round(days);
    return `about ${d} ${d === 1 ? 'day' : 'days'}`;
  }
  const years = Math.round((days / 365) * 10) / 10;
  return `about ${years} ${years === 1 ? 'year' : 'years'}`;
}

/** CLTV values below 500,000,000 are block heights; above, Unix timestamps. */
function describeAfter(value: number): string {
  if (value < 500_000_000) {
    return `the Bitcoin network reaches block ${value.toLocaleString()} (a fixed point in time)`;
  }
  const date = new Date(value * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return `${date} has passed`;
}

export function Name({ children }: { children: ReactNode }) {
  return <span className="font-mono text-frag-pk">{children}</span>;
}

function joinList(items: ReactNode[], conj: 'and' | 'or'): ReactNode {
  if (items.length === 1) return items[0];
  return (
    <>
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 && (i === items.length - 1 ? ` ${conj} ` : ', ')}
          {it}
        </span>
      ))}
    </>
  );
}

/** One condition (or group of conditions) as a phrase. */
export function phrase(node: PolicyAstNode): ReactNode {
  switch (node.kind) {
    case 'PK':
      return (
        <>
          <Name>{node.value}</Name> signs
        </>
      );
    case 'OLDER': {
      const dur = blocksToDuration(Number(node.value));
      const verb = /^about 1 (day|hour|year)$/.test(dur) ? 'has' : 'have';
      return `${dur} ${verb} passed since the funds arrived`;
    }
    case 'AFTER':
      return describeAfter(Number(node.value));
    case 'HASH':
      return 'someone reveals the matching secret code';
    case 'AND':
      return joinList(node.children.map(phrase), 'and');
    case 'OR':
      if (node.children.length === 2) {
        return (
          <>
            either {phrase(node.children[0])} or {phrase(node.children[1])}
          </>
        );
      }
      return <>one of these: {joinList(node.children.map(phrase), 'or')}</>;
    case 'THRESH': {
      const k = node.threshold ?? node.children.length;
      const n = node.children.length;
      if (k === n) return joinList(node.children.map(phrase), 'and');
      if (node.children.every((c) => c.kind === 'PK')) {
        const names = node.children.map((c) => <Name key={c.id}>{c.value}</Name>);
        return (
          <>
            any {k} of {joinList(names, 'and')} sign
          </>
        );
      }
      if (k === 1) return <>one of these: {joinList(node.children.map(phrase), 'or')}</>;
      return (
        <>
          at least {k} of these: {joinList(node.children.map(phrase), 'and')}
        </>
      );
    }
    default:
      return node.label;
  }
}

export interface UnlockOption {
  node: PolicyAstNode;
  /** Relative likelihood from the OR weights (0–1). */
  share: number;
  role: 'main' | 'backup' | 'equal';
  /** The individual things that must all be true for this way. */
  conditions: PolicyAstNode[];
}

/** Split an AND (or an n-of-n threshold) into its individual requirements. */
function flattenAnd(node: PolicyAstNode): PolicyAstNode[] {
  const isAllOf =
    node.kind === 'AND' ||
    (node.kind === 'THRESH' && (node.threshold ?? 0) === node.children.length);
  return isAllOf ? node.children.flatMap(flattenAnd) : [node];
}

/** Every alternative way to unlock the funds, most likely first. */
export function unlockOptions(ast: PolicyAstNode): UnlockOption[] {
  const alts: { node: PolicyAstNode; share: number }[] = [];
  const walk = (node: PolicyAstNode, share: number) => {
    const isAnyOf =
      node.kind === 'OR' || (node.kind === 'THRESH' && node.threshold === 1);
    if (isAnyOf) {
      const weights = node.children.map((_, i) => node.weights?.[i] ?? 1);
      const total = weights.reduce((a, b) => a + b, 0);
      node.children.forEach((c, i) => walk(c, (share * weights[i]) / total));
    } else {
      alts.push({ node, share });
    }
  };
  walk(ast, 1);

  const max = Math.max(...alts.map((a) => a.share));
  const allEqual = alts.every((a) => Math.abs(a.share - max) < 1e-6);

  return alts
    .map((a) => ({
      node: a.node,
      share: a.share,
      role: (allEqual ? 'equal' : a.share === max ? 'main' : 'backup') as UnlockOption['role'],
      conditions: flattenAnd(a.node),
    }))
    .sort((a, b) => b.share - a.share);
}

/** A minimal set of leaf ids that satisfies `node` (used by "Try it"). */
export function requiredLeaves(node: PolicyAstNode): string[] {
  if (node.children.length === 0) return [node.id];
  if (node.kind === 'AND') return node.children.flatMap(requiredLeaves);
  if (node.kind === 'THRESH') {
    const k = node.threshold ?? node.children.length;
    return node.children.slice(0, k).flatMap(requiredLeaves);
  }
  // OR: follow the most likely branch.
  let best = 0;
  node.children.forEach((_, i) => {
    if ((node.weights?.[i] ?? 1) > (node.weights?.[best] ?? 1)) best = i;
  });
  return requiredLeaves(node.children[best]);
}

/** Which nodes are satisfied given the set of "available" leaves. */
export function computeSatisfied(
  root: PolicyAstNode,
  active: Set<string>
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  const visit = (n: PolicyAstNode): boolean => {
    let sat: boolean;
    if (n.children.length === 0) sat = active.has(n.id);
    else {
      const r = n.children.map(visit);
      if (n.kind === 'AND') sat = r.every(Boolean);
      else if (n.kind === 'THRESH')
        sat = r.filter(Boolean).length >= (n.threshold ?? n.children.length);
      else sat = r.some(Boolean);
    }
    out.set(n.id, sat);
    return sat;
  };
  visit(root);
  return out;
}

/** Short leaf label used on toggle chips and tree nodes. */
export function leafLabel(n: PolicyAstNode): string {
  switch (n.kind) {
    case 'PK':
      return `${n.value} signs`;
    case 'OLDER':
      return `${blocksToDuration(Number(n.value)).replace('about ', '~')} passed`;
    case 'AFTER':
      return Number(n.value) < 500_000_000
        ? `block ${Number(n.value).toLocaleString()} reached`
        : `${new Date(Number(n.value) * 1000).toLocaleDateString()} passed`;
    case 'HASH':
      return 'secret revealed';
    default:
      return n.label;
  }
}
