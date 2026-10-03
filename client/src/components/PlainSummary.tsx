import { useMemo } from 'react';
import { ShieldCheck, ShieldAlert, Scale, TriangleAlert } from 'lucide-react';
import type { CompileResponse, PolicyKind } from '../types';
import { Name, phrase, requiredLeaves, unlockOptions } from '../lib/describe';

interface Props {
  result: CompileResponse;
  satisfied: Map<string, boolean>;
  onTry: (leafIds: string[]) => void;
}

const DOT: Partial<Record<PolicyKind, string>> = {
  PK: 'bg-frag-pk',
  OLDER: 'bg-frag-time',
  AFTER: 'bg-frag-time',
  HASH: 'bg-frag-hash',
};

const ROLE_LABEL = { main: 'Everyday way', backup: 'Backup way', equal: '' } as const;

function sizeWord(bytes: number): string {
  if (bytes <= 150) return 'small';
  if (bytes <= 400) return 'medium';
  return 'large';
}

function Check({
  ok,
  good,
  bad,
  goodDetail,
  badDetail,
}: {
  ok: boolean;
  good: string;
  bad: string;
  goodDetail: string;
  badDetail: string;
}) {
  return (
    <li className="flex gap-2.5">
      {ok ? (
        <ShieldCheck size={16} className="text-ok shrink-0 mt-0.5" aria-hidden />
      ) : (
        <ShieldAlert size={16} className="text-warn shrink-0 mt-0.5" aria-hidden />
      )}
      <div className="text-[13px] leading-snug">
        <span className={ok ? 'text-ink font-medium' : 'text-warn font-medium'}>
          {ok ? good : bad}
        </span>
        <span className="text-muted">: {ok ? goodDetail : badDetail}</span>
      </div>
    </li>
  );
}

export default function PlainSummary({ result, satisfied, onTry }: Props) {
  const options = useMemo(() => unlockOptions(result.ast), [result.ast]);
  const keyNames = Object.keys(result.keyMap);

  return (
    <div className="space-y-5">
      {result.generic && (
        <div className="flex gap-2.5 border border-frag-time/50 bg-frag-time/10 px-3 py-2.5 text-[13px] leading-snug">
          <TriangleAlert size={16} className="text-frag-time shrink-0 mt-0.5" aria-hidden />
          <div>
            <span className="text-ink font-medium">This is a generic example, not your rule.</span>{' '}
            <span className="text-muted">
              Demo mode only understands the examples (and similar wording). Add
              an AI key in <span className="font-mono">server/.env</span> to use
              your own words.
            </span>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-[15px] font-semibold text-ink">
          {options.length === 1
            ? 'There is 1 way to unlock these funds'
            : `There are ${options.length} ways to unlock these funds`}
        </h3>
        {result.explanation && !result.generic && (
          <p className="text-[13px] text-muted leading-relaxed mt-1">{result.explanation}</p>
        )}
      </div>

      <ol className="space-y-2">
        {options.map((opt, i) => {
          const unlocked = satisfied.get(opt.node.id) ?? false;
          const role = ROLE_LABEL[opt.role];
          return (
            <li
              key={opt.node.id}
              className="border bg-base px-3.5 py-3 transition-colors"
              style={{
                borderColor: unlocked ? '#9ece6a' : '#26262b',
                borderLeft: `3px solid ${unlocked ? '#9ece6a' : opt.role === 'backup' ? '#5c5b56' : '#f7931a'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[12px] font-semibold text-ink">Way {i + 1}</span>
                {role && (
                  <span
                    className={`text-[11px] px-1.5 py-px border ${
                      opt.role === 'main'
                        ? 'border-orange/50 text-orange'
                        : 'border-line text-muted'
                    }`}
                  >
                    {role}
                  </span>
                )}
                {unlocked && <span className="text-[11px] text-ok">● unlocked on the map</span>}
                <button
                  onClick={() => onTry(requiredLeaves(opt.node))}
                  className="ml-auto text-[11px] text-muted hover:text-orange border border-line hover:border-orange/60 px-2 py-0.5 transition-colors"
                >
                  Show me →
                </button>
              </div>
              <ul className="space-y-1">
                {opt.conditions.map((c) => (
                  <li key={c.id} className="flex gap-2 text-[13px] leading-snug text-ink/90">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[7px] ${DOT[c.kind] ?? 'bg-muted'}`}
                      aria-hidden
                    />
                    <span>{phrase(c)}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>

      <div>
        <h4 className="text-[13px] font-semibold text-ink mb-2">Safety checks</h4>
        <ul className="space-y-2">
          <Check
            ok={result.isNonMalleable}
            good="Can’t be tampered with"
            bad="Could be altered after signing"
            goodDetail="once a spend is signed, nobody can change it on its way to the network."
            badDetail="don’t use this without an expert review."
          />
          <Check
            ok={result.isSane}
            good="Passes Bitcoin’s safety rules"
            bad="Fails Bitcoin’s safety rules"
            goodDetail="every way to spend needs a signature, and it fits the network’s limits."
            badDetail="some path could be unsafe or rejected by the network."
          />
          <li className="flex gap-2.5">
            <Scale size={16} className="text-orange shrink-0 mt-0.5" aria-hidden />
            <div className="text-[13px] leading-snug">
              <span className="text-ink font-medium">
                Spending size: {sizeWord(result.maxWitnessSize)}
              </span>
              <span className="text-muted">
                : at most {result.maxWitnessSize} bytes of unlocking data. Bigger means a higher fee.
              </span>
            </div>
          </li>
        </ul>
      </div>

      {keyNames.length > 0 && (
        <p className="text-[12px] text-faint leading-relaxed">
          Names like{' '}
          {keyNames.slice(0, 2).map((n, i) => (
            <span key={n}>
              {i > 0 && ' and '}
              <Name>{n}</Name>
            </span>
          ))}{' '}
          stand in for each person’s key. Your wallet swaps in their real
          public keys before you receive any money.
        </p>
      )}
    </div>
  );
}
