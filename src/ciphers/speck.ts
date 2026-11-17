/**
 * SPECK — Beaulieu, Shors, Smith, Treatman-Clark, Weeks, Wingers,
 * "The SIMON and SPECK Families of Lightweight Block Ciphers",
 * IACR ePrint 2013/404, section 4.
 *
 * SPECK is the add-rotate-XOR half of the pair, tuned for software: the whole
 * cipher is a modular addition, two rotations and two XORs per round.
 *
 *   R_k(x, y) = ((S^-a x + y) XOR k,  S^b y XOR (S^-a x + y) XOR k)
 *
 * with (a, b) = (7, 2) when the word is 16 bits and (8, 3) at every other size.
 * Hard-coding (7, 2) everywhere is mutation (2) in the ledger: SPECK32/64 still
 * passes, so a suite that tests only the smallest size cannot see it.
 *
 * The key is printed as (l[m-2], ..., l[0], k[0]) — the RIGHTMOST printed word
 * is k[0], the first round key, exactly as in SIMON. The round counter in the
 * key schedule starts at 0, and it is XORed in as a word, so at m = 2 the
 * schedule is the round function itself with i in place of a key.
 */

import { addMod, bytesToWords, mask, rotl, rotr, subMod, wordHex, wordsToBytes } from './words';
import type { CipherVariant, RoundStep, TestVector } from './types';
import { SPECK_VECTORS } from '../vectors/speck';

/** Table 4.1: block size, key size, word size, key words, rotations, rounds. */
export interface SpeckParams {
  readonly blockBits: number;
  readonly keyBits: number;
  readonly n: number;
  readonly m: number;
  readonly alpha: number;
  readonly beta: number;
  readonly rounds: number;
}

export const SPECK_PARAMS: readonly SpeckParams[] = [
  { blockBits: 32, keyBits: 64, n: 16, m: 4, alpha: 7, beta: 2, rounds: 22 },
  { blockBits: 48, keyBits: 72, n: 24, m: 3, alpha: 8, beta: 3, rounds: 22 },
  { blockBits: 48, keyBits: 96, n: 24, m: 4, alpha: 8, beta: 3, rounds: 23 },
  { blockBits: 64, keyBits: 96, n: 32, m: 3, alpha: 8, beta: 3, rounds: 26 },
  { blockBits: 64, keyBits: 128, n: 32, m: 4, alpha: 8, beta: 3, rounds: 27 },
  { blockBits: 96, keyBits: 96, n: 48, m: 2, alpha: 8, beta: 3, rounds: 28 },
  { blockBits: 96, keyBits: 144, n: 48, m: 3, alpha: 8, beta: 3, rounds: 29 },
  { blockBits: 128, keyBits: 128, n: 64, m: 2, alpha: 8, beta: 3, rounds: 32 },
  { blockBits: 128, keyBits: 192, n: 64, m: 3, alpha: 8, beta: 3, rounds: 33 },
  { blockBits: 128, keyBits: 256, n: 64, m: 4, alpha: 8, beta: 3, rounds: 34 },
];

/** One round of SPECK on a word pair. Used by the cipher and by exhibit 5. */
export function speckRound(x: bigint, y: bigint, k: bigint, p: SpeckParams): [bigint, bigint] {
  const { n, alpha, beta } = p;
  const sum = addMod(rotr(x, alpha, n), y, n);
  const nx = sum ^ k;
  const ny = rotl(y, beta, n) ^ nx;
  return [nx & mask(n), ny & mask(n)];
}

function speckRoundInverse(x: bigint, y: bigint, k: bigint, p: SpeckParams): [bigint, bigint] {
  const { n, alpha, beta } = p;
  // R^-1_k(x, y) = (S^a((x XOR k) - S^-b(x XOR y)), S^-b(x XOR y))
  const ny = rotr(x ^ y, beta, n);
  const nx = rotl(subMod(x ^ k, ny, n), alpha, n);
  return [nx & mask(n), ny & mask(n)];
}

/**
 * The key schedule of section 4.2.
 *
 * `printed` arrives in the paper's printed order: (l[m-2], ..., l[0], k[0]).
 */
