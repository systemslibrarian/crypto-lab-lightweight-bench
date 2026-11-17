/**
 * PRINCE — Borghoff, Canteaut, Güneysu, Kavun, Knežević, Knudsen, Leander,
 * Nikov, Paar, Rechberger, Rombouts, Thomsen, Yalçın,
 * "PRINCE — A Low-latency Block Cipher for Pervasive Computing Applications",
 * IACR ePrint 2012/529, sections 2 and 3.3.
 *
 * PRINCE is the low-LATENCY one: 12 rounds, one 64-bit block, designed to be
 * unrolled so a block encrypts in a single clock cycle. It is built on FX — two
 * whitening keys around a 12-round core — and the core has the property this
 * lab exists to show:
 *
 *   ALPHA-REFLECTION. The round constants satisfy RC_i XOR RC_(11-i) = alpha,
 *   and the middle layer M' is an involution. So the inverse of PRINCEcore
 *   under key k is PRINCEcore under k XOR alpha, and therefore
 *
 *       D_(k0||k0'||k1)(.) = E_(k0'||k0||k1 XOR alpha)(.)
 *
 *   Decryption is the ENCRYPTION circuit with the two whitening keys swapped
 *   and alpha added to the core key. No inverse S-box, no inverse matrix, no
 *   second circuit. `decryptByReflection` below is literally a call to
 *   `encrypt`; `decryptStepwise` is the ordinary inverse, and exhibit 4 checks
 *   the two against each other on random blocks.
 *
 * Conventions: nibbles are most-significant-first, as are the bits inside M'.
 * The nibble permutation SR is a GATHER map (new[i] = old[SR[i]]); applying it
 * as a scatter is mutation (8). M is M' followed by SR.
 */

import type { CipherVariant, RoundStep, TestVector } from './types';
import { PRINCE_VECTORS } from '../vectors/prince';

/** Section 2's S-box. */
export const PS = [0xb, 0xf, 0x3, 0x2, 0xa, 0xc, 0x9, 0x1, 0x6, 0x7, 0x8, 0x0, 0xe, 0x5, 0xd, 0x4] as const;

export const PS_INV: readonly number[] = (() => {
  const inv = new Array<number>(16);
  for (let x = 0; x < 16; x++) inv[PS[x]] = x;
  return inv;
})();

/** Section 2's round constants. RC_i XOR RC_(11-i) = alpha for every i. */
export const RC: readonly bigint[] = [
  0x0000000000000000n,
  0x13198a2e03707344n,
  0xa4093822299f31d0n,
  0x082efa98ec4e6c89n,
  0x452821e638d01377n,
  0xbe5466cf34e90c6cn,
  0x7ef84f78fd955cb1n,
  0x85840851f1ac43aan,
  0xc882d32f25323c54n,
  0x64a51195e0e3610dn,
  0xd3b5a399ca0c2399n,
  0xc0ac29b7c97c50ddn,
];

/** alpha = RC_11. */
export const ALPHA = 0xc0ac29b7c97c50ddn;

/** Section 3.3: SR permutes the 16 nibbles like the AES shift rows. */
export const SR = [0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12, 1, 6, 11] as const;

const M64 = 0xffffffffffffffffn;

/**
 * M', built from the paper's own building blocks rather than transcribed.
 *
 * M0..M3 are the four 4x4 matrices of section 3.3; M-hat(0) and M-hat(1) are the
 * two 16x16 block matrices; M' is block diagonal with
 * (M-hat(0), M-hat(1), M-hat(1), M-hat(0)) on the diagonal. Building it this way
 * means the involution property is a CONSEQUENCE that `prince.test.ts` checks,
 * not an assumption.
 *
 * `MPRIME[j]` is the set of input bit positions that contribute to output bit
 * position j, as a 64-bit mask. Bit 63 is the most significant.
 */
