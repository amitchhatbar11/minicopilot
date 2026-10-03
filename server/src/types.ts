/** Shared types for the MiniCopilot backend. */

/** Raw result returned by the Rust/WASM `compile_policy` function. */
export interface WasmCompileResult {
  miniscript: string;
  descriptor: string;
  descriptor_concrete: string;
  asm: string;
  max_witness_size: number;
  is_sane: boolean;
  is_non_malleable: boolean;
  key_map: Record<string, string>;
  error?: string;
}

/** A node in the policy AST used by React Flow on the client. */
export interface PolicyAstNode {
  id: string;
  /** Fragment kind: OR | AND | THRESH | PK | OLDER | AFTER | HASH | UNKNOWN */
  kind: PolicyKind;
  /** Human-readable label, e.g. "pk(alice)" or "older(144)". */
  label: string;
  /** For pk: the key name. For timelocks/hashes: the raw argument. */
  value?: string;
  /** For thresh(k, ...): the threshold k. */
  threshold?: number;
  /** For or(a@X, b@Y): the branch weights, aligned with children. */
  weights?: number[];
  children: PolicyAstNode[];
}

export type PolicyKind =
  | 'OR'
  | 'AND'
  | 'THRESH'
  | 'PK'
  | 'OLDER'
  | 'AFTER'
  | 'HASH'
  | 'UNKNOWN';

/** Full response for POST /api/compile. */
export interface CompileResponse {
  ok: boolean;
  prompt: string;
  policy: string;
  explanation: string;
  /** How the policy was produced: 'llm' or 'offline-fallback'. */
  source: string;
  /** Number of self-healing retries that were needed (0 = first try). */
  retries: number;
  /** Demo mode didn't understand the request; the result is a generic example. */
  generic: boolean;
  miniscript: string;
  descriptor: string;
  descriptorConcrete: string;
  asm: string;
  maxWitnessSize: number;
  isSane: boolean;
  isNonMalleable: boolean;
  keyMap: Record<string, string>;
  ast: PolicyAstNode;
  error?: string;
}

export interface Preset {
  id: string;
  title: string;
  description: string;
  prompt: string;
}
