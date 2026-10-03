/**
 * Natural-language -> Concrete Policy translation.
 *
 * The LLM is *never* asked to emit raw Bitcoin Script. It only emits Pieter
 * Wuille's Concrete Policy language, wrapped in a strict JSON container. The
 * deterministic WASM engine is what actually compiles + verifies it.
 *
 * Provider selection:
 *   1. ANTHROPIC_API_KEY  -> Anthropic Messages API
 *   2. OPENAI_API_KEY     -> OpenAI Chat Completions (or any OpenAI-compatible
 *                            endpoint via OPENAI_BASE_URL)
 *   3. neither            -> deterministic offline heuristic translator so the
 *                            app is still demoable without an API key.
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface TranslateResult {
  policy: string;
  explanation: string;
  source: 'anthropic' | 'openai' | 'offline-fallback';
  /** True when the offline translator didn't recognise the request and
   *  returned a generic example instead of the user's actual rule. */
  generic?: boolean;
}

export interface FixContext {
  previousPolicy: string;
  error: string;
}

const SYSTEM_PROMPT = `You are a Bitcoin protocol expert that converts plain-English spending conditions into Pieter Wuille's Miniscript **Concrete Policy Language**. You DO NOT write raw Bitcoin Script.

You MUST reply with a single JSON object and nothing else:
{"policy": "<concrete policy>", "explanation": "<1-3 sentences for a NON-TECHNICAL reader>"}

The explanation is shown to ordinary people. Write it in everyday language: say "about 90 days", never block counts; never use jargon such as multisig, CSV, CLTV, preimage, hash, timelock or script. Describe who can spend and when. Never use em dashes; use commas, colons or separate sentences instead.

The ONLY allowed policy fragments are:
- pk(KEY)                    : a signature by named key KEY (use short snake_case names like alice, cold_key, heir)
- older(N)                   : relative timelock (CSV), N blocks must pass since the coin was created
- after(N)                   : absolute timelock (CLTV), spendable only at/after block height N
- sha256(H) / hash256(H)     : reveal a 32-byte hex preimage whose SHA256/double-SHA256 is H (64 hex chars)
- ripemd160(H) / hash160(H)  : reveal a preimage whose RIPEMD160/HASH160 is H (40 hex chars)
- and(P1, P2, ...)           : all subpolicies required
- or(W1@P1, W2@P2, ...)      : any one subpolicy; W are optional relative probability weights (default 1). Put the MORE likely branch's weight higher (e.g. 9@ normal vs 1@ recovery) so the compiler optimizes for it.
- thresh(K, P1, P2, ...)     : at least K of the N subpolicies

Rules:
- Output MUST be a valid, compilable concrete policy. Balance every parenthesis.
- Timelock conventions: 144 blocks ≈ 1 day, 1008 ≈ 1 week, 4320 ≈ 30 days, 12960 ≈ 90 days, 52560 ≈ 1 year. Convert human durations to block counts.
- Use older() for "after N days of inactivity / since funding" (relative). Use after() only for a fixed calendar date / absolute block height.
- Never reuse the same key name for semantically different signers.
- Do NOT nest and()/or() unnecessarily; keep it minimal but correct.
- Never invent fragments outside the list above.`;

function buildUserPrompt(prompt: string, fix?: FixContext): string {
  if (fix) {
    return `The previous policy you produced failed to compile.

Previous policy: ${fix.previousPolicy}
Compiler error: ${fix.error}

Fix the policy so it compiles, preserving the original intent below. Reply with the JSON object only.

Original request: ${prompt}`;
  }
  return `Convert this spending condition into a concrete policy. Reply with the JSON object only.

Request: ${prompt}`;
}

/** House style: no em dashes in user-facing text, even if the model adds one. */
function stripEmDashes(text: string): string {
  return text.replace(/\s*\u2014\s*/g, ', ');
}