export function speckKeySchedule(printed: readonly bigint[], p: SpeckParams): bigint[] {
  const { n, m, alpha, beta, rounds } = p;
  if (printed.length !== m) throw new Error(`SPECK ${p.blockBits}/${p.keyBits} needs ${m} key words`);
  const k: bigint[] = [printed[m - 1]];
  // l[j] = the j-th l word, counting from the one printed nearest k[0].
  const l: bigint[] = [];
  for (let j = 0; j <= m - 2; j++) l.push(printed[m - 2 - j]);
  for (let i = 0; i < rounds - 1; i++) {
    const li = addMod(k[i], rotr(l[i], alpha, n), n) ^ BigInt(i);
    l.push(li & mask(n));
    k.push((rotl(k[i], beta, n) ^ li) & mask(n));
  }
  return k;
}

export function speckEncrypt(block: Uint8Array, key: Uint8Array, p: SpeckParams): Uint8Array {
  const rk = speckKeySchedule(bytesToWords(key, p.n), p);
  let [x, y] = bytesToWords(block, p.n);
  for (let r = 0; r < p.rounds; r++) [x, y] = speckRound(x, y, rk[r], p);
  return wordsToBytes([x, y], p.n);
}

export function speckDecrypt(block: Uint8Array, key: Uint8Array, p: SpeckParams): Uint8Array {
  const rk = speckKeySchedule(bytesToWords(key, p.n), p);
  let [x, y] = bytesToWords(block, p.n);
  for (let r = p.rounds - 1; r >= 0; r--) [x, y] = speckRoundInverse(x, y, rk[r], p);
  return wordsToBytes([x, y], p.n);
}

function speckTrace(block: Uint8Array, key: Uint8Array, p: SpeckParams): RoundStep[] {
  const { n, alpha, beta } = p;
  const rk = speckKeySchedule(bytesToWords(key, p.n), p);
  const [x, y] = bytesToWords(block, n);
  const h = (v: bigint) => wordHex(v, n);
  const pair = (a: bigint, b: bigint) => [h(a), h(b)];

  const xr = rotr(x, alpha, n);
  const sum = addMod(xr, y, n);
  const nx = sum ^ rk[0];
  const yl = rotl(y, beta, n);
  const ny = yl ^ nx;

  return [
    { op: 'input (x, y)', note: `the block as two ${n}-bit words, x on the left`, state: pair(x, y) },
    { op: `S⁻${alpha} x`, note: `rotate x right by ${alpha} — ${n === 16 ? '16-bit words use 7 and 2' : 'every size but 16-bit uses 8 and 3'}`, state: pair(xr, y) },
    { op: '+', note: `addition modulo 2^${n} — the only nonlinear operation in SPECK`, state: pair(sum, y) },
    { op: 'XOR k₀', note: `round key 0 = ${h(rk[0])} (the RIGHTMOST printed key word)`, state: pair(nx, y) },
    { op: `S⁺${beta} y`, note: `rotate y left by ${beta}`, state: pair(nx, yl) },
    { op: 'XOR', note: 'the second half takes the first half’s new value', state: pair(nx, ny) },
    { op: 'output (x, y)', note: 'one add-rotate-XOR round complete', state: pair(nx, ny) },
  ];
}

function variantFor(p: SpeckParams, vectors: readonly TestVector[]): CipherVariant {
  const label = `SPECK ${p.blockBits}/${p.keyBits}`;
  return {
    id: `speck-${p.blockBits}-${p.keyBits}`,
    family: 'SPECK',
    label,
    blockBits: p.blockBits,
    keyBits: p.keyBits,
    rounds: p.rounds,
    layout: { kind: 'words', count: 2, bits: p.n },
    encrypt: (b, k) => speckEncrypt(b, k, p),
    decrypt: (b, k) => speckDecrypt(b, k, p),
    traceRound: (b, k) => speckTrace(b, k, p),
    vectors: vectors.filter((v) => v.label === label),
  };
}

export const SPECK_VARIANTS: readonly CipherVariant[] = SPECK_PARAMS.map((p) =>
  variantFor(p, SPECK_VECTORS),
);

export function speckParamsFor(blockBits: number, keyBits: number): SpeckParams {
  const p = SPECK_PARAMS.find((q) => q.blockBits === blockBits && q.keyBits === keyBits);
  if (!p) throw new Error(`no SPECK version with block ${blockBits} and key ${keyBits}`);
  return p;
}
