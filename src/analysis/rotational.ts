/**
 * Rotational analysis — Khovratovich, Nikolić, Pieprzyk, Sokołowski, Steinfeld,
 * "Rotational Cryptanalysis of ARX Revisited", IACR ePrint 2015/095.
 *
 * A pair (x, y) is ROTATIONAL at amount r if the second word is the first
 * rotated: y = x <<< r. XOR and rotation preserve that relation with
 * probability 1. Modular addition does not, and Lemma 1 says with what
 * probability it does:
 *
 *   Pr[(x + y) <<< r = (x <<< r) + (y <<< r)] = (1 + 2^(r-n) + 2^-r + 2^-n) / 4
 *
 * Lemma 2 is the paper's correction to the folklore: CHAINED additions are not
 * independent, so multiplying Lemma 1's probability once per addition
 * OVERESTIMATES the chain. For k words (hence k-1 chained additions):
 *
 *   Pr = 2^-nk * C(k + 2^r - 1, 2^r - 1) * C(k + 2^(n-r) - 1, 2^(n-r) - 1)
 *
 * Everything in this module is machine-integer arithmetic on 8- and 16-bit
 * words, not the BigInt word helpers the ciphers use: the exhaustive counts
 * here run to 2^32 iterations and a BigInt per step would make them hours.
 *
 * NOTHING here is an attack on SPECK, and the page says so. See
 * `NEGATIVE_CLAIM`.
 */


export class RotationError extends Error {}

/**
 * A rotation amount must be a proper rotation: 0 and n are the identity, and
 * calling the identity a rotation would make every pair "survive" and teach
 * the opposite of the lesson.
 */
export function requireRotation(r: number, n: number): void {
  if (!Number.isInteger(r)) throw new RotationError(`The rotation amount must be a whole number.`);
  if (r === 0) {
    throw new RotationError(
      `A rotation of 0 is the identity, not a rotation: every pair would trivially survive. Choose 1 to ${n - 1}.`,
    );
  }
  if (r === n) {
    throw new RotationError(
      `A rotation of ${n} on an ${n}-bit word is the identity, not a rotation. Choose 1 to ${n - 1}.`,
    );
  }
  if (r < 0 || r > n) {
    throw new RotationError(`A rotation amount for an ${n}-bit word must be between 1 and ${n - 1}.`);
  }
}

/** Lemma 1, as a float. For n = 16, r = 1 this is 0.3750114440917969. */
export function lemma1(n: number, r: number): number {
  requireRotation(r, n);
  return (1 + 2 ** (r - n) + 2 ** -r + 2 ** -n) / 4;
}

function binom(a: bigint, b: bigint): bigint {
  if (b < 0n || b > a) return 0n;
  const k = b > a - b ? a - b : b;
  let num = 1n;
  let den = 1n;
  for (let i = 0n; i < k; i++) {
    num *= a - i;
    den *= i + 1n;
  }
  return num / den;
}

/**
 * Lemma 2 for `words` n-bit words, i.e. `words - 1` chained additions.
 *
 * Returned as an exact rational (numerator over 2^(n*words)) so the comparison
 * against an exhaustive count is exact rather than floating point.
 */
export function lemma2Exact(n: number, r: number, words: number): { num: bigint; den: bigint } {
  requireRotation(r, n);
  if (words < 2) throw new RotationError('A chain needs at least two words.');
  const k = BigInt(words);
  const hi = 1n << BigInt(r);
  const lo = 1n << BigInt(n - r);
  return {
    num: binom(k + hi - 1n, hi - 1n) * binom(k + lo - 1n, lo - 1n),
    den: 1n << BigInt(n * words),
  };
}

export function lemma2(n: number, r: number, words: number): number {
  const { num, den } = lemma2Exact(n, r, words);
  return Number(num) / Number(den);
}

/** The folklore estimate Lemma 2 corrects: Lemma 1 once per addition. */
export function naiveProduct(n: number, r: number, words: number): number {
  return lemma1(n, r) ** (words - 1);
}

export interface ExhaustiveResult {
  readonly n: number;
  readonly r: number;
  /** Number of chained additions (1 for the single-addition case). */
  readonly additions: number;
  readonly survivors: number;
  readonly total: number;
  readonly exhaustive: true;
}

