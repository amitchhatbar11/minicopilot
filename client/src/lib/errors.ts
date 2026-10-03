/** Map raw server / compiler errors to something a non-developer can act on. */
export interface FriendlyError {
  title: string;
  hint: string;
  /** The original message, shown under "technical details". */
  raw: string;
}

const RULES: { test: RegExp; title: string; hint: string }[] = [
  {
    test: /SERVER_UNREACHABLE|Failed to fetch|NetworkError|Load failed|ECONNREFUSED/i,
    title: "Can't reach the MiniCopilot server.",
    hint: 'Make sure it is running. Start everything with "npm run dev", then try again.',
  },
  {
    test: /WASM engine not built/i,
    title: "The safety engine isn't built yet.",
    hint: 'Run "npm run build:wasm" once, then restart the server.',
  },
  {
    test: /duplicate key/i,
    title: 'The same key appears twice.',
    hint: 'Give each person their own name (for example alice and bob), even if they play two roles.',
  },
  {
    test: /timelock|heightlock|timelock mixing/i,
    title: 'That rule mixes time conditions Bitcoin can’t combine.',
    hint: 'Use either "wait N days after receiving the funds" or "after a fixed date" in one path, not both.',
  },
  {
    test: /api key|authentication|401|403|invalid x-api-key/i,
    title: 'The AI service rejected the request.',
    hint: 'Check the API key in server/.env, then restart the server.',
  },
  {
    test: /Failed to compile after/i,
    title: "We couldn't build a safe lock for that rule.",
    hint: 'The rule may be contradictory or too complex. Try simplifying it, or start from one of the examples.',
  },
  {
    test: /parse error|unexpected|did not return JSON|missing "policy"/i,
    title: "We couldn't turn that into a spending rule.",
    hint: 'Try rephrasing: say who needs to sign, and any waiting period. E.g. "Alice and Bob must both sign; after 6 months Alice alone can spend."',
  },
];

export function friendlyError(raw: string): FriendlyError {
  const rule = RULES.find((r) => r.test.test(raw));
  if (rule) return { title: rule.title, hint: rule.hint, raw };
  return {
    title: 'Something went wrong.',
    hint: 'Try again, or rephrase your rule.',
    raw,
  };
}
