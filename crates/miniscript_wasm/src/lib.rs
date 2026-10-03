//! MiniCopilot WebAssembly engine.
//!
//! Wraps `rust-miniscript` to turn an abstract *Concrete Policy* string
//! (Pieter Wuille's policy language) into:
//!   - compiled Miniscript (Segwit v0)
//!   - a `wsh(...)#checksum` descriptor
//!   - ScriptPubKey / witness-script ASM
//!   - sanity + non-malleability analysis
//!   - the maximum satisfaction witness size
//!
//! Because the policy uses *named* keys (e.g. `pk(alice)`), we deterministically
//! substitute each name with a real dummy secp256k1 public key so that we can
//! render concrete Script ASM and compute a valid descriptor checksum. The
//! human-readable outputs keep the original names.

use std::collections::BTreeMap;
use std::str::FromStr;

use miniscript::bitcoin::secp256k1::{Secp256k1, SecretKey};
use miniscript::bitcoin::hashes::{sha256, Hash};
use miniscript::bitcoin::PublicKey;
use miniscript::descriptor::Wsh;
use miniscript::policy::Concrete;
use miniscript::{Miniscript, Segwitv0};
use serde::Serialize;
use serde_wasm_bindgen::Serializer;
use wasm_bindgen::prelude::*;

#[derive(Serialize, Default)]
struct CompileResult {
    /// Compiled Miniscript expression, using the original *named* keys.
    miniscript: String,
    /// `wsh(<miniscript>)#checksum` using the named keys.
    descriptor: String,
    /// `wsh(<miniscript>)#checksum` using the substituted concrete public keys.
    descriptor_concrete: String,
    /// ScriptPubKey / witness-script assembly (concrete keys).
    asm: String,
    /// Maximum satisfaction witness size, in weight units (bytes).
    max_witness_size: usize,
    /// Whether the compiled Miniscript passes `sanity_check`.
    is_sane: bool,
    /// Whether the compiled Miniscript is provably non-malleable.
    is_non_malleable: bool,
    /// Mapping from named key -> concrete dummy public key used for ASM.
    key_map: BTreeMap<String, String>,
    /// Present only on failure.
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Compile a concrete policy string into the full analysis bundle.
///
/// Always returns a JS object matching `CompileResult`. On failure the `error`
/// field is populated and the remaining fields are left at their defaults.
#[wasm_bindgen]
pub fn compile_policy(policy_str: &str) -> JsValue {
    let result = match compile_inner(policy_str) {
        Ok(r) => r,
        Err(e) => CompileResult {
            error: Some(e),
            ..Default::default()
        },
    };
    // Serialize maps as plain JS objects (not `Map`) so JS can read `key_map`
    // with normal property access.
    let serializer = Serializer::new().serialize_maps_as_objects(true);
    result.serialize(&serializer).unwrap_or(JsValue::NULL)
}

fn compile_inner(policy_str: &str) -> Result<CompileResult, String> {
    let policy_str = policy_str.trim();
    if policy_str.is_empty() {
        return Err("Empty policy string.".to_string());
    }

    // 1. Parse the concrete policy (named keys).
    let policy = Concrete::<String>::from_str(policy_str)
        .map_err(|e| format!("Policy parse error: {e}"))?;

    // 2. Compile into an optimal Segwit v0 Miniscript.
    let ms_named: Miniscript<String, Segwitv0> = policy
        .compile::<Segwitv0>()
        .map_err(|e| format!("Compilation error: {e}"))?;

    let miniscript = ms_named.to_string();

    // 3. Substitute named keys with deterministic dummy public keys so we can
    //    produce real Script + a valid checksum.
    let names = collect_key_names(policy_str);
    let mut key_map: BTreeMap<String, String> = BTreeMap::new();
    for name in &names {
        key_map.insert(name.clone(), dummy_pubkey(name).to_string());
    }
    let concrete_str = substitute_tokens(&miniscript, &key_map);

    let ms_concrete: Miniscript<PublicKey, Segwitv0> =
        Miniscript::<PublicKey, Segwitv0>::from_str(&concrete_str)
            .map_err(|e| format!("Concrete miniscript parse error: {e}"))?;

    // 4. Analysis (structural, computed on the concrete key variant).
    let is_sane = ms_concrete.sanity_check().is_ok();
    let is_non_malleable = ms_concrete.is_non_malleable();
    let max_witness_size = ms_concrete.max_satisfaction_size().unwrap_or(0);

    // 5. Script ASM (witness script / redeem miniscript).
    let asm = ms_concrete.encode().to_asm_string();

    // 6. Descriptors.
    let wsh = Wsh::new(ms_concrete).map_err(|e| format!("wsh error: {e}"))?;
    let descriptor_concrete = wsh.to_string();

    let named_desc_body = format!("wsh({miniscript})");
    let descriptor = match desc_checksum(&named_desc_body) {
        Some(cs) => format!("{named_desc_body}#{cs}"),
        None => named_desc_body,
    };

    Ok(CompileResult {
        miniscript,
        descriptor,
        descriptor_concrete,
        asm,
        max_witness_size,
        is_sane,
        is_non_malleable,
        key_map,
        error: None,
    })
}

/// Extract the set of key names appearing as `pk(NAME)` in a policy string.
fn collect_key_names(policy: &str) -> Vec<String> {
    let bytes = policy.as_bytes();
    let mut names: Vec<String> = Vec::new();
    let mut i = 0usize;
    while i + 3 <= bytes.len() {
        // Look for the token `pk` followed by `(`, not part of a longer ident.
        if &policy[i..i + 2] == "pk" && bytes.get(i + 2) == Some(&b'(') {
            let prev_ok = i == 0 || !is_ident_byte(bytes[i - 1]);
            if prev_ok {
                let start = i + 3;
                let mut j = start;
                while j < bytes.len() && bytes[j] != b')' {
                    j += 1;
                }
                let name = policy[start..j].trim().to_string();
                if !name.is_empty() && !names.contains(&name) {
                    names.push(name);
                }
                i = j;
                continue;
            }
        }
        i += 1;
    }
    names
}

fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

/// Replace whole identifier tokens found in `map` with their mapped values.
/// Tokens are maximal runs of `[A-Za-z0-9_]`; only exact matches are replaced,
/// so fragment names and numbers are untouched.
fn substitute_tokens(input: &str, map: &BTreeMap<String, String>) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0usize;
    while i < bytes.len() {
        if is_ident_byte(bytes[i]) {
            let start = i;
            while i < bytes.len() && is_ident_byte(bytes[i]) {
                i += 1;
            }
            let token = &input[start..i];
            match map.get(token) {
                Some(replacement) => out.push_str(replacement),
                None => out.push_str(token),
            }
        } else {
            out.push(bytes[i] as char);
            i += 1;
        }
    }
    out
}

