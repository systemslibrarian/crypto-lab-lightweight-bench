import { describe, expect, it } from 'vitest';
import { SKINNY_VARIANTS, S4, S4_INV, S8, S8_INV, SR_P, TK_PT } from './skinny';
import { parseHex, toHex, randomBytes } from './hex';

describe('SKINNY', () => {
  it('has the six versions of Table 1', () => expect(SKINNY_VARIANTS).toHaveLength(6));

  it('S4 and S8 are bijective and invert correctly', () => {
    expect(new Set(S4).size).toBe(16);
    expect(new Set(S8).size).toBe(256);
    for (let x = 0; x < 16; x++) expect(S4_INV[S4[x]]).toBe(x);
    for (let x = 0; x < 256; x++) expect(S8_INV[S8[x]]).toBe(x);
  });

  it('S4 matches the paper’s printed Table 2 and its printed inverse', () => {
    expect(S4.join('')).toBe([0xc, 6, 9, 0, 1, 0xa, 2, 0xb, 3, 8, 5, 0xd, 4, 0xe, 7, 0xf].join(''));
    // Table 2's second row, S4^-1, transcribed independently of S4.
    expect(S4_INV).toEqual([3, 4, 6, 8, 0xc, 0xa, 1, 0xe, 9, 2, 5, 7, 0, 0xb, 0xd, 0xf]);
  });

  it('ShiftRows rotates rows 1, 2, 3 right by 1, 2, 3', () => {
    // SR_P is a GATHER map: new[i] = old[SR_P[i]]. For the contents of a row to
    // move RIGHT by `row`, the new cell at column `col` must gather from column
    // `col - row` (mod 4) — so row 1's cell 4 takes old cell 7, not old cell 5.
    // Gathering from `col + row` instead would rotate the row LEFT, which is
    // the AES direction and not SKINNY's.
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const i = row * 4 + col;
        expect(SR_P[i]).toBe(row * 4 + ((col - row + 4) % 4));
      }
    }
  });

  it('the tweakey permutation is a permutation', () => expect(new Set(TK_PT).size).toBe(16));

  for (const v of SKINNY_VARIANTS) {
    it(`${v.label} reproduces the designers’ vector`, () => {
      expect(v.vectors).toHaveLength(1);
      const t = v.vectors[0];
      const tk = parseHex(t.keyHex, v.keyBits, 'tweakey');
      const pt = parseHex(t.plainHex, v.blockBits, 'plaintext');
      expect(toHex(v.encrypt(pt, tk))).toBe(t.cipherHex);
    });

    it(`${v.label} decrypts the designers’ vector back`, () => {
      const t = v.vectors[0];
      const tk = parseHex(t.keyHex, v.keyBits, 'tweakey');
      const ct = parseHex(t.cipherHex, v.blockBits, 'ciphertext');
      expect(toHex(v.decrypt(ct, tk))).toBe(t.plainHex);
    });

    it(`${v.label} round-trips random blocks`, () => {
      for (let i = 0; i < 8; i++) {
        const tk = randomBytes(v.keyBits / 8);
        const pt = randomBytes(v.blockBits / 8);
        expect(toHex(v.decrypt(v.encrypt(pt, tk), tk))).toBe(toHex(pt));
      }
    });
  }
});
