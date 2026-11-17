import { describe, expect, it } from 'vitest';
import {
  RotationError,
  capSamples,
  exhaustiveChain,
  exhaustiveOneAddition,
  lemma1,
  lemma2,
  lemma2Exact,
  naiveProduct,
  realSchedule32,
  requireRotation,
  sampleSpeckRotational,
  SAMPLE_CAP,
} from './rotational';
import { speckKeySchedule, speckParamsFor } from '../ciphers/speck';

/** A deterministic generator, so the sampled figures below are reproducible. */
function xorshift(seed: number): (out: Uint16Array) => void {
  let s = seed | 0 || 1;
  return (out) => {
    for (let i = 0; i < out.length; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      out[i] = s & 0xffff;
    }
  };
}

describe('Lemma 1 — one modular addition', () => {
  it('gives 0.375011… at n = 16, r = 1', () => {
    expect(lemma1(16, 1)).toBeCloseTo(0.3750114440917969, 15);
  });

  it('counts exhaustively to exactly 1,610,661,888 of the 2 ** 32 pairs', () => {
    const got = exhaustiveOneAddition(16, 1);
    expect(got.total).toBe(2 ** 32);
    expect(got.survivors).toBe(1_610_661_888);
    expect(got.exhaustive).toBe(true);
    // And the exhaustive count agrees with Lemma 1 to the last bit.
    expect(got.survivors / got.total).toBe(lemma1(16, 1));
  }, 120_000);

  it('agrees with Lemma 1 exhaustively at every rotation of an 8-bit word', () => {
    for (let r = 1; r < 8; r++) {
      const got = exhaustiveOneAddition(8, r);
      expect(got.survivors / got.total).toBeCloseTo(lemma1(8, r), 12);
    }
  });

  it('reports progress that reaches the total', () => {
    const seen: number[] = [];
    const got = exhaustiveOneAddition(8, 1, (done, total) => {
      expect(total).toBe(256);
      seen.push(done);
    });
    expect(seen.at(-1)).toBe(256);
    expect(got.survivors).toBeGreaterThan(0);
  });
});

describe('Lemma 2 — chained additions are not independent', () => {
  it('reduces to Lemma 1 for a single addition', () => {
    for (const n of [8, 12, 16]) {
      for (let r = 1; r < n; r++) expect(lemma2(n, r, 2)).toBeCloseTo(lemma1(n, r), 14);
    }
  });

  it('matches an exhaustive count exactly for two chained additions at 8 bits', () => {
    const got = exhaustiveChain(8, 1, 2);
    const want = lemma2Exact(8, 1, 3);
    expect(BigInt(got.total)).toBe(want.den);
    expect(BigInt(got.survivors)).toBe(want.num);
  }, 60_000);

  it('matches an exhaustive count exactly for three chained additions at 8 bits', () => {
    const got = exhaustiveChain(8, 1, 3);
    const want = lemma2Exact(8, 1, 4);
    expect(BigInt(got.total)).toBe(want.den);
    expect(BigInt(got.survivors)).toBe(want.num);
  }, 120_000);

  it('shows the naive product overestimating by 1.6–1.75x at two additions', () => {
    const got = exhaustiveChain(8, 1, 2);
    const factor = naiveProduct(8, 1, 3) / (got.survivors / got.total);
    expect(factor).toBeGreaterThan(1.6);
    expect(factor).toBeLessThan(1.75);
  }, 60_000);

  it('shows the naive product overestimating by 3.8–4.1x at three additions', () => {
    const got = exhaustiveChain(8, 1, 3);
    const factor = naiveProduct(8, 1, 4) / (got.survivors / got.total);
    expect(factor).toBeGreaterThan(3.8);
    expect(factor).toBeLessThan(4.1);
  }, 120_000);

  it('never understates the chain — the naive product is always at least as large', () => {
    for (const n of [8, 16]) {
      for (let r = 1; r < n; r++) {
        for (const words of [2, 3, 4, 5]) {
          expect(naiveProduct(n, r, words)).toBeGreaterThanOrEqual(lemma2(n, r, words) - 1e-15);
        }
      }
    }
  });
});

describe('rotation amounts that are not rotations are refused', () => {
  it('refuses 0', () => {
    expect(() => requireRotation(0, 16)).toThrow(RotationError);
    expect(() => requireRotation(0, 16)).toThrow(/identity, not a rotation/);
  });

  it('refuses the word size itself', () => {
    expect(() => requireRotation(16, 16)).toThrow(/identity, not a rotation/);
    expect(() => requireRotation(8, 8)).toThrow(RotationError);
  });

  it('refuses a negative or oversized amount', () => {
    expect(() => requireRotation(-1, 16)).toThrow(RotationError);
    expect(() => requireRotation(17, 16)).toThrow(RotationError);
  });

  it('refuses a fractional amount', () => {
    expect(() => requireRotation(1.5, 16)).toThrow(/whole number/);
  });

  it('accepts 1 through n-1', () => {
    for (let r = 1; r < 16; r++) expect(() => requireRotation(r, 16)).not.toThrow();
  });
});

describe('the sampling budget is capped and the cap is reported', () => {
  it('passes a request under the cap through unchanged', () => {
    expect(capSamples(1000)).toEqual({ samples: 1000, capped: false });
  });

  it('caps a request over the budget and says it capped', () => {
    const got = capSamples(SAMPLE_CAP * 4);
    expect(got.samples).toBe(SAMPLE_CAP);
    expect(got.capped).toBe(true);
  });

  it('refuses a non-positive request', () => {
    expect(() => capSamples(0)).toThrow(RotationError);
    expect(() => capSamples(-5)).toThrow(RotationError);
  });
});