/// Deterministically derive a valid compressed public key from a key name.
fn dummy_pubkey(name: &str) -> PublicKey {
    let secp = Secp256k1::signing_only();
    // Hash the name to 32 bytes and nudge until it is a valid secret key.
    let mut bytes = sha256::Hash::hash(name.as_bytes()).to_byte_array();
    let sk = loop {
        match SecretKey::from_slice(&bytes) {
            Ok(sk) => break sk,
            Err(_) => {
                bytes[0] ^= 0x01;
            }
        }
    };
    let inner = sk.public_key(&secp);
    PublicKey {
        compressed: true,
        inner,
    }
}

/// Compute the 8-character descriptor checksum (BIP-380 / Bitcoin Core algo).
fn desc_checksum(desc: &str) -> Option<String> {
    const INPUT_CHARSET: &str =
        "0123456789()[],'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#\"\\ ";
    const CHECKSUM_CHARSET: &[u8] = b"qpzry9x8gf2tvdw0s3jn54khce6mua7l";

    fn polymod(mut c: u64, val: u64) -> u64 {
        let c0 = c >> 35;
        c = ((c & 0x7_ffff_ffff) << 5) ^ val;
        if c0 & 1 != 0 {
            c ^= 0xf5de_e519_89;
        }
        if c0 & 2 != 0 {
            c ^= 0xa9fd_ca33_12;
        }
        if c0 & 4 != 0 {
            c ^= 0x1bab_10e3_2d;
        }
        if c0 & 8 != 0 {
            c ^= 0x3706_b167_7a;
        }
        if c0 & 16 != 0 {
            c ^= 0x644d_626f_fd;
        }
        c
    }

    let charset: Vec<char> = INPUT_CHARSET.chars().collect();
    let mut c: u64 = 1;
    let mut cls: u64 = 0;
    let mut clscount: u64 = 0;
    for ch in desc.chars() {
        let pos = charset.iter().position(|&x| x == ch)? as u64;
        c = polymod(c, pos & 31);
        cls = cls * 3 + (pos >> 5);
        clscount += 1;
        if clscount == 3 {
            c = polymod(c, cls);
            cls = 0;
            clscount = 0;
        }
    }
    if clscount > 0 {
        c = polymod(c, cls);
    }
    for _ in 0..8 {
        c = polymod(c, 0);
    }
    c ^= 1;

    let mut result = String::with_capacity(8);
    for j in 0..8 {
        let idx = ((c >> (5 * (7 - j))) & 31) as usize;
        result.push(CHECKSUM_CHARSET[idx] as char);
    }
    Some(result)
}
