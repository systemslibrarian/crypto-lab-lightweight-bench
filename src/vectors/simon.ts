/**
 * SIMON test vectors — IACR ePrint 2013/404, Appendix B ("Simon Test Vectors"),
 * page 41 of the full version dated 19 June 2013.
 *
 * Transcribed with the appendix's spaces removed. Under this lab's byte-order
 * convention (big-endian within each word, words in printed order) the flat hex
 * below IS the appendix's printed hex, so a transcription slip is visible by
 * eye against the paper rather than only through a failing test.
 */

import type { TestVector } from '../ciphers/types';

const SRC = 'ePrint 2013/404, Appendix B (p. 41)';

export const SIMON_VECTORS: readonly TestVector[] = [
  { label: 'SIMON 32/64',   keyHex: '1918111009080100',                 plainHex: '65656877',         cipherHex: 'c69be9bb',         source: SRC },
  { label: 'SIMON 48/72',   keyHex: '1211100a0908020100',               plainHex: '6120676e696c',     cipherHex: 'dae5ac292cac',     source: SRC },
  { label: 'SIMON 48/96',   keyHex: '1a19181211100a0908020100',         plainHex: '72696320646e',     cipherHex: '6e06a5acf156',     source: SRC },
  { label: 'SIMON 64/96',   keyHex: '131211100b0a090803020100',         plainHex: '6f7220676e696c63', cipherHex: '5ca2e27f111a8fc8', source: SRC },
  { label: 'SIMON 64/128',  keyHex: '1b1a1918131211100b0a090803020100', plainHex: '656b696c20646e75', cipherHex: '44c8fc20b9dfa07a', source: SRC },
  { label: 'SIMON 96/96',   keyHex: '0d0c0b0a0908050403020100',         plainHex: '2072616c6c69702065687420', cipherHex: '602807a462b469063d8ff082', source: SRC },
  { label: 'SIMON 96/144',  keyHex: '1514131211100d0c0b0a0908050403020100', plainHex: '74616874207473756420666f', cipherHex: 'ecad1c6c451e3f59c5db1ae9', source: SRC },
  { label: 'SIMON 128/128', keyHex: '0f0e0d0c0b0a09080706050403020100', plainHex: '63736564207372656c6c657661727420', cipherHex: '49681b1e1e54fe3f65aa832af84e0bbc', source: SRC },
  { label: 'SIMON 128/192', keyHex: '17161514131211100f0e0d0c0b0a09080706050403020100', plainHex: '206572656874206e6568772065626972', cipherHex: 'c4ac61effcdc0d4f6c9c8d6e2597b85b', source: SRC },
  { label: 'SIMON 128/256', keyHex: '1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100', plainHex: '74206e69206d6f6f6d69732061207369', cipherHex: '8d2b5579afc8a3a03bf72a87efe7b868', source: SRC },
];