/**
 * Every (x, y) pair at n bits, counted — not sampled, not derived.
 *
 * Deliberately a brute-force double loop. The count factorises into a
 * high-part term and a low-part term, and that closed form is what Lemma 1 IS,
 * so computing it that way would make the "exhaustive" column a restatement of
 * the "Lemma 1" column rather than a check on it. The loop is nested in blocks
 * of 1024 because that shape lets the engine hoist the bounds checks; it is
 * about ten times faster than the same loop written flat, for the same count.
 */
export function exhaustiveOneAddition(
  n: 8 | 12 | 16,
  r: number,
  onProgress?: (done: number, total: number) => void,
): ExhaustiveResult {
  requireRotation(r, n);
  const size = 1 << n;
  const m = size - 1;
  const rot = new Uint32Array(size);
  for (let v = 0; v < size; v++) rot[v] = ((v << r) | (v >>> (n - r))) & m;
  let survivors = 0;
  const block = Math.min(1024, size);
  for (let x0 = 0; x0 < size; x0 += block) {
    for (let x = x0; x < x0 + block; x++) {
      const xr = rot[x];
      for (let y = 0; y < size; y++) {
        if (rot[(x + y) & m] === ((xr + rot[y]) & m)) survivors++;
      }
    }
    onProgress?.(x0 + block, size);
  }
  return { n, r, additions: 1, survivors, total: size * size, exhaustive: true };
}

/**
 * Every tuple of `additions + 1` n-bit words, counted.
 *
 * The chain condition is a conjunction, so a prefix that already fails cannot
 * be rescued — the loop prunes on it. That is what makes 2^32 tuples at 8 bits
 * take seconds rather than a minute. 16-bit chains are 2^48 tuples and are not
 * offered: the paper's own comparison tables are the place to read those.
 */
export function exhaustiveChain(
  n: 8,
  r: number,
  additions: 1 | 2 | 3,
  onProgress?: (done: number, total: number) => void,
): ExhaustiveResult {
  requireRotation(r, n);
  const size = 1 << n;
  const m = size - 1;
  const rot = new Uint32Array(size);
  for (let v = 0; v < size; v++) rot[v] = ((v << r) | (v >>> (n - r))) & m;
  let survivors = 0;
  const words = additions + 1;

  for (let a = 0; a < size; a++) {
    const ar = rot[a];
    for (let b = 0; b < size; b++) {
      const s2 = (a + b) & m;
      const r2 = (ar + rot[b]) & m;
      if (rot[s2] !== r2) continue;
      if (words === 2) {
        survivors++;
        continue;
      }
      for (let c = 0; c < size; c++) {
        const s3 = (s2 + c) & m;
        const r3 = (r2 + rot[c]) & m;
        if (rot[s3] !== r3) continue;
        if (words === 3) {
          survivors++;
          continue;
        }
        for (let d = 0; d < size; d++) {
          if (rot[(s3 + d) & m] === ((r3 + rot[d]) & m)) survivors++;
        }
      }
    }
    onProgress?.(a + 1, size);
  }
  return { n, r, additions, survivors, total: size ** words, exhaustive: true };
}

/** The worker's sampling budget, stated on the page whenever it bites. */
export const SAMPLE_CAP = 1 << 26;
export const SAMPLE_DEFAULT = 1 << 22;

export function capSamples(requested: number): { samples: number; capped: boolean } {
  if (!Number.isFinite(requested) || requested < 1) {
    throw new RotationError('The sample count must be a positive whole number.');
  }
  const samples = Math.min(Math.floor(requested), SAMPLE_CAP);
  return { samples, capped: samples < Math.floor(requested) };
}

export type KeyMode = 'rotated-round-keys' | 'real-schedule';

export interface SpeckRotationalPoint {
  readonly rounds: number;
  readonly survivors: number;
  readonly samples: number;
  readonly mode: KeyMode;
}

const rot16 = (v: number, r: number) => ((v << r) | (v >>> (16 - r))) & 0xffff;

/**
 * SPECK32/64's round function on machine integers.
 *
 * Hardcoding the rotation amounts 7 and 2 is correct HERE and only here: this
 * function is SPECK32/64 by name, and 16-bit words are the one size that uses
 * (7, 2). Doing the same inside the cipher itself is mutation (2).
 */
