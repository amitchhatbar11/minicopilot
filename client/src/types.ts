export type PolicyKind =
  | 'OR'
  | 'AND'
  | 'THRESH'
  | 'PK'
  | 'OLDER'
  | 'AFTER'
  | 'HASH'
  | 'UNKNOWN';

export interface PolicyAstNode {
  id: string;
  kind: PolicyKind;
  label: string;
  value?: string;
  threshold?: number;
  weights?: number[];
  children: PolicyAstNode[];
}

export interface CompileResponse {
  ok: boolean;
  prompt: string;
  policy: string;
  explanation: string;
  source: string;
  retries: number;
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

export interface Health {
  /** Server reachable at all. */
  reachable: boolean;
  /** Rust/WASM safety engine built and loaded. */
  wasm: boolean;
  /** 'api-key' = real AI translation; 'offline-fallback' = demo mode. */
  llm: 'api-key' | 'offline-fallback' | 'unknown';
}

export interface Preset {
  id: string;
  title: string;
  description: string;
  prompt: string;
}
