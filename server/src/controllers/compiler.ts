import type { Request, Response } from 'express';
import { compilePolicy } from '../wasm.js';
import { parsePolicyToAst } from '../ast.js';
import {
  translateToPolicy,
  usingRealLlm,
  type FixContext,
} from '../services/llm.js';
import type { CompileResponse, PolicyAstNode } from '../types.js';

const MAX_RETRIES = 2;

/**
 * POST /api/compile
 * Body: { prompt: string }
 *
 * Pipeline:
 *   1. LLM: English -> concrete policy
 *   2. WASM: policy -> miniscript/descriptor/asm + verification
 *   3. Self-healing loop: on WASM error, feed the exact compiler error back to
 *      the LLM to repair the policy (up to MAX_RETRIES times).
 */
export async function compile(req: Request, res: Response): Promise<void> {
  const prompt = (req.body?.prompt ?? '').toString().trim();
  if (!prompt) {
    res.status(400).json({ ok: false, error: 'Missing "prompt" in request body.' });
    return;
  }

  try {
    let fix: FixContext | undefined;
    let lastPolicy = '';
    let lastExplanation = '';
    let source = '';
    let generic = false;
    let retries = 0;
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const translated = await translateToPolicy(prompt, fix);
      lastPolicy = translated.policy;
      lastExplanation = translated.explanation;
      source = translated.source;
      generic = translated.generic ?? false;
      retries = attempt;

      const wasm = compilePolicy(lastPolicy);

      if (!wasm.error) {
        // Build the visualization AST from the (validated) policy string.
        let ast: PolicyAstNode;
        try {
          ast = parsePolicyToAst(lastPolicy);
        } catch (e) {
          ast = {
            id: 'root',
            kind: 'UNKNOWN',
            label: lastPolicy,
            children: [],
          };
        }

        const response: CompileResponse = {
          ok: true,
          prompt,
          policy: lastPolicy,
          explanation: lastExplanation,
          source,
          retries,
          generic,
          miniscript: wasm.miniscript,
          descriptor: wasm.descriptor,
          descriptorConcrete: wasm.descriptor_concrete,
          asm: wasm.asm,
          maxWitnessSize: wasm.max_witness_size,
          isSane: wasm.is_sane,
          isNonMalleable: wasm.is_non_malleable,
          keyMap: wasm.key_map ?? {},
          ast,
        };
        res.status(200).json(response);
        return;
      }

      // WASM reported an error -> prepare a self-healing retry.
      lastError = wasm.error;
      fix = { previousPolicy: lastPolicy, error: wasm.error };

      // The offline fallback is deterministic; retrying won't help.
      if (!usingRealLlm()) break;
    }

    // Exhausted retries.
    res.status(422).json({
      ok: false,
      prompt,
      policy: lastPolicy,
      explanation: lastExplanation,
      source,
      retries,
      error: `Failed to compile after ${retries + 1} attempt(s): ${lastError}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, prompt, error: message });
  }
}
