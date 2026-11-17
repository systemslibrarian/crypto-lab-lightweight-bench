/**
 * GIFT — Banik, Pandey, Peyrin, Sasaki, Sim, Todo,
 * "GIFT: A Small Present — Towards Reaching the Limit of Lightweight
 * Encryption", IACR ePrint 2017/622, section 2.
 *
 * GIFT is PRESENT's design pushed to its limit: a 4-bit S-box, a bit
 * permutation that is free in hardware (it is wires), and a key schedule that
 * is a rotation. GIFT-64 runs 28 rounds, GIFT-128 runs 40; both take a 128-bit
 * key.
 *
 * Four conventions decide whether an implementation matches:
 *
 *  1. The key and the text are big-endian numbers: the first byte holds the
 *     most significant bits, and the key word k7 is the most significant.
 *  2. PermBits is a SCATTER map — the paper writes b_{P(i)} <- b_i, so the bit
 *     at position i MOVES TO P(i). (SKINNY's and PRINCE's cell permutations are
 *     gather maps; mixing the two up is mutation (8).)
 *  3. GIFT-64 adds the round key at bit positions 4i and 4i+1; GIFT-128 adds it
 *     at 4i+1 and 4i+2. Shifting GIFT-64's by one is mutation (4), and the
 *     all-zero vector CANNOT see it, because an all-zero round key XORs to
 *     nothing wherever you put it.
 *  4. There is no initial key addition and no whitening: round 1 begins with
 *     SubCells on the plaintext itself.
 */

import type { CipherVariant, RoundStep, TestVector } from './types';
import { GIFT_VECTORS } from '../vectors/gift';

/** Table 3: the GIFT S-box, shared by both block sizes. */
export const GS = [0x1, 0xa, 0x4, 0xc, 0x6, 0xf, 0x3, 0x9, 0x2, 0xd, 0xb, 0x7, 0x5, 0x0, 0x8, 0xe] as const;

export const GS_INV: readonly number[] = (() => {
  const inv = new Array<number>(16);
  for (let x = 0; x < 16; x++) inv[GS[x]] = x;
  return inv;
})();

/**
 * The 6-bit affine LFSR of section 2 — the same one SKINNY uses.
 *
 * Generated rather than transcribed, and checked against the printed table in
 * `gift.test.ts`. The bits are initialised to zero and updated BEFORE use, so
 * round 1 sees 0x01, not 0x00.
 */
export function roundConstants(count: number): number[] {
  const out: number[] = [];
  let v = 0;
  for (let i = 0; i < count; i++) {
    v = ((v << 1) & 0x3f) | (((v >> 5) ^ (v >> 4) ^ 1) & 1);
    out.push(v);
  }
  return out;
}

/** P64 and P128 from Tables 4 and 5, via the closed form the paper also gives. */
export function permutation(n: 64 | 128): number[] {
  const k = n === 64 ? 16 : 32;
  const p: number[] = [];
  for (let i = 0; i < n; i++) {
    const q = Math.floor(i / 16);
    const r = i % 16;
    p.push(4 * q + k * ((3 * Math.floor(r / 4) + (i % 4)) % 4) + (i % 4));
  }
  return p;
}

export interface GiftParams {
  readonly blockBits: 64 | 128;
  readonly rounds: number;
}

export const GIFT_PARAMS: readonly GiftParams[] = [
  { blockBits: 64, rounds: 28 },
  { blockBits: 128, rounds: 40 },
];

/** Big-endian bytes to a bit array with index 0 = the least significant bit. */
export function bytesToBits(bytes: Uint8Array): Uint8Array {
  const n = bytes.length * 8;
  const bits = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const byte = bytes.length - 1 - (i >> 3);
    bits[i] = (bytes[byte] >> (i & 7)) & 1;
  }
  return bits;
}

export function bitsToBytes(bits: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) bytes[bytes.length - 1 - (i >> 3)] |= 1 << (i & 7);
  }
  return bytes;
}

/** The key state as eight 16-bit words, k[7] the most significant. */
export function keyWords(key: Uint8Array): number[] {
  if (key.length !== 16) throw new Error('GIFT needs a 128-bit key');
  const k: number[] = [];
  for (let i = 0; i < 8; i++) k.push((key[i * 2] << 8) | key[i * 2 + 1]);
  return k.reverse(); // k[0] is the LAST printed word
}