export const MPRIME: readonly bigint[] = (() => {
  // M_t is the 4x4 identity with row t zeroed.
  const block = (t: number): number[][] => {
    const m: number[][] = [];
    for (let r = 0; r < 4; r++) {
      const row = [0, 0, 0, 0];
      if (r !== t) row[r] = 1;
      m.push(row);
    }
    return m;
  };
  const M = [0, 1, 2, 3].map(block);

  // M-hat(v): a 4x4 arrangement of blocks, row r holding M_{(r + v) mod 4} ...
  const hat = (v: number): number[][] => {
    const out: number[][] = Array.from({ length: 16 }, () => new Array<number>(16).fill(0));
    for (let br = 0; br < 4; br++) {
      for (let bc = 0; bc < 4; bc++) {
        const which = (br + bc + v) % 4;
        const b = M[which];
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[br * 4 + r][bc * 4 + c] = b[r][c];
      }
    }
    return out;
  };

  const diag = [hat(0), hat(1), hat(1), hat(0)];
  const masks: bigint[] = [];
  // Bits are numbered most-significant-first inside M', so output row index 0
  // of the first diagonal block is state bit 63.
  for (let blk = 0; blk < 4; blk++) {
    for (let r = 0; r < 16; r++) {
      let mask = 0n;
      for (let c = 0; c < 16; c++) {
        if (diag[blk][r][c]) mask |= 1n << BigInt(63 - (blk * 16 + c));
      }
      masks.push(mask);
    }
  }
  return masks;
})();

function parity(v: bigint): bigint {
  let x = v;
  x ^= x >> 32n;
  x ^= x >> 16n;
  x ^= x >> 8n;
  x ^= x >> 4n;
  x ^= x >> 2n;
  x ^= x >> 1n;
  return x & 1n;
}

/** The M'-layer: a 64x64 binary matrix multiply, bit 63 most significant. */
export function mPrime(x: bigint): bigint {
  let out = 0n;
  for (let j = 0; j < 64; j++) {
    if (parity(x & MPRIME[j]) === 1n) out |= 1n << BigInt(63 - j);
  }
  return out & M64;
}

/** SR as a GATHER map on nibbles: new nibble i is old nibble SR[i]. */
export function shiftNibbles(x: bigint, perm: readonly number[]): bigint {
  let out = 0n;
  for (let i = 0; i < 16; i++) {
    const nib = (x >> BigInt(60 - 4 * perm[i])) & 0xfn;
    out |= nib << BigInt(60 - 4 * i);
  }
  return out & M64;
}

export const SR_INV: readonly number[] = (() => {
  const inv = new Array<number>(16);
  for (let i = 0; i < 16; i++) inv[SR[i]] = i;
  return inv;
})();

/** M = SR o M'. */
export function mLayer(x: bigint): bigint {
  return shiftNibbles(mPrime(x), SR);
}

export function mLayerInv(x: bigint): bigint {
  // M' is an involution, so M^-1 = M' o SR^-1.
  return mPrime(shiftNibbles(x, SR_INV));
}

function sBox(x: bigint, table: readonly number[]): bigint {
  let out = 0n;
  for (let i = 0; i < 16; i++) {
    const nib = Number((x >> BigInt(60 - 4 * i)) & 0xfn);
    out |= BigInt(table[nib]) << BigInt(60 - 4 * i);
  }
  return out & M64;
}

/** P(x) = (x >>> 1) XOR (x >> 63) — the k0' expansion of section 3.4. */
export function expandK0(k0: bigint): bigint {
  return (((k0 >> 1n) | ((k0 & 1n) << 63n)) ^ (k0 >> 63n)) & M64;
}

/**
 * PRINCEcore: 12 rounds around an involutive middle layer.
 *
 * Forward round i (1..5):  S, M, XOR RC_i, XOR k1
 * Middle:                  S, M', S^-1
 * Backward round i (6..10): XOR k1, XOR RC_i, M^-1, S^-1
 */
export function princeCore(x: bigint, k1: bigint): bigint {
  let s = (x ^ k1 ^ RC[0]) & M64;
  for (let i = 1; i <= 5; i++) {
    s = sBox(s, PS);
    s = mLayer(s);
    s = (s ^ RC[i] ^ k1) & M64;
  }
  s = sBox(s, PS);
  s = mPrime(s);
  s = sBox(s, PS_INV);
  for (let i = 6; i <= 10; i++) {
    s = (s ^ k1 ^ RC[i]) & M64;
    s = mLayerInv(s);
    s = sBox(s, PS_INV);
  }
  return (s ^ RC[11] ^ k1) & M64;
}

function splitKey(key: Uint8Array): { k0: bigint; k0p: bigint; k1: bigint } {
  if (key.length !== 16) throw new Error('PRINCE needs a 128-bit key (k0 || k1)');
  let k0 = 0n;
  let k1 = 0n;
  for (let i = 0; i < 8; i++) k0 = (k0 << 8n) | BigInt(key[i]);
  for (let i = 8; i < 16; i++) k1 = (k1 << 8n) | BigInt(key[i]);
  return { k0, k0p: expandK0(k0), k1 };
}

