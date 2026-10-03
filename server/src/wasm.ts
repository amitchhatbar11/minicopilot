/**
 * Loads the compiled `miniscript_wasm` module (built with
 * `wasm-pack build --target nodejs`) and exposes a typed `compilePolicy`.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import type { WasmCompileResult } from './types.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// pkg lives at <repo>/crates/miniscript_wasm/pkg relative to server/src.
const PKG_ENTRY = path.resolve(
  __dirname,
  '../../crates/miniscript_wasm/pkg/miniscript_wasm.js'
);

interface WasmModule {
  compile_policy(policy: string): WasmCompileResult;
}

let wasm: WasmModule | null = null;

export function isWasmAvailable(): boolean {
  return fs.existsSync(PKG_ENTRY);
}

function loadWasm(): WasmModule {
  if (wasm) return wasm;
  if (!isWasmAvailable()) {
    throw new Error(
      `WASM engine not built. Expected ${PKG_ENTRY}. ` +
        `Run "npm run build:wasm" from the repo root first.`
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  wasm = require(PKG_ENTRY) as WasmModule;
  return wasm;
}

/** Compile a concrete policy string through the Rust/WASM engine. */
export function compilePolicy(policy: string): WasmCompileResult {
  const mod = loadWasm();
  const result = mod.compile_policy(policy);
  // serde-wasm-bindgen returns a Map for objects unless configured; the
  // Serializer used here yields a plain object, but normalize just in case.
  if (result instanceof Map) {
    return Object.fromEntries(result as Map<string, unknown>) as unknown as WasmCompileResult;
  }
  return result;
}
