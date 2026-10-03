#!/usr/bin/env bash
#
# Build the Rust -> WASM engine.
#
# rust-miniscript pulls in secp256k1-sys, whose vendored C must be cross-compiled
# to wasm32. Apple's system clang cannot target wasm32-unknown-unknown, so on
# macOS we point cargo/cc-rs at a wasm-capable clang (Homebrew LLVM). On Linux
# the distro clang usually targets wasm out of the box, so nothing extra is set.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Ensure the wasm target is installed (no-op if already present).
if command -v rustup >/dev/null 2>&1; then
  rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
fi

if [[ "$(uname)" == "Darwin" ]]; then
  # Respect an already-set override.
  if [[ -z "${CC_wasm32_unknown_unknown:-}" ]]; then
    LLVM_PREFIX=""
    if command -v brew >/dev/null 2>&1; then
      LLVM_PREFIX="$(brew --prefix llvm 2>/dev/null || true)"
    fi
    # Fall back to common install locations if brew is absent.
    for candidate in "$LLVM_PREFIX" /opt/homebrew/opt/llvm /usr/local/opt/llvm; do
      if [[ -n "$candidate" && -x "$candidate/bin/clang" ]]; then
        export CC_wasm32_unknown_unknown="$candidate/bin/clang"
        export AR_wasm32_unknown_unknown="$candidate/bin/llvm-ar"
        echo "[build:wasm] using wasm-capable clang: $CC_wasm32_unknown_unknown"
        break
      fi
    done
  else
    echo "[build:wasm] using CC_wasm32_unknown_unknown=$CC_wasm32_unknown_unknown"
  fi

  if [[ -z "${CC_wasm32_unknown_unknown:-}" ]]; then
    echo ""
    echo "[build:wasm] ERROR: no wasm-capable clang found."
    echo "  Apple's system clang cannot compile secp256k1-sys to wasm32."
    echo "  Fix it with:"
    echo "      brew install llvm"
    echo "  then re-run:  npm run build:wasm"
    echo ""
    exit 1
  fi
fi

exec wasm-pack build --target nodejs crates/miniscript_wasm
