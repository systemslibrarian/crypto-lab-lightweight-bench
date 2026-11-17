/**
 * SKINNY test vectors — IACR ePrint 2016/660, Appendix B.1 (p. 46).
 *
 * "The keys are given as the concatenation of (up to) three tweakey words:
 * TK1, TK1||TK2, or TK1||TK2||TK3." The appendix's typesetting breaks the
 * longer tweakeys across lines; they are one hex string here.
 */

import type { TestVector } from '../ciphers/types';

const SRC = 'ePrint 2016/660, Appendix B.1 (p. 46)';

export const SKINNY_VECTORS: readonly TestVector[] = [
  {
    label: 'SKINNY-64-64',
    keyHex: 'f5269826fc681238',
    plainHex: '06034f957724d19d',
    cipherHex: 'bb39dfb2429b8ac7',
    source: SRC,
  },
  {
    label: 'SKINNY-64-128',
    keyHex: '9eb93640d088da6376a39d1c8bea71e1',
    plainHex: 'cf16cfe8fd0f98aa',
    cipherHex: '6ceda1f43de92b9e',
    source: SRC,
  },
  {
    label: 'SKINNY-64-192',
    keyHex: 'ed00c85b120d68618753e24bfd908f60b2dbb41b422dfcd0',
    plainHex: '530c61d35e8663c3',
    cipherHex: 'dd2cf1a8f330303c',
    source: SRC,
  },
  {
    label: 'SKINNY-128-128',
    keyHex: '4f55cfb0520cac52fd92c15f37073e93',
    plainHex: 'f20adb0eb08b648a3b2eeed1f0adda14',
    cipherHex: '22ff30d498ea62d7e45b476e33675b74',
    source: SRC,
  },
  {
    label: 'SKINNY-128-256',
    keyHex: '009cec81605d4ac1d2ae9e3085d7a1f31ac123ebfc00fddcf01046ceeddfcab3',
    plainHex: '3a0c47767a26a68dd382a695e7022e25',
    cipherHex: 'b731d98a4bde147a7ed4a6f16b9b587f',
    source: SRC,
  },
  {
    label: 'SKINNY-128-384',
    keyHex:
      'df889548cfc7ea52d296339301797449ab588a34a47f1ab2dfe9c8293fbea9a5ab1afac2611012cd8cef952618c3ebe8',
    plainHex: 'a3994b66ad85a3459f44e92b08f550cb',
    cipherHex: '94ecf589e2017c601b38c6346a10dcfa',
    source: SRC,
  },
];
