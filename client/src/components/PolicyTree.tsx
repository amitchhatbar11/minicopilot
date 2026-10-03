import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Lock, LockOpen } from 'lucide-react';
import type { PolicyAstNode, PolicyKind } from '../types';
import { blocksToDuration, leafLabel } from '../lib/describe';

interface Props {
  ast: PolicyAstNode;
  active: Set<string>;
  satisfied: Map<string, boolean>;
  onToggle: (id: string) => void;
  onReset: () => void;
}

const SAT = '#9ece6a';

const COLOR: Record<PolicyKind, string> = {
  OR: '#f7931a',
  AND: '#7aa2f7',
  THRESH: '#bb9af7',
  PK: '#9ece6a',
  OLDER: '#e0af68',
  AFTER: '#e0af68',
  HASH: '#7dcfff',
  UNKNOWN: '#8b8a84',
};

const LEGEND: { color: string; label: string }[] = [
  { color: COLOR.PK, label: 'Signature' },
  { color: COLOR.OLDER, label: 'Waiting period' },
  { color: COLOR.HASH, label: 'Secret code' },
  { color: COLOR.OR, label: 'Either' },
  { color: COLOR.AND, label: 'All of' },
  { color: COLOR.THRESH, label: 'Some of' },
];

/** Plain-language text for a tree node: small tag, main line, optional hint. */
function describeNode(n: PolicyAstNode): { tag: string; main: string; hint?: string; mono?: boolean } {
  switch (n.kind) {
    case 'OR':
      return { tag: 'Either', main: 'one of these' };
    case 'AND':
      return { tag: 'All of', main: 'all of these' };
    case 'THRESH': {
      const k = n.threshold ?? n.children.length;
      return { tag: `Any ${k} of ${n.children.length}`, main: `${k} of ${n.children.length} needed` };
    }
    case 'PK':
      return { tag: 'Signature', main: n.value ?? '', hint: 'must sign', mono: true };
    case 'OLDER':
      return {
        tag: 'Wait',
        main: blocksToDuration(Number(n.value)).replace('about ', '~'),
        hint: 'after funds arrive',
      };
    case 'AFTER': {
      const v = Number(n.value);
      return {
        tag: 'Date',
        main: v < 500_000_000 ? `block ${v.toLocaleString()}` : new Date(v * 1000).toLocaleDateString(),
        hint: 'fixed point in time',
      };
    }
    case 'HASH':
      return { tag: 'Secret code', main: 'reveal secret', hint: n.label };
    default:
      return { tag: 'Step', main: n.label };
  }
}

const X_GAP = 200;
const Y_GAP = 120;

interface Positioned extends PolicyAstNode {
  x: number;
  y: number;
  children: Positioned[];
}

function layout(root: PolicyAstNode): Positioned {
  let leaf = 0;
  const walk = (node: PolicyAstNode, depth: number): Positioned => {
    const children = node.children.map((c) => walk(c, depth + 1));
    const x =
      children.length === 0
        ? leaf++ * X_GAP
        : (children[0].x + children[children.length - 1].x) / 2;
    return { ...node, children, x, y: depth * Y_GAP };
  };
  return walk(root, 0);
}

function flatten(node: Positioned): Positioned[] {
  return [node, ...node.children.flatMap(flatten)];
}

/** Estimated witness bytes for the cheapest satisfied path. */
function estimateWitness(node: PolicyAstNode, active: Set<string>): number {
  const cost = (n: PolicyAstNode): number => {
    if (n.children.length === 0) {
      if (!active.has(n.id)) return Infinity;
      if (n.kind === 'PK') return 73;
      if (n.kind === 'HASH') return 33;
      return 0;
    }
    const c = n.children.map(cost);
    if (n.kind === 'AND') return c.reduce((a, b) => a + b, 0);
    if (n.kind === 'THRESH') {
      const k = n.threshold ?? n.children.length;
      return [...c].sort((a, b) => a - b).slice(0, k).reduce((a, b) => a + b, 0);
    }
    return Math.min(...c);
  };
  return cost(node);
}

/** "usual" / "backup" labels for an OR's branches when its weights differ. */
function branchLabel(parent: PolicyAstNode, i: number): string | undefined {
  if (parent.kind !== 'OR' || !parent.weights) return undefined;
  const max = Math.max(...parent.weights);
  if (parent.weights.every((w) => w === max)) return undefined;
  return parent.weights[i] === max ? 'usual' : 'backup';
}

