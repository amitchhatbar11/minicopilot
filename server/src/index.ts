import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { compile } from './controllers/compiler.js';
import { PRESETS } from './presets.js';
import { isWasmAvailable } from './wasm.js';
import { usingRealLlm } from './services/llm.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    wasm: isWasmAvailable(),
    llm: usingRealLlm() ? 'api-key' : 'offline-fallback',
  });
});

app.get('/api/presets', (_req, res) => {
  res.json({ ok: true, presets: PRESETS });
});

app.post('/api/compile', compile);

app.listen(PORT, () => {
  const wasmOk = isWasmAvailable();
  console.log(`\n  MiniCopilot server listening on http://localhost:${PORT}`);
  console.log(`  WASM engine : ${wasmOk ? 'loaded ✓' : 'NOT BUILT ✗  (run: npm run build:wasm)'}`);
  console.log(`  LLM         : ${usingRealLlm() ? 'API key detected ✓' : 'offline heuristic fallback (set ANTHROPIC_API_KEY or OPENAI_API_KEY)'}\n`);
});
