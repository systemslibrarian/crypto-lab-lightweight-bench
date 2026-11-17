import { describe, expect, it } from 'vitest';
import { GIFT_VARIANTS, permutation, roundConstants, GS, GS_INV } from './gift';
import { GIFT_ROUND0_DUMPS } from '../vectors/gift';
import { parseHex, toHex, randomBytes } from './hex';

/** The table printed in ePrint 2017/622 section 2, rounds 1-48. */
const PRINTED_CONSTANTS =
  '01,03,07,0F,1F,3E,3D,3B,37,2F,1E,3C,39,33,27,0E,' +
  '1D,3A,35,2B,16,2C,18,30,21,02,05,0B,17,2E,1C,38,' +
  '31,23,06,0D,1B,36,2D,1A,34,29,12,24,08,11,22,04';

describe('GIFT', () => {
  it('generates the round constants the paper prints', () => {
    const got = roundConstants(48)
      .map((c) => c.toString(16).toUpperCase().padStart(2, '0'))
      .join(',');
    expect(got).toBe(PRINTED_CONSTANTS);
  });

  it('has a bijective S-box', () => {
    expect(new Set(GS).size).toBe(16);
    for (let x = 0; x < 16; x++) expect(GS_INV[GS[x]]).toBe(x);
  });

  it.each([64, 128] as const)('P%d matches the paper’s printed first row', (n) => {
    // Tables 4 and 5, row i = 0..15.
    const expected =
      n === 64
        ? [0, 17, 34, 51, 48, 1, 18, 35, 32, 49, 2, 19, 16, 33, 50, 3]
        : [0, 33, 66, 99, 96, 1, 34, 67, 64, 97, 2, 35, 32, 65, 98, 3];
    expect(permutation(n).slice(0, 16)).toEqual(expected);
  });

  it.each([64, 128] as const)('P%d is a permutation', (n) => {
    expect(new Set(permutation(n)).size).toBe(n);
  });

  for (const v of GIFT_VARIANTS) {
    it(`${v.label} has 3 designers’ vectors`, () => expect(v.vectors).toHaveLength(3));

    for (const [i, t] of v.vectors.entries()) {
      it(`${v.label} reproduces designers’ vector ${i + 1}`, () => {
        const key = parseHex(t.keyHex, 128, 'key');
        const pt = parseHex(t.plainHex, v.blockBits, 'plaintext');
        expect(toHex(v.encrypt(pt, key))).toBe(t.cipherHex);
      });

      it(`${v.label} decrypts designers’ vector ${i + 1}`, () => {
        const key = parseHex(t.keyHex, 128, 'key');
        const ct = parseHex(t.cipherHex, v.blockBits, 'ciphertext');
        expect(toHex(v.decrypt(ct, key))).toBe(t.plainHex);
      });
    }

    it(`${v.label} round-trips random blocks`, () => {
      for (let i = 0; i < 8; i++) {
        const key = randomBytes(16);
        const pt = randomBytes(v.blockBits / 8);
        expect(toHex(v.decrypt(v.encrypt(pt, key), key))).toBe(toHex(pt));
      }
    });
  }
});

describe('GIFT first round against the designers’ own dump', () => {
  for (const d of GIFT_ROUND0_DUMPS) {
    it(`${d.label} / ${d.plainHex.slice(0, 8)}… matches SubCells, PermBits and AddRoundKey`, () => {
      const v = GIFT_VARIANTS.find((c) => c.label === d.label);
      if (!v) throw new Error(`no variant ${d.label}`);
      const steps = v.traceRound(
        parseHex(d.plainHex, v.blockBits, 'plaintext'),
        parseHex(d.keyHex, 128, 'key'),
      );
      const at = (op: string) => {
        const s = steps.find((x) => x.op === op);
        if (!s) throw new Error(`no step ${op}`);
        return s.state.join('');
      };
      expect(at('SubCells')).toBe(d.afterSubCells);
      expect(at('PermBits')).toBe(d.afterPermBits);
      expect(at('AddRoundKey')).toBe(d.afterAddRoundKey);
    });
  }
});
