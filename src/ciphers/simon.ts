/**
 * SIMON — Beaulieu, Shors, Smith, Treatman-Clark, Weeks, Wingers,
 * "The SIMON and SPECK Families of Lightweight Block Ciphers",
 * IACR ePrint 2013/404, section 3.
 *
 * SIMON is the AND-rotate-XOR half of the pair, tuned for hardware: its round
 * function is a two-stage Feistel map whose only nonlinearity is a bitwise AND
 * of two rotations of the same word.
 *
 *   R_k(x, y) = (y XOR f(x) XOR k, x),  f(x) = (S^1 x & S^8 x) XOR S^2 x
 *
 * Three conventions decide whether an implementation matches the published
 * vectors, and all three are easy to get backwards:
 *
 *  1. The printed key is (k[m-1], ..., k[1], k[0]). The RIGHTMOST printed word
 *     is k[0], which is the FIRST round key. The paper says it directly —
 *     "they are loaded into the shift registers with k0 on the right and k_{m-1}
 *     on the left" (section 3.2). Reading the printed words left to right as
 *     k[0], k[1], ... produces a cipher that is self-consistent, decrypts its
 *     own ciphertext, and agrees with no published vector.
 *  2. The round constant for round key index i+m is (z_j)_i, so round key r
 *     takes bit (r - m) of the sequence, read LEFT TO RIGHT from the paper's
 *     printed string.
 *  3. c = 2^n - 4, i.e. 0xff...fc, not 0xff...ff.
 */

import { bytesToWords, mask, rotl, rotr, wordHex, wordsToBytes } from './words';
import type { CipherVariant, RoundStep, TestVector } from './types';
import { SIMON_VECTORS } from '../vectors/simon';

/**
 * The five constant sequences of section 3.2, printed as the paper prints them.
 *
 * z0 and z1 are the period-31 sequences u and v; the paper prints 31 bits each.
 * z2, z3 and z4 have period 62 and the paper prints them as two 31-bit halves.
 * Stored here as the 62-bit window that round indexing reads, so `(r - m) % 62`
 * is a single uniform rule: for z0 and z1 that window is u (resp. v) written
 * twice, which is what period 31 means.
 */
const U = '1111101000100101011000011100110';
const V = '1000111011111001001100001011010';

export const Z_SEQUENCES: Readonly<Record<string, string>> = {
  z0: U + U,
  z1: V + V,
  z2: '1010111101110000001101001001100' + '0101000010001111110010110110011',
  z3: '1101101110101100011001011110000' + '0010010001010011100110100001111',
  z4: '1101000111100110101101100010000' + '0010111000011001010010011101111',
};

/** Table 3.1: block size, key size, word size, key words, sequence, rounds. */
export interface SimonParams {
  readonly blockBits: number;
  readonly keyBits: number;
  readonly n: number;
  readonly m: number;
  readonly z: keyof typeof Z_SEQUENCES;
  readonly rounds: number;
}

export const SIMON_PARAMS: readonly SimonParams[] = [
  { blockBits: 32, keyBits: 64, n: 16, m: 4, z: 'z0', rounds: 32 },
  { blockBits: 48, keyBits: 72, n: 24, m: 3, z: 'z0', rounds: 36 },
  { blockBits: 48, keyBits: 96, n: 24, m: 4, z: 'z1', rounds: 36 },
  { blockBits: 64, keyBits: 96, n: 32, m: 3, z: 'z2', rounds: 42 },
  { blockBits: 64, keyBits: 128, n: 32, m: 4, z: 'z3', rounds: 44 },
  { blockBits: 96, keyBits: 96, n: 48, m: 2, z: 'z2', rounds: 52 },
  { blockBits: 96, keyBits: 144, n: 48, m: 3, z: 'z3', rounds: 54 },
  { blockBits: 128, keyBits: 128, n: 64, m: 2, z: 'z2', rounds: 68 },
  { blockBits: 128, keyBits: 192, n: 64, m: 3, z: 'z3', rounds: 69 },
  { blockBits: 128, keyBits: 256, n: 64, m: 4, z: 'z4', rounds: 72 },
];

/** f(x) = (S^1 x & S^8 x) XOR S^2 x */
export function simonF(x: bigint, n: number): bigint {
  return ((rotl(x, 1, n) & rotl(x, 8, n)) ^ rotl(x, 2, n)) & mask(n);
}

/**
 * The key schedule of section 3.2.
 *
 * `keyWords` arrives as k[0], k[1], ..., k[m-1] — least significant first,
 * i.e. the printed order REVERSED. See the header note.
 */