function toBytes(v: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let x = v & M64;
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

function fromBytes(b: Uint8Array): bigint {
  if (b.length !== 8) throw new Error('PRINCE needs a 64-bit block');
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  return v;
}

/** c = k0' XOR PRINCEcore_k1(m XOR k0). */
export function princeEncrypt(block: Uint8Array, key: Uint8Array): Uint8Array {
  const { k0, k0p, k1 } = splitKey(key);
  return toBytes(princeCore(fromBytes(block) ^ k0, k1) ^ k0p);
}

/**
 * Decryption by the ALPHA-REFLECTION property — the same encryption routine.
 *
 * Swap the two whitening keys and add alpha to the core key. Nothing here
 * calls an inverse S-box or an inverse matrix: the only inverse in sight is the
 * one PRINCE does not need.
 */
export function decryptByReflection(block: Uint8Array, key: Uint8Array, alpha = ALPHA): Uint8Array {
  const { k0, k0p, k1 } = splitKey(key);
  const swapped = new Uint8Array(16);
  toBytes(k0p).forEach((b, i) => (swapped[i] = b));
  toBytes(k1 ^ alpha).forEach((b, i) => (swapped[8 + i] = b));
  // Reassemble (k0' || k1 XOR alpha) and encrypt with it: the whitening keys are
  // swapped because k0' is now the input whitening key and k0 the output one.
  const { k0: a, k0p: _unused, k1: c } = splitKey(swapped);
  void _unused;
  return toBytes(princeCore(fromBytes(block) ^ a, c) ^ k0);
}

/** The ordinary inverse, built step by step, for exhibit 4 to compare against. */
export function decryptStepwise(block: Uint8Array, key: Uint8Array): Uint8Array {
  const { k0, k0p, k1 } = splitKey(key);
  let s = (fromBytes(block) ^ k0p ^ RC[11] ^ k1) & M64;
  for (let i = 10; i >= 6; i--) {
    s = sBox(s, PS);
    s = mLayer(s);
    s = (s ^ RC[i] ^ k1) & M64;
  }
  s = sBox(s, PS);
  s = mPrime(s);
  s = sBox(s, PS_INV);
  for (let i = 5; i >= 1; i--) {
    s = (s ^ k1 ^ RC[i]) & M64;
    s = mLayerInv(s);
    s = sBox(s, PS_INV);
  }
  return toBytes((s ^ k1 ^ RC[0] ^ k0) & M64);
}

const nibbles = (v: bigint) => {
  const out: string[] = [];
  for (let i = 0; i < 16; i++) out.push((((v >> BigInt(60 - 4 * i)) & 0xfn)).toString(16));
  return out;
};

function princeTrace(block: Uint8Array, key: Uint8Array): RoundStep[] {
  const { k0, k1 } = splitKey(key);
  const m = fromBytes(block);
  const afterWhiten = m ^ k0;
  const afterK1 = afterWhiten ^ k1 ^ RC[0];
  const afterS = sBox(afterK1, PS);
  const afterMp = mPrime(afterS);
  const afterSR = shiftNibbles(afterMp, SR);
  const afterRC = afterSR ^ RC[1] ^ k1;
  return [
    { op: 'input', note: 'one 64-bit block as 16 nibbles, most significant first', state: nibbles(m) },
    { op: 'XOR k₀', note: 'input whitening — PRINCE is an FX construction', state: nibbles(afterWhiten) },
    { op: 'XOR k₁, RC₀', note: 'the core key and RC₀ (which is zero)', state: nibbles(afterK1) },
    { op: 'S', note: 'the 4-bit S-box, chosen to be cheap and shallow in hardware', state: nibbles(afterS) },
    { op: "M′", note: 'the involutive linear layer — this is what makes reflection work', state: nibbles(afterMp) },
    { op: 'SR', note: 'nibble shift rows (a gather map); M = SR after M′', state: nibbles(afterSR) },
    { op: 'XOR RC₁, k₁', note: 'round constant 1 and the core key end round 1', state: nibbles(afterRC) },
  ];
}

export const PRINCE_VARIANT: CipherVariant = {
  id: 'prince-64-128',
  family: 'PRINCE',
  label: 'PRINCE',
  blockBits: 64,
  keyBits: 128,
  rounds: 12,
  layout: { kind: 'nibbles', count: 16 },
  encrypt: princeEncrypt,
  decrypt: decryptByReflection,
  traceRound: princeTrace,
  vectors: PRINCE_VECTORS as readonly TestVector[],
};

export const PRINCE_VARIANTS: readonly CipherVariant[] = [PRINCE_VARIANT];