const ror16 = (v: number, r: number) => ((v >>> r) | (v << (16 - r))) & 0xffff;
const rol16 = (v: number, r: number) => ((v << r) | (v >>> (16 - r))) & 0xffff;

/** k7||k6||...||k0 <- k1>>>2 || k0>>>12 || k7 || k6 | k5 | k4 | k3 | k2 */
export function updateKey(k: readonly number[]): number[] {
  return [k[2], k[3], k[4], k[5], k[6], k[7], ror16(k[0], 12), ror16(k[1], 2)];
}

/**
 * The inverse update, for decryption.
 *
 * `updateKey` sends k[0] to slot 6 (rotated by 12) and k[1] to slot 7 (rotated
 * by 2), so the inverse reads slot 6 back into 0 and slot 7 back into 1 — not
 * the other way round. Swapping those two lines leaves encryption and the
 * all-zero vector passing and breaks every non-zero decryption, which is how it
 * was caught here.
 */
export function unupdateKey(k: readonly number[]): number[] {
  return [rol16(k[6], 12), rol16(k[7], 2), k[0], k[1], k[2], k[3], k[4], k[5]];
}

function subCells(bits: Uint8Array): void {
  for (let i = 0; i < bits.length; i += 4) {
    const w = bits[i] | (bits[i + 1] << 1) | (bits[i + 2] << 2) | (bits[i + 3] << 3);
    const s = GS[w];
    bits[i] = s & 1;
    bits[i + 1] = (s >> 1) & 1;
    bits[i + 2] = (s >> 2) & 1;
    bits[i + 3] = (s >> 3) & 1;
  }
}

function subCellsInv(bits: Uint8Array): void {
  for (let i = 0; i < bits.length; i += 4) {
    const w = bits[i] | (bits[i + 1] << 1) | (bits[i + 2] << 2) | (bits[i + 3] << 3);
    const s = GS_INV[w];
    bits[i] = s & 1;
    bits[i + 1] = (s >> 1) & 1;
    bits[i + 2] = (s >> 2) & 1;
    bits[i + 3] = (s >> 3) & 1;
  }
}

/** b_{P(i)} <- b_i : a scatter map. */
function permBits(bits: Uint8Array, p: readonly number[]): Uint8Array {
  const out = new Uint8Array(bits.length);
  for (let i = 0; i < bits.length; i++) out[p[i]] = bits[i];
  return out;
}

function permBitsInv(bits: Uint8Array, p: readonly number[]): Uint8Array {
  const out = new Uint8Array(bits.length);
  for (let i = 0; i < bits.length; i++) out[i] = bits[p[i]];
  return out;
}

/** The round key as (U, V), each a `s`-bit integer in an array of bits. */
function roundKeyBits(k: readonly number[], blockBits: 64 | 128): { u: number[]; v: number[] } {
  if (blockBits === 64) {
    // U <- k1, V <- k0
    const u: number[] = [];
    const v: number[] = [];
    for (let i = 0; i < 16; i++) {
      u.push((k[1] >> i) & 1);
      v.push((k[0] >> i) & 1);
    }
    return { u, v };
  }
  // U <- k5||k4, V <- k1||k0 : the low half of each pair is the lower word.
  const u: number[] = [];
  const v: number[] = [];
  for (let i = 0; i < 16; i++) u.push((k[4] >> i) & 1);
  for (let i = 0; i < 16; i++) u.push((k[5] >> i) & 1);
  for (let i = 0; i < 16; i++) v.push((k[0] >> i) & 1);
  for (let i = 0; i < 16; i++) v.push((k[1] >> i) & 1);
  return { u, v };
}

function addRoundKey(bits: Uint8Array, k: readonly number[], rc: number, blockBits: 64 | 128): void {
  const { u, v } = roundKeyBits(k, blockBits);
  const s = blockBits / 4;
  if (blockBits === 64) {
    for (let i = 0; i < s; i++) {
      bits[4 * i + 1] ^= u[i];
      bits[4 * i] ^= v[i];
    }
  } else {
    for (let i = 0; i < s; i++) {
      bits[4 * i + 2] ^= u[i];
      bits[4 * i + 1] ^= v[i];
    }
  }
  bits[blockBits - 1] ^= 1;
  const spots = [3, 7, 11, 15, 19, 23];
  for (let b = 0; b < 6; b++) bits[spots[b]] ^= (rc >> b) & 1;
}

