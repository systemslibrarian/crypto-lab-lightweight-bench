/**
 * PRINCE test vectors — IACR ePrint 2012/529, Appendix A ("Testvectors").
 *
 * The appendix prints plaintext, k0, k1 and ciphertext in four columns. The
 * 128-bit key here is k0 || k1, in that order, which is how section 2 splits it.
 */

import type { TestVector } from '../ciphers/types';

const SRC = 'ePrint 2012/529, Appendix A';

export const PRINCE_VECTORS: readonly TestVector[] = [
  { label: 'PRINCE', keyHex: '00000000000000000000000000000000', plainHex: '0000000000000000', cipherHex: '818665aa0d02dfda', source: SRC },
  { label: 'PRINCE', keyHex: '00000000000000000000000000000000', plainHex: 'ffffffffffffffff', cipherHex: '604ae6ca03c20ada', source: SRC },
  { label: 'PRINCE', keyHex: 'ffffffffffffffff0000000000000000', plainHex: '0000000000000000', cipherHex: '9fb51935fc3df524', source: SRC },
  { label: 'PRINCE', keyHex: '0000000000000000ffffffffffffffff', plainHex: '0000000000000000', cipherHex: '78a54cbe737bb7ef', source: SRC },
  { label: 'PRINCE', keyHex: '0000000000000000fedcba9876543210', plainHex: '0123456789abcdef', cipherHex: 'ae25ad3ca8fa9ccf', source: SRC },
];
