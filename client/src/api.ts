import type { CompileResponse, Health, Preset } from './types';

const API = '/api';

const SERVER_DOWN = 'SERVER_UNREACHABLE';

/** Parse JSON, treating an empty/HTML body (e.g. proxy error) as "server down". */
async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(SERVER_DOWN);
  }
}

export async function fetchHealth(): Promise<Health> {
  try {
    const res = await fetch(`${API}/health`);
    if (!res.ok) return { reachable: false, wasm: false, llm: 'unknown' };
    const data = await readJson<{ wasm: boolean; llm: Health['llm'] }>(res);
    return { reachable: true, wasm: data.wasm, llm: data.llm };
  } catch {
    return { reachable: false, wasm: false, llm: 'unknown' };
  }
}

export async function fetchPresets(): Promise<Preset[]> {
  const res = await fetch(`${API}/presets`);
  if (!res.ok) throw new Error(SERVER_DOWN);
  const data = await readJson<{ presets: Preset[] }>(res);
  return data.presets;
}

export async function compilePrompt(prompt: string): Promise<CompileResponse> {
  let res: Response;
  try {
    res = await fetch(`${API}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
  } catch {
    throw new Error(SERVER_DOWN);
  }
  const data = await readJson<CompileResponse>(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Compile failed (${res.status})`);
  }
  return data;
}