export function giftEncrypt(block: Uint8Array, key: Uint8Array, p: GiftParams): Uint8Array {
  const perm = permutation(p.blockBits);
  const rcs = roundConstants(p.rounds);
  let bits = bytesToBits(block);
  let k = keyWords(key);
  if (bits.length !== p.blockBits) throw new Error(`GIFT-${p.blockBits} needs a ${p.blockBits}-bit block`);
  for (let r = 0; r < p.rounds; r++) {
    subCells(bits);
    bits = permBits(bits, perm);
    addRoundKey(bits, k, rcs[r], p.blockBits);
    k = updateKey(k);
  }
  return bitsToBytes(bits);
}

export function giftDecrypt(block: Uint8Array, key: Uint8Array, p: GiftParams): Uint8Array {
  const perm = permutation(p.blockBits);
  const rcs = roundConstants(p.rounds);
  let bits = bytesToBits(block);
  // Wind the key state forward to the last round, then walk it back.
  let k = keyWords(key);
  for (let r = 0; r < p.rounds; r++) k = updateKey(k);
  for (let r = p.rounds - 1; r >= 0; r--) {
    k = unupdateKey(k);
    addRoundKey(bits, k, rcs[r], p.blockBits); // XOR is its own inverse
    bits = permBitsInv(bits, perm);
    subCellsInv(bits);
  }
  return bitsToBytes(bits);
}

function nibblesOf(bits: Uint8Array): string[] {
  const out: string[] = [];
  for (let i = bits.length - 4; i >= 0; i -= 4) {
    const w = bits[i] | (bits[i + 1] << 1) | (bits[i + 2] << 2) | (bits[i + 3] << 3);
    out.push(w.toString(16));
  }
  return out;
}

function giftTrace(block: Uint8Array, key: Uint8Array, p: GiftParams): RoundStep[] {
  const perm = permutation(p.blockBits);
  const rc = roundConstants(1)[0];
  const k = keyWords(key);
  let bits = bytesToBits(block);
  const steps: RoundStep[] = [
    { op: 'input', note: `the ${p.blockBits}-bit block as nibbles, most significant first`, state: nibblesOf(bits) },
  ];
  subCells(bits);
  steps.push({ op: 'SubCells', note: 'the 4-bit S-box GS on every nibble', state: nibblesOf(bits) });
  bits = permBits(bits, perm);
  steps.push({
    op: 'PermBits',
    note: 'bit i moves to P(i) — a scatter map, and free in hardware (it is wires)',
    state: nibblesOf(bits),
  });
  addRoundKey(bits, k, rc, p.blockBits);
  steps.push({
    op: 'AddRoundKey',
    note:
      p.blockBits === 64
        ? 'key bits at positions 4i and 4i+1, plus the constant and the single 1 at the top'
        : 'key bits at positions 4i+1 and 4i+2, plus the constant and the single 1 at the top',
    state: nibblesOf(bits),
  });
  steps.push({ op: 'output', note: 'one GIFT round complete; the key state now rotates', state: nibblesOf(bits) });
  return steps;
}

function variantFor(p: GiftParams, vectors: readonly TestVector[]): CipherVariant {
  const label = `GIFT-${p.blockBits}`;
  return {
    id: `gift-${p.blockBits}`,
    family: 'GIFT',
    label,
    blockBits: p.blockBits,
    keyBits: 128,
    rounds: p.rounds,
    layout: { kind: 'nibbles', count: p.blockBits / 4 },
    encrypt: (b, k) => giftEncrypt(b, k, p),
    decrypt: (b, k) => giftDecrypt(b, k, p),
    traceRound: (b, k) => giftTrace(b, k, p),
    vectors: vectors.filter((v) => v.label === label),
  };
}

export const GIFT_VARIANTS: readonly CipherVariant[] = GIFT_PARAMS.map((p) => variantFor(p, GIFT_VECTORS));