function round32(x: number, y: number, k: number): [number, number] {
  const sum = (((x >>> 7) | (x << 9)) + y) & 0xffff;
  const nx = sum ^ k;
  const ny = (((y << 2) | (y >>> 14)) & 0xffff) ^ nx;
  return [nx, ny];
}

/**
 * Sample rotational pairs through `rounds` rounds of SPECK32/64.
 *
 * Two key models, and the difference between them is the whole point of the
 * exhibit:
 *
 *   'rotated-round-keys' — the second member of the pair gets each round key
 *     ROTATED by r. This isolates the round function: the key cancels, and what
 *     survives is exactly what the modular addition lets through.
 *   'real-schedule' — both members get the SAME round keys, derived from one
 *     fresh random master key per sample by SPECK's real key schedule. The
 *     round counter XORed in at every step is not rotation-invariant, so the
 *     key no longer cancels.
 *
 * A pair survives only if BOTH output words are rotationally related. Counting
 * one word is mutation (10): it roughly doubles every figure and leaves the
 * shape of the curve intact, so only a test that checks the number can see it.
 */
export function sampleSpeckRotational(
  rounds: number,
  samples: number,
  mode: KeyMode,
  r: number,
  rng: (out: Uint16Array) => void,
  onProgress?: (done: number, total: number) => void,
): SpeckRotationalPoint {
  requireRotation(r, 16);
  if (rounds < 1) throw new RotationError('Round count must be at least 1.');
  let survivors = 0;
  const chunk = 1 << 16;
  const buf = new Uint16Array(2 + (mode === 'real-schedule' ? 4 : rounds));
  for (let done = 0; done < samples; done += chunk) {
    const n = Math.min(chunk, samples - done);
    for (let i = 0; i < n; i++) {
      rng(buf);
      const x = buf[0];
      const y = buf[1];
      let ax = x;
      let ay = y;
      let bx = rot16(x, r);
      let by = rot16(y, r);
      let keys: number[];
      if (mode === 'real-schedule') {
        keys = realSchedule32([buf[2], buf[3], buf[4], buf[5]], rounds);
      } else {
        keys = [];
        for (let j = 0; j < rounds; j++) keys.push(buf[2 + j]);
      }
      for (let j = 0; j < rounds; j++) {
        const k = keys[j];
        [ax, ay] = round32(ax, ay, k);
        [bx, by] = round32(bx, by, mode === 'real-schedule' ? k : rot16(k, r));
      }
      if (bx === rot16(ax, r) && by === rot16(ay, r)) survivors++;
    }
    onProgress?.(done + n, samples);
  }
  return { rounds, survivors, samples, mode };
}

/**
 * SPECK32/64's real key schedule on machine integers.
 *
 * The schedule IS the round function with the round counter in place of the
 * key: feeding (l_i, k_i) through R with key i yields (l_{i+m-1}, k_{i+1}).
 * That identity is what makes the counter matter — it is the one term in the
 * whole cipher that is not rotation-invariant, and it is what the real-schedule
 * column measures.
 *
 * `rotational.test.ts` checks this against `speckKeySchedule`, the BigInt
 * implementation that reproduces all ten published SPECK vectors, so this fast
 * copy cannot silently drift from the cipher the rest of the page runs.
 */
export function realSchedule32(printed: readonly number[], rounds: number): number[] {
  // printed = (l2, l1, l0, k0), the paper's printed order.
  let k = printed[3];
  const l = [printed[2], printed[1], printed[0]];
  const out = [k];
  for (let i = 0; i < rounds - 1; i++) {
    const li = (((k + (((l[i] >>> 7) | (l[i] << 9)) & 0xffff)) & 0xffff) ^ i) & 0xffff;
    l.push(li);
    k = ((((k << 2) | (k >>> 14)) & 0xffff) ^ li) & 0xffff;
    out.push(k);
  }
  return out;
}

/**
 * The lab's negative claim, scoped to the run on the page.
 *
 * Asserted by `e2e/claims.spec.ts` against the rendered text, so deleting it
 * fails the suite.
 */
export const NEGATIVE_CLAIM =
  'Rotational pairs pass through SPECK’s round function with high probability. ' +
  'That says nothing about SPECK as specified: with its real key schedule the same ' +
  'pairs do not survive two rounds.';
