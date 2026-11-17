import { describe, expect, it } from 'vitest';
import {
  ALPHA,
  MPRIME,
  PRINCE_VARIANT,
  PS,
  PS_INV,
  RC,
  SR,
  decryptByReflection,
  decryptStepwise,
  mPrime,
  princeEncrypt,
} from './prince';
import { parseHex, toHex, randomBytes } from './hex';

describe('PRINCE', () => {
  it('has a bijective S-box', () => {
    expect(new Set(PS).size).toBe(16);
    for (let x = 0; x < 16; x++) expect(PS_INV[PS[x]]).toBe(x);
  });

  it('SR is a permutation of the 16 nibbles', () => expect(new Set(SR).size).toBe(16));

  it("M' is an involution — the property reflection rests on", () => {
    for (let i = 0; i < 64; i++) {
      const bit = 1n << BigInt(i);
      expect(mPrime(mPrime(bit))).toBe(bit);
    }
    for (let i = 0; i < 64; i++) {
      const r = BigInt.asUintN(64, BigInt(`0x${toHex(randomBytes(8))}`));
      expect(mPrime(mPrime(r))).toBe(r);
    }
  });

  it("M' has exactly three ones per row and per column", () => {
    const colCount = new Array<number>(64).fill(0);
    for (let j = 0; j < 64; j++) {
      let ones = 0;
      for (let c = 0; c < 64; c++) {
        if ((MPRIME[j] >> BigInt(63 - c)) & 1n) {
          ones++;
          colCount[c]++;
        }
      }
      expect(ones).toBe(3);
    }
    for (const c of colCount) expect(c).toBe(3);
  });

  it('the round constants satisfy RC_i XOR RC_(11-i) = alpha', () => {
    for (let i = 0; i <= 11; i++) expect(RC[i] ^ RC[11 - i]).toBe(ALPHA);
    expect(RC[0]).toBe(0n);
    expect(ALPHA).toBe(RC[11]);
  });

  for (const [i, t] of PRINCE_VARIANT.vectors.entries()) {
    it(`reproduces Appendix A vector ${i + 1}`, () => {
      const key = parseHex(t.keyHex, 128, 'key');
      const pt = parseHex(t.plainHex, 64, 'plaintext');
      expect(toHex(princeEncrypt(pt, key))).toBe(t.cipherHex);
    });

    it(`decrypts Appendix A vector ${i + 1} by reflection`, () => {
      const key = parseHex(t.keyHex, 128, 'key');
      const ct = parseHex(t.cipherHex, 64, 'ciphertext');
      expect(toHex(decryptByReflection(ct, key))).toBe(t.plainHex);
    });
  }

  it('reflection decryption equals the step-by-step inverse on 1,000 random inputs', () => {
    for (let i = 0; i < 1000; i++) {
      const key = randomBytes(16);
      const ct = randomBytes(8);
      expect(toHex(decryptByReflection(ct, key))).toBe(toHex(decryptStepwise(ct, key)));
    }
  });

  it('reflection fails when alpha has one bit flipped (the negative control)', () => {
    let agreed = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      const key = randomBytes(16);
      const ct = randomBytes(8);
      const bit = 1n << BigInt(i % 64);
      const wrong = decryptByReflection(ct, key, ALPHA ^ bit);
      if (toHex(wrong) === toHex(decryptStepwise(ct, key))) agreed++;
    }
    expect(agreed).toBe(0);
  });

  it('round-trips random blocks', () => {
    for (let i = 0; i < 64; i++) {
      const key = randomBytes(16);
      const pt = randomBytes(8);
      expect(toHex(decryptByReflection(princeEncrypt(pt, key), key))).toBe(toHex(pt));
    }
  });
});