/** Extract the first balanced JSON object from an LLM text response. */
function extractJson(text: string): { policy: string; explanation: string } {
  let cleaned = text.trim();
  // Strip markdown code fences if present.
  cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`LLM did not return JSON. Raw: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (typeof parsed.policy !== 'string') {
    throw new Error('LLM JSON missing "policy" string.');
  }
  return {
    policy: parsed.policy.trim(),
    explanation:
      typeof parsed.explanation === 'string' ? stripEmDashes(parsed.explanation.trim()) : '',
  };
}

const MODEL = process.env.LLM_MODEL;

async function translateAnthropic(
  prompt: string,
  fix?: FixContext
): Promise<TranslateResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const resp = await client.messages.create({
    model: MODEL || 'claude-sonnet-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(prompt, fix) }],
  });
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const { policy, explanation } = extractJson(text);
  return { policy, explanation, source: 'anthropic' };
}

async function translateOpenAI(
  prompt: string,
  fix?: FixContext
): Promise<TranslateResult> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.OPENAI_BASE_URL,
  });
  const resp = await client.chat.completions.create({
    model: MODEL || 'gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(prompt, fix) },
    ],
  });
  const text = resp.choices[0]?.message?.content ?? '';
  const { policy, explanation } = extractJson(text);
  return { policy, explanation, source: 'openai' };
}

/**
 * Deterministic offline translator. Recognizes the built-in preset intents and
 * a few simple patterns so the app works with no API key. Not a real NLU; it
 * exists so the pipeline (WASM compile, verify, visualize) is always demoable.
 */
function translateOffline(prompt: string, fix?: FixContext): TranslateResult {
  const t = prompt.toLowerCase();
  const has = (...words: string[]) => words.every((w) => t.includes(w));
  const word = (w: string) => new RegExp(`\\b${w}\\b`).test(t);

  let policy: string | null = null;
  let explanation = '';
  let generic = false;

  // Order matters: check the most distinctive intents first, and use
  // word-boundary matching so substrings (e.g. "their" ⊃ "heir") don't misfire.
  if (t.includes('htlc') || word('preimage') || has('sha256')) {
    const m = prompt.match(/\b([0-9a-fA-F]{64})\b/);
    const hash = m ? m[1].toLowerCase() : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    policy = `or(1@pk(revocation_key),9@or(9@and(pk(receiver_key),sha256(${hash})),1@and(pk(sender_key),older(144))))`;
    explanation =
      'The receiver gets paid by revealing a secret code. If they don’t, the sender can take the money back after about a day. A special revocation key can also claim it at any time as a penalty for cheating.';
  } else if (has('2 of 3') || (has('recovery') && has('90 days'))) {
    policy =
      'or(99@thresh(2,pk(alice),pk(bob),pk(carol)),1@and(older(12960),or(1@pk(dave),1@pk(erin))))';
    explanation =
      'Normally any two of the three owners must approve a spend. If the money sits untouched for about 90 days, either recovery key can move it on its own.';
  } else if ((has('cold') && (word('2fa') || has('two factor') || word('hardware'))) || word('escape')) {
    policy =
      'or(99@and(pk(cold_key),pk(twofa_key)),1@and(pk(backup_key),older(4320)))';
    explanation =
      'Everyday spending needs both your cold-storage key and your 2FA key. If you lose one, a backup key can move the money on its own after about 30 days.';
  } else if (word('heir') || word('inheritance') || ((has('inactive') || has('not moved')) && t.includes('year'))) {
    policy = 'or(99@pk(owner),1@and(pk(heir),older(52560)))';
    explanation =
      'You can spend the money whenever you like. If it sits untouched for about a year, your heir can claim it on their own.';
  } else {
    // Generic best-effort fallback.
    policy = 'or(99@pk(primary),1@and(pk(backup),older(4320)))';
    explanation =
      'A primary key spends normally; a backup key can spend after ~30 days.';
    generic = true;
  }

  if (fix) {
    // The offline path is deterministic; if it produced something the compiler
    // rejected, surface that rather than silently loop.
    explanation += ` (offline fallback could not self-heal: ${fix.error})`;
  }

  return { policy, explanation, source: 'offline-fallback', generic };
}

/** Public entrypoint used by the controller. */
export async function translateToPolicy(
  prompt: string,
  fix?: FixContext
): Promise<TranslateResult> {
  if (process.env.ANTHROPIC_API_KEY) {
    return translateAnthropic(prompt, fix);
  }
  if (process.env.OPENAI_API_KEY) {
    return translateOpenAI(prompt, fix);
  }
  return translateOffline(prompt, fix);
}

export function usingRealLlm(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}
