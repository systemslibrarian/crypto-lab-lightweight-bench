import { describe, expect, it } from 'vitest';
import { SIMON_VARIANTS } from './simon';
import { SPECK_VARIANTS } from './speck';
import { parseHex, toHex, randomBytes } from './hex';

const families = [
  { name: 'SIMON', variants: SIMON_VARIANTS },
  { name: 'SPECK', variants: SPECK_VARIANTS },
];

for (const { name, variants } of families) {
  describe(name, () => {
    it(`has 10 versions`, () => expect(variants).toHaveLength(10));

    for (const v of variants) {
      it(`${v.label} reproduces the designers' vector`, () => {
        expect(v.vectors).toHaveLength(1);
        const t = v.vectors[0];
        const key = parseHex(t.keyHex, v.keyBits, 'key');
        const pt = parseHex(t.plainHex, v.blockBits, 'plaintext');
        expect(toHex(v.encrypt(pt, key))).toBe(t.cipherHex);
      });

      it(`${v.label} decrypts the designers' vector back`, () => {
        const t = v.vectors[0];
        const key = parseHex(t.keyHex, v.keyBits, 'key');
        const ct = parseHex(t.cipherHex, v.blockBits, 'ciphertext');
        expect(toHex(v.decrypt(ct, key))).toBe(t.plainHex);
      });

      it(`${v.label} round-trips random blocks`, () => {
        for (let i = 0; i < 8; i++) {
          const key = randomBytes(v.keyBits / 8);
          const pt = randomBytes(v.blockBits / 8);
          expect(toHex(v.decrypt(v.encrypt(pt, key), key))).toBe(toHex(pt));
        }
      });
    }
  });
}
