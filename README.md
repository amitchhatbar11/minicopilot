# MiniCopilot 🛡️₿

**Natural language → mathematically verified Bitcoin Miniscript.**

MiniCopilot turns a plain-English spending policy ("2 of 3 keys, but a backup
key can spend alone after 30 days") into:

- a formal **Concrete Policy** (Pieter Wuille's policy language),
- compiled, sanity-checked **Miniscript** (Segwit v0),
- a `wsh(...)#checksum` **descriptor** (named + concrete keys),
- **ScriptPubKey / witness-script ASM**,
- non-malleability + sanity analysis and max witness weight,
- an **interactive policy tree** you can click to simulate a spend.

## Why the 3-stage pipeline?

LLMs happily hallucinate insecure, malleable raw Bitcoin Script. MiniCopilot
never lets the model emit Script. Instead:

1. **Translate:** the LLM converts English into a formal *Concrete Policy*
   string only (`pk`, `older`, `after`, `sha256`, `and`, `or`, `thresh`, …).
2. **Verify & compile (deterministic):** a WebAssembly module compiled from
   [`rust-miniscript`](https://github.com/rust-bitcoin/rust-miniscript) parses
   the policy, compiles optimal Miniscript, and checks sanity +
   non-malleability. If it fails, the exact compiler error is fed back to the
   LLM to **self-heal** the policy (up to 2 retries).
3. **Visualize:** React + React Flow renders the branch tree; click keys and
   timelocks to see which path unlocks the funds and its estimated witness size.

The math is done by Rust, not the LLM.

---

## Architecture

```
crates/miniscript_wasm/   Rust → WASM engine (rust-miniscript 12)
server/                   Express + TypeScript API (LLM + WASM + self-heal loop)
client/                   React + Vite + Tailwind + @xyflow/react
```

- `POST /api/compile  { prompt }` → policy, miniscript, descriptor, asm, analysis, AST tree
- `GET  /api/presets` → 4 spending templates
- `GET  /api/health` → WASM/LLM status

---

## Requirements

- **Node.js 20+** (tested on 24)
- **Rust toolchain** + `wasm32-unknown-unknown` target + `wasm-pack`
- A **wasm-capable C compiler**. `rust-miniscript` pulls in `secp256k1-sys`,
  whose vendored C must be cross-compiled to wasm. Apple's system `clang` cannot
  target wasm, so on macOS you need Homebrew LLVM (`brew install llvm`).

```bash
# Rust + wasm target + wasm-pack
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# macOS only: wasm-capable clang for secp256k1-sys
brew install llvm
```

You do **not** need to export `CC_*`/`AR_*` manually: `npm run build:wasm` runs
[`scripts/build-wasm.sh`](scripts/build-wasm.sh), which auto-detects Homebrew
LLVM and sets them for the build (and prints a clear message if LLVM is
missing). On Linux the distro `clang`/`llvm` usually targets wasm out of the
box, so nothing extra is set.

---

## Setup

```bash
# 1. Install JS deps (root + server + client)
npm run install:all

# 2. Build the Rust → WASM engine
#    (keep the CC_*/AR_* exports above set on macOS)
npm run build:wasm

# 3. Configure the LLM (optional)
cp server/.env.example server/.env
# then edit server/.env and set ONE of:
#   ANTHROPIC_API_KEY=sk-ant-...
#   OPENAI_API_KEY=sk-...
```

> **No API key?** The server falls back to a deterministic offline translator
> that understands the four built-in presets and a few common patterns, so the
> full compile → verify → visualize pipeline is demoable without a key.

### Environment variables (`server/.env`)

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Use Anthropic (Claude) for translation |
| `OPENAI_API_KEY` | Use OpenAI (or any OpenAI-compatible endpoint) |
| `OPENAI_BASE_URL` | Optional: custom OpenAI-compatible base URL |
| `LLM_MODEL` | Optional model override (default `claude-sonnet-5` / `gpt-4o-mini`) |
| `PORT` | Server port (default `4000`) |

---

## Run

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:4000 (Vite proxies `/api` → the server)

---

## Timelock conventions

`older(N)` is a **relative** timelock (CSV); `after(N)` is **absolute** (CLTV).
Human durations map to block counts as:

| Duration | Blocks |
| --- | --- |
| 1 day | 144 |
| 1 week | 1008 |
| 30 days | 4320 |
| 90 days | 12960 |
| 1 year | 52560 |

---

## Notes

- Compilation targets **Segwit v0** (`wsh`).
- Named keys (`pk(alice)`) are substituted with **deterministic dummy public
  keys** so the engine can emit real Script and a valid descriptor checksum.
  **These are illustrative. Never fund an address derived from them.**
- The interactive witness-size figure for a selected path is an estimate
  (73 B per signature, 33 B per preimage, 0 for timelocks); the authoritative
  worst-case `max witness weight` comes from `rust-miniscript`.
