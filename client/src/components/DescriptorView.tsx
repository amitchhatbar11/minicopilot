import { useState } from 'react';
import { Copy, Check, ChevronDown } from 'lucide-react';
import type { CompileResponse } from '../types';

interface Props {
  result: CompileResponse;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="shrink-0 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 border border-line text-muted hover:border-orange/60 hover:text-orange transition-colors"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Field({
  label,
  help,
  value,
  pre = false,
}: {
  label: string;
  help: string;
  value: string;
  pre?: boolean;
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-1">
        <div>
          <div className="text-[12px] font-semibold text-ink">{label}</div>
          <div className="text-[11.5px] text-muted leading-snug">{help}</div>
        </div>
        <CopyButton text={value} />
      </div>
      <div
        className={`bg-base border border-line px-3 py-2 font-mono break-all leading-relaxed ${
          pre ? 'text-[11px] text-frag-pk/90 whitespace-pre-wrap' : 'text-[12px] text-ink/90'
        }`}
      >
        {value || <span className="text-faint">(empty)</span>}
      </div>
    </div>
  );
}

export default function DescriptorView({ result }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="panel">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-raised transition-colors"
      >
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-ink">Technical details</div>
          <div className="text-[12px] text-muted">
            The exact Bitcoin code, for wallet software and developers.
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-4 space-y-4 border-t border-line">
          <Field
            label="Descriptor"
            help="Import this into a descriptor wallet (e.g. Sparrow, Bitcoin Core) after swapping in real public keys."
            value={result.descriptor}
          />
          <Field
            label="Descriptor with sample keys"
            help="The same, with example keys filled in so it’s complete. Never send money to it."
            value={result.descriptorConcrete}
          />
          <Field
            label="Policy"
            help="Your rule in Bitcoin’s policy language. This is the part the AI wrote."
            value={result.policy}
          />
          <Field
            label="Miniscript"
            help="The optimised, verified structure the engine compiled from the policy."
            value={result.miniscript}
          />
          <Field
            label="Script (ASM)"
            help="The raw Bitcoin Script instructions, with the sample keys."
            value={result.asm}
            pre
          />

          {Object.keys(result.keyMap).length > 0 && (
            <div>
              <div className="text-[12px] font-semibold text-ink">Sample keys</div>
              <div className="text-[11.5px] text-muted mb-1">
                Placeholder keys generated from each name, used only for the examples above.
              </div>
              <div className="bg-base border border-line px-3 py-2 space-y-1">
                {Object.entries(result.keyMap).map(([name, pk]) => (
                  <div key={name} className="flex gap-2 font-mono text-[11px]">
                    <span className="text-frag-pk shrink-0 w-28 truncate">{name}</span>
                    <span className="text-muted break-all">{pk}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-faint">
            Engine: rust-miniscript 12 · Segwit v0 (wsh)
            {result.retries > 0 &&
              ` · the AI’s first draft had an error and was auto-corrected ${result.retries}×`}
          </p>
        </div>
      )}
    </section>
  );
}
