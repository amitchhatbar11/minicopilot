const STEPS = [
  {
    n: '1',
    title: 'Describe your rule',
    body: 'Say who should be able to spend the money and when, the way you’d explain it to a friend.',
  },
  {
    n: '2',
    title: 'We build it and check it',
    body: 'AI drafts the rule, then a separate Bitcoin engine builds the real lock and proves it’s safe. The AI never writes the money code itself.',
  },
  {
    n: '3',
    title: 'See how it unlocks',
    body: 'Get a plain-English summary and an interactive map. Tick who’s available to see whether the funds would open.',
  },
];

export default function HowItWorks({ onClose }: { onClose?: () => void }) {
  return (
    <section className="panel relative" aria-labelledby="how-title">
      <div className="px-5 pt-4 pb-1 flex items-baseline gap-3">
        <h2 id="how-title" className="text-[15px] font-semibold text-ink">
          Bitcoin spending rules, in plain English
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto text-xs text-muted hover:text-ink transition-colors"
          >
            Hide
          </button>
        )}
      </div>
      <p className="px-5 text-[13px] text-muted max-w-3xl leading-relaxed">
        Bitcoin can lock money behind custom rules, such as “two of us must
        approve” or “my heir can claim it after a year”. Writing those rules by hand is
        risky: one mistake can freeze or expose the funds. MiniCopilot does it
        for you, safely.
      </p>
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line mt-4 border-t border-line">
        {STEPS.map((s) => (
          <li key={s.n} className="bg-surface px-5 py-4 flex gap-3">
            <span className="shrink-0 w-6 h-6 grid place-items-center border border-orange/60 text-orange font-mono text-xs">
              {s.n}
            </span>
            <div>
              <div className="text-[13px] font-semibold text-ink">{s.title}</div>
              <p className="text-[12.5px] text-muted leading-relaxed mt-0.5">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
