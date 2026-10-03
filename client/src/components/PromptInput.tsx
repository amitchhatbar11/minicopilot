import { Loader2 } from 'lucide-react';
import type { Preset } from '../types';
import type { FriendlyError } from '../lib/errors';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  presets: Preset[];
  onPickPreset: (p: Preset) => void;
  error: FriendlyError | null;
  demoMode: boolean;
}

export default function PromptInput({
  value,
  onChange,
  onSubmit,
  loading,
  presets,
  onPickPreset,
  error,
  demoMode,
}: Props) {
  return (
    <div className="space-y-4">
      {presets.length > 0 && (
        <div>
          <div className="text-[13px] font-semibold text-ink">Start from an example</div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => onPickPreset(p)}
                disabled={loading}
                className="group text-left px-3 py-2.5 border border-line bg-raised hover:border-orange/60 transition-colors disabled:opacity-50"
              >
                <span className="block text-[13px] font-medium text-ink group-hover:text-orange transition-colors">
                  {p.title}
                </span>
                <span className="block text-[11.5px] text-muted leading-snug mt-0.5">
                  {p.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="prompt" className="text-[13px] font-semibold text-ink">
          …or describe your own rule
        </label>
        <div className="mt-2 relative">
          <textarea
            id="prompt"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSubmit();
            }}
            rows={4}
            placeholder="e.g. Alice and Bob must both approve. If 6 months pass with no activity, Alice can spend alone."
            className="w-full resize-y bg-base border border-line focus:border-orange/70 outline-none px-3 py-2.5 text-[13.5px] leading-relaxed text-ink placeholder:text-faint"
          />
        </div>
        <p className="text-[12px] text-muted mt-1.5 leading-relaxed">
          <span className="text-ink/80">Tip:</span> give each person a name
          (alice, bob…) and say waiting times in days, months or years.
        </p>
        {demoMode && (
          <p className="text-[12px] text-frag-time/90 mt-1.5 leading-relaxed">
            Demo mode: no AI key is set, so only the examples above (and
            similar wording) are understood exactly.
          </p>
        )}
      </div>

      {error && (
        <div className="border border-warn/50 bg-warn/10 px-3 py-2.5" role="alert">
          <div className="text-[13px] font-medium text-warn">{error.title}</div>
          <div className="text-[12.5px] text-ink/80 mt-0.5 leading-snug">{error.hint}</div>
          {error.raw && error.raw !== 'SERVER_UNREACHABLE' && (
            <details className="mt-1.5">
              <summary className="text-[11px] text-muted cursor-pointer">Technical message</summary>
              <div className="font-mono text-[11px] text-muted mt-1 break-all">{error.raw}</div>
            </details>
          )}
        </div>
      )}

      <div>
        <button
          onClick={onSubmit}
          disabled={loading || !value.trim()}
          className="w-full h-11 inline-flex items-center justify-center gap-2 bg-orange text-base text-[14px] font-semibold hover:bg-orange/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Building and safety-checking…
            </>
          ) : (
            'Build my lock'
          )}
        </button>
        <p className="text-[11.5px] text-faint mt-1.5 text-center">
          {loading
            ? 'Understanding your rule → building the lock → checking it’s safe. Usually a few seconds.'
            : 'Press ⌘/Ctrl + Enter to build'}
        </p>
      </div>
    </div>
  );
}
