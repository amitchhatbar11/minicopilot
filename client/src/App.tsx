import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CircleHelp, TriangleAlert } from 'lucide-react';
import PromptInput from './components/PromptInput';
import PolicyTree from './components/PolicyTree';
import DescriptorView from './components/DescriptorView';
import PlainSummary from './components/PlainSummary';
import HowItWorks from './components/HowItWorks';
import { compilePrompt, fetchHealth, fetchPresets } from './api';
import { computeSatisfied } from './lib/describe';
import { friendlyError, type FriendlyError } from './lib/errors';
import type { CompileResponse, Health, Preset } from './types';

function SectionHeader({ step, title, right }: { step: string; title: string; right?: ReactNode }) {
  return (
    <div className="px-4 h-11 flex items-center gap-2.5 border-b border-line shrink-0">
      <span className="w-5 h-5 grid place-items-center border border-orange/60 text-orange font-mono text-[11px]">
        {step}
      </span>
      <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [result, setResult] = useState<CompileResponse | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [active, setActive] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchHealth().then(setHealth);
    fetchPresets()
      .then(setPresets)
      .catch(() => setPresets([]));
  }, []);

  const satisfied = useMemo(
    () => (result ? computeSatisfied(result.ast, active) : new Map<string, boolean>()),
    [result, active]
  );

  const run = async (text: string) => {
    const p = text.trim();
    if (!p) return;
    setLoading(true);
    setError(null);
    try {
      const res = await compilePrompt(p);
      setResult(res);
      setActive(new Set());
      setShowIntro(false);
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
      setResult(null);
      fetchHealth().then(setHealth);
    } finally {
      setLoading(false);
    }
  };

  const toggle = useCallback((id: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const demoMode = health?.llm === 'offline-fallback';
  const serverProblem =
    health && !health.reachable
      ? { title: "Can't reach the MiniCopilot server.", hint: 'Start it with "npm run dev" and refresh this page.' }
      : health && !health.wasm
        ? { title: "The safety engine isn't built yet.", hint: 'Run "npm run build:wasm" once, then restart the server.' }
        : null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line bg-surface/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-[1360px] px-5 h-14 flex items-center gap-3">
          <span className="grid place-items-center w-7 h-7 border border-orange/60 text-orange font-mono text-sm select-none">
            ₿
          </span>
          <div className="leading-tight">
            <div className="font-mono text-[15px] tracking-tight">minicopilot</div>
            <div className="hidden sm:block text-[11px] text-muted">
              Bitcoin spending rules, in plain English
            </div>
          </div>

          <div className="ml-auto flex items-center gap-4">
            <button
              onClick={() => setShowIntro((s) => !s)}
              aria-expanded={showIntro}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink transition-colors"
            >
              <CircleHelp size={15} aria-hidden /> How it works
            </button>
            <a
              href="https://bitcoin.sipa.be/miniscript/"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline text-[12.5px] text-muted hover:text-orange transition-colors"
            >
              Learn more ↗
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-[1360px] px-5 py-5 space-y-5">
        {serverProblem && (
          <div className="flex gap-2.5 border border-warn/50 bg-warn/10 px-4 py-3" role="alert">
            <TriangleAlert size={16} className="text-warn shrink-0 mt-0.5" aria-hidden />
            <div className="text-[13px]">
              <span className="text-warn font-medium">{serverProblem.title}</span>{' '}
              <span className="text-ink/80">{serverProblem.hint}</span>
            </div>
          </div>
        )}

        {showIntro && <HowItWorks onClose={() => setShowIntro(false)} />}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,460px)_1fr] gap-5">
          <div className="space-y-5">
            <section className="panel">
              <SectionHeader step="1" title="Describe your rule" />
              <div className="p-4">
                <PromptInput
                  value={prompt}
                  onChange={setPrompt}
                  onSubmit={() => run(prompt)}
                  loading={loading}
                  presets={presets}
                  onPickPreset={(p) => {
                    setPrompt(p.prompt);
                    void run(p.prompt);
                  }}
                  error={error}
                  demoMode={demoMode}
                />
              </div>
            </section>

            {result && (
              <>
                <section className="panel">
                  <SectionHeader step="2" title="What your lock does" />
                  <div className="p-4">
                    <PlainSummary
                      result={result}
                      satisfied={satisfied}
                      onTry={(ids) => setActive(new Set(ids))}
                    />
                  </div>
                </section>
                <DescriptorView result={result} />
              </>
            )}
          </div>

          <section className="panel flex flex-col self-start lg:sticky lg:top-[76px] h-[75vh] lg:h-[calc(100vh-6rem)] min-h-[520px]">
            <SectionHeader step="3" title="Map of your lock" />
            {result ? (
              <PolicyTree
                key={result.policy}
                ast={result.ast}
                active={active}
                satisfied={satisfied}
                onToggle={toggle}
                onReset={() => setActive(new Set())}
              />
            ) : (
              <EmptyState loading={loading} />
            )}
          </section>
        </div>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1360px] px-5 min-h-8 py-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-faint">
          <StatusDot
            ok={!!health?.reachable && !!health?.wasm}
            label={
              !health
                ? 'Checking…'
                : !health.reachable
                  ? 'Server offline'
                  : health.wasm
                    ? 'Safety engine ready'
                    : 'Safety engine not built'
            }
          />
          {health?.reachable && (
            <StatusDot
              ok={!demoMode}
              warn={demoMode}
              label={demoMode ? 'AI: demo mode (examples only)' : 'AI: connected'}
            />
          )}
          <span className="sm:ml-auto">
            Sample keys only. Never send real money to an address made here without your own keys.
          </span>
        </div>
      </footer>
    </div>
  );
}

function StatusDot({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  const color = ok ? 'bg-ok' : warn ? 'bg-frag-time' : 'bg-warn';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} aria-hidden /> {label}
    </span>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex-1 dotfield flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="text-[14px] text-ink font-medium">
          {loading ? 'Building your lock…' : 'Your lock’s map will appear here'}
        </div>
        <p className="text-[13px] text-muted mt-1.5 leading-relaxed">
          It shows every way the money can be unlocked. You can tick who’s
          available to test it. Pick an example on the left to see one.
        </p>
      </div>
    </div>
  );
}