describe('the fast SPECK32/64 key schedule matches the verified BigInt one', () => {
  const p = speckParamsFor(32, 64);

  it('agrees on the published vector’s key', () => {
    // ePrint 2013/404 Appendix C, Speck 32/64: key 1918 1110 0908 0100.
    const printed = [0x1918, 0x1110, 0x0908, 0x0100];
    const want = speckKeySchedule(printed.map(BigInt), p).map(Number);
    expect(realSchedule32(printed, p.rounds)).toEqual(want);
  });

  it('agrees on 200 random keys for all 22 rounds', () => {
    const rng = xorshift(0x51ed);
    const buf = new Uint16Array(4);
    for (let t = 0; t < 200; t++) {
      rng(buf);
      const printed = Array.from(buf);
      const want = speckKeySchedule(printed.map(BigInt), p).map(Number);
      expect(realSchedule32(printed, p.rounds)).toEqual(want);
    }
  });
});

describe('SPECK32/64 rotational pairs', () => {
  const SAMPLES = 1 << 22; // the brief's floor for these points
  const P1 = lemma1(16, 1);

  it('survives the ROUND FUNCTION at about 0.375011^r for r = 1, 2, 3', () => {
    for (const rounds of [1, 2, 3]) {
      const got = sampleSpeckRotational(rounds, SAMPLES, 'rotated-round-keys', 1, xorshift(0x1234 + rounds));
      expect(got.samples).toBe(SAMPLES);
      const fraction = got.survivors / got.samples;
      const want = P1 ** rounds;
      expect(Math.abs(fraction - want) / want).toBeLessThan
        (0.03);
    }
  }, 120_000);

  it('does NOT survive two rounds under the REAL key schedule', () => {
    const got = sampleSpeckRotational(2, SAMPLES, 'real-schedule', 1, xorshift(0x9a1c));
    expect(got.samples).toBe(SAMPLES);
    expect(got.survivors).toBeLessThanOrEqual(2);
  }, 120_000);

  /**
   * At ONE round the two checks are provably the same, which is why a
   * single-round test cannot see mutation (10).
   *
   * The round is nx = (S^-a x + y) XOR k, ny = S^b y XOR nx. With rotational
   * inputs and a rotated key, ny' = (S^b y)<<<r XOR nx' while
   * ny<<<r = (S^b y)<<<r XOR nx<<<r, so ny' = ny<<<r exactly when
   * nx' = nx<<<r. The second word carries no independent information.
   */
  it('at one round, checking one output word is equivalent to checking both', () => {
    const both = sampleSpeckRotational(1, 1 << 20, 'rotated-round-keys', 1, xorshift(0x4242));
    const oneWord = countOneWordOnly(1, 1 << 20, xorshift(0x4242));
    expect(oneWord).toBe(both.survivors);
  }, 120_000);

  /**
   * From THREE rounds on they come apart, and this is what kills mutation (10).
   *
   * Once a pair has broken, the inputs to the next round are no longer
   * rotational, so the first output word can re-align while the second does
   * not. Measured at 2^24 samples: 0 such pairs at one round, 0 at two, and
   * 130,921 against 887,873 survivors at three — a 15% inflation. Counting one
   * word is therefore detectable, but only at three rounds or more.
   */
  it('at three rounds, checking one output word inflates the count by over 5%', () => {
    const samples = 1 << 21;
    const both = sampleSpeckRotational(3, samples, 'rotated-round-keys', 1, xorshift(0x4242));
    const oneWord = countOneWordOnly(3, samples, xorshift(0x4242));
    expect(oneWord).toBeGreaterThan(both.survivors);
    expect((oneWord - both.survivors) / both.survivors).toBeGreaterThan(0.05);
  }, 120_000);

  it('refuses a rotation of 0', () => {
    expect(() => sampleSpeckRotational(1, 16, 'rotated-round-keys', 0, xorshift(1))).toThrow(RotationError);
  });
});

/**
 * The same sampler, deliberately checking ONE output word.
 *
 * Kept in the test rather than the source so the source has no one-word path to
 * reach by accident, while the test can still show that the two differ.
 */
function countOneWordOnly(rounds: number, samples: number, rng: (o: Uint16Array) => void): number {
  const rot = (v: number) => ((v << 1) | (v >>> 15)) & 0xffff;
  const round = (x: number, y: number, k: number): [number, number] => {
    const sum = (((x >>> 7) | (x << 9)) + y) & 0xffff;
    const nx = sum ^ k;
    return [nx, ((((y << 2) | (y >>> 14)) & 0xffff) ^ nx) & 0xffff];
  };
  const buf = new Uint16Array(2 + rounds);
  let hits = 0;
  for (let i = 0; i < samples; i++) {
    rng(buf);
    let ax = buf[0];
    let ay = buf[1];
    let bx = rot(ax);
    let by = rot(ay);
    for (let j = 0; j < rounds; j++) {
      const k = buf[2 + j];
      [ax, ay] = round(ax, ay, k);
      [bx, by] = round(bx, by, rot(k));
    }
    if (bx === rot(ax)) hits++;
  }
  return hits;
}