export default function PolicyTree({ ast, active, satisfied, onToggle, onReset }: Props) {
  const positioned = useMemo(() => layout(ast), [ast]);
  const allNodes = useMemo(() => flatten(positioned), [positioned]);
  const leaves = useMemo(() => allNodes.filter((n) => n.children.length === 0), [allNodes]);

  const unlocked = satisfied.get(positioned.id) ?? false;
  const witness = useMemo(() => estimateWitness(positioned, active), [positioned, active]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      const t = allNodes.find((n) => n.id === node.id);
      if (t && t.children.length === 0) onToggle(t.id);
    },
    [allNodes, onToggle]
  );

  const rfNodes: Node[] = useMemo(
    () =>
      allNodes.map((n) => {
        const isSat = satisfied.get(n.id) ?? false;
        const isLeaf = n.children.length === 0;
        const accent = isSat ? SAT : COLOR[n.kind];
        const d = describeNode(n);
        return {
          id: n.id,
          position: { x: n.x, y: n.y },
          data: {
            label: (
              <div className="text-left" style={{ minWidth: 118 }}>
                <div className="flex items-center gap-1.5">
                  <span
                    style={{ color: accent, fontSize: 9, letterSpacing: '0.08em', fontWeight: 600 }}
                    className="uppercase"
                  >
                    {d.tag}
                  </span>
                  {isLeaf && (
                    <span className="ml-auto" style={{ color: isSat ? SAT : '#5c5b56', fontSize: 10 }}>
                      {isSat ? '✓' : '○'}
                    </span>
                  )}
                </div>
                <div
                  className={d.mono ? 'font-mono' : ''}
                  style={{ fontSize: 13, color: '#e8e6e1', marginTop: 2 }}
                >
                  {d.main}
                </div>
                {d.hint && (
                  <div style={{ fontSize: 10, color: '#77766f', marginTop: 1 }}>{d.hint}</div>
                )}
              </div>
            ),
          },
          style: {
            background: isSat ? 'rgba(158,206,106,0.08)' : '#141416',
            border: `1px solid ${isSat ? SAT : accent + '66'}`,
            borderLeft: `3px solid ${accent}`,
            borderRadius: 3,
            padding: '7px 10px',
            width: 'auto',
            cursor: isLeaf ? 'pointer' : 'default',
            boxShadow: 'none',
          },
        } satisfies Node;
      }),
    [allNodes, satisfied]
  );

  const rfEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    for (const parent of allNodes) {
      parent.children.forEach((child, i) => {
        const hot = (satisfied.get(child.id) ?? false) && (satisfied.get(parent.id) ?? false);
        const label = branchLabel(parent, i);
        edges.push({
          id: `${parent.id}-${child.id}`,
          source: parent.id,
          target: child.id,
          type: 'smoothstep',
          label,
          labelStyle: {
            fill: label === 'usual' ? '#f7931a' : '#8b8a84',
            fontSize: 10,
            fontFamily: 'IBM Plex Sans',
          },
          labelBgStyle: { fill: '#0a0a0b' },
          labelBgPadding: [4, 2],
          animated: hot,
          style: { stroke: hot ? SAT : '#3a3a41', strokeWidth: hot ? 2 : 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: hot ? SAT : '#3a3a41', width: 14, height: 14 },
        });
      });
    }
    return edges;
  }, [allNodes, satisfied]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Try it */}
      <div className="px-4 py-3 border-b border-line shrink-0">
        <div className="text-[13px] font-semibold text-ink">Try it: which of these are true?</div>
        <p className="text-[12px] text-muted mb-2.5">
          Tick who’s available and how much time has passed. The map shows whether the money unlocks.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {leaves.map((l) => {
            const on = active.has(l.id);
            return (
              <button
                key={l.id}
                onClick={() => onToggle(l.id)}
                aria-pressed={on}
                className="px-2.5 py-1 border text-[12px] transition-colors inline-flex items-center gap-1.5"
                style={{
                  borderColor: on ? SAT : COLOR[l.kind] + '55',
                  background: on ? 'rgba(158,206,106,0.1)' : 'transparent',
                  color: on ? SAT : '#d6d4ce',
                }}
              >
                <span
                  className="w-3 h-3 border grid place-items-center text-[9px] leading-none"
                  style={{ borderColor: on ? SAT : '#5c5b56' }}
                  aria-hidden
                >
                  {on ? '✓' : ''}
                </span>
                {leafLabel(l)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Result line */}
      <div
        className="px-4 py-2.5 border-b border-line shrink-0 flex items-center gap-2.5 text-[13px]"
        style={{ background: unlocked ? 'rgba(158,206,106,0.07)' : 'transparent' }}
        role="status"
      >
        {unlocked ? (
          <>
            <LockOpen size={16} style={{ color: SAT }} aria-hidden />
            <span style={{ color: SAT }} className="font-medium">
              The funds can be spent
            </span>
            {Number.isFinite(witness) && (
              <span className="text-faint text-[12px]">· ≈{witness} bytes of unlocking data</span>
            )}
          </>
        ) : (
          <>
            <Lock size={16} className="text-faint" aria-hidden />
            <span className="text-muted">The funds stay locked</span>
            <span className="text-faint text-[12px]">· tick more conditions</span>
          </>
        )}
        {active.size > 0 && (
          <button onClick={onReset} className="ml-auto text-[12px] text-faint hover:text-ink transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          nodesConnectable={false}
          // Let the mouse wheel scroll the page instead of hijacking it to zoom;
          // zoom stays available via the +/− buttons and trackpad pinch.
          zoomOnScroll={false}
          preventScrolling={false}
        >
          <Background variant={BackgroundVariant.Dots} color="#222226" gap={22} size={1} />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-line shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-[11px] text-faint">Key:</span>
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <span className="w-2 h-2" style={{ background: l.color }} aria-hidden />
            {l.label}
          </span>
        ))}
        <span className="text-[11px] text-faint sm:ml-auto">You can also click the bottom boxes on the map</span>
      </div>
    </div>
  );
}