export function simonKeySchedule(keyWords: readonly bigint[], p: SimonParams): bigint[] {
  const { n, m, rounds } = p;
  if (keyWords.length !== m) throw new Error(`SIMON ${p.blockBits}/${p.keyBits} needs ${m} key words`);
  const z = Z_SEQUENCES[p.z];
  const c = mask(n) ^ 3n; // 2^n - 4
  const k = keyWords.slice();
  for (let i = 0; i + m < rounds; i++) {
    const zi = BigInt(z.charCodeAt((i % 62)) - 48);
    let tmp: bigint;
    if (m === 4) {
      tmp = rotr(k[i + 3], 3, n) ^ k[i + 1];
      tmp = tmp ^ rotr(tmp, 1, n);
    } else {
      tmp = rotr(k[i + (m === 2 ? 1 : 2)], 3, n);
      tmp = tmp ^ rotr(tmp, 1, n);
    }
    k.push((c ^ zi ^ k[i] ^ tmp) & mask(n));
  }
  return k;
}

function paramsFor(blockBits: number, keyBits: number): SimonParams {
  const p = SIMON_PARAMS.find((q) => q.blockBits === blockBits && q.keyBits === keyBits);
  if (!p) throw new Error(`no SIMON version with block ${blockBits} and key ${keyBits}`);
  return p;
}

/**
 * Split a key into round-key-order words.
 *
 * The printed key is (k[m-1], ..., k[0]); the schedule wants k[0] first, so the
 * printed words are reversed. Mutation (1) in the ledger deletes this reverse.
 */
export function simonKeyWords(key: Uint8Array, p: SimonParams): bigint[] {
  return bytesToWords(key, p.n).reverse();
}

export function simonEncrypt(block: Uint8Array, key: Uint8Array, p: SimonParams): Uint8Array {
  const n = p.n;
  const rk = simonKeySchedule(simonKeyWords(key, p), p);
  let [x, y] = bytesToWords(block, n);
  for (let r = 0; r < p.rounds; r++) {
    const nx = (y ^ simonF(x, n) ^ rk[r]) & mask(n);
    y = x;
    x = nx;
  }
  return wordsToBytes([x, y], n);
}

export function simonDecrypt(block: Uint8Array, key: Uint8Array, p: SimonParams): Uint8Array {
  const n = p.n;
  const rk = simonKeySchedule(simonKeyWords(key, p), p);
  let [x, y] = bytesToWords(block, n);
  for (let r = p.rounds - 1; r >= 0; r--) {
    // R^-1_k(x, y) = (y, x XOR f(y) XOR k)
    const ny = (x ^ simonF(y, n) ^ rk[r]) & mask(n);
    x = y;
    y = ny;
  }
  return wordsToBytes([x, y], n);
}

function simonTrace(block: Uint8Array, key: Uint8Array, p: SimonParams): RoundStep[] {
  const n = p.n;
  const rk = simonKeySchedule(simonKeyWords(key, p), p);
  const [x, y] = bytesToWords(block, n);
  const h = (v: bigint) => wordHex(v, n);
  const pair = (a: bigint, b: bigint) => [h(a), h(b)];

  const s1 = rotl(x, 1, n);
  const s8 = rotl(x, 8, n);
  const and = s1 & s8;
  const s2 = rotl(x, 2, n);
  const f = and ^ s2;
  const withY = y ^ f;
  const nx = withY ^ rk[0];

  return [
    { op: 'input (x, y)', note: `the block as two ${n}-bit words, x on the left`, state: pair(x, y) },
    { op: 'S¹ x, S⁸ x', note: 'two left rotations of the same word', state: pair(s1, s8) },
    { op: '&', note: 'bitwise AND — the only nonlinear operation in SIMON', state: pair(and, s2) },
    { op: 'XOR S² x', note: 'f(x) = (S¹x & S⁸x) XOR S²x', state: pair(f, y) },
    { op: 'XOR y', note: 'the Feistel XOR into the other half', state: pair(withY, x) },
    { op: 'XOR k₀', note: `round key 0 = ${h(rk[0])} (the RIGHTMOST printed key word)`, state: pair(nx, x) },
    { op: 'output (x, y)', note: 'halves swapped: the new x is the computed word', state: pair(nx, x) },
  ];
}

function variantFor(p: SimonParams, vectors: readonly TestVector[]): CipherVariant {
  const label = `SIMON ${p.blockBits}/${p.keyBits}`;
  return {
    id: `simon-${p.blockBits}-${p.keyBits}`,
    family: 'SIMON',
    label,
    blockBits: p.blockBits,
    keyBits: p.keyBits,
    rounds: p.rounds,
    layout: { kind: 'words', count: 2, bits: p.n },
    encrypt: (b, k) => simonEncrypt(b, k, p),
    decrypt: (b, k) => simonDecrypt(b, k, p),
    traceRound: (b, k) => simonTrace(b, k, p),
    vectors: vectors.filter((v) => v.label === label),
  };
}

export const SIMON_VARIANTS: readonly CipherVariant[] = SIMON_PARAMS.map((p) =>
  variantFor(p, SIMON_VECTORS),
);

export { paramsFor as simonParamsFor };
