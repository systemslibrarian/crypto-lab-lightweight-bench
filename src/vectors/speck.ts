/**
 * SPECK test vectors — IACR ePrint 2013/404, Appendix C ("Speck Test Vectors"),
 * page 42 of the full version dated 19 June 2013.
 *
 * The keys are the same as Appendix B's for each size; the plaintexts differ.
 * As in the SIMON fixture, the flat hex is the appendix's printed hex with the
 * spaces removed.
 */

import type { TestVector } from '../ciphers/types';

const SRC = 'ePrint 2013/404, Appendix C (p. 42)';

export const SPECK_VECTORS: readonly TestVector[] = [
  { label: 'SPECK 32/64',   keyHex: '1918111009080100',                 plainHex: '6574694c',         cipherHex: 'a86842f2',         source: SRC },
  { label: 'SPECK 48/72',   keyHex: '1211100a0908020100',               plainHex: '20796c6c6172',     cipherHex: 'c049a5385adc',     source: SRC },
  { label: 'SPECK 48/96',   keyHex: '1a19181211100a0908020100',         plainHex: '6d2073696874',     cipherHex: '735e10b6445d',     source: SRC },
  { label: 'SPECK 64/96',   keyHex: '131211100b0a090803020100',         plainHex: '74614620736e6165', cipherHex: '9f7952ec4175946c', source: SRC },
  { label: 'SPECK 64/128',  keyHex: '1b1a1918131211100b0a090803020100', plainHex: '3b7265747475432d', cipherHex: '8c6fa548454e028b', source: SRC },
  { label: 'SPECK 96/96',   keyHex: '0d0c0b0a0908050403020100',         plainHex: '65776f68202c656761737520', cipherHex: '9e4d09ab717862bdde8f79aa', source: SRC },
  { label: 'SPECK 96/144',  keyHex: '1514131211100d0c0b0a0908050403020100', plainHex: '656d6974206e69202c726576', cipherHex: '2bf31072228a7ae440252ee6', source: SRC },
  { label: 'SPECK 128/128', keyHex: '0f0e0d0c0b0a09080706050403020100', plainHex: '6c617669757165207469206564616d20', cipherHex: 'a65d9851797832657860fedf5c570d18', source: SRC },
  { label: 'SPECK 128/192', keyHex: '17161514131211100f0e0d0c0b0a09080706050403020100', plainHex: '726148206665696843206f7420746e65', cipherHex: '1be4cf3a13135566f9bc185de03c1886', source: SRC },
  { label: 'SPECK 128/256', keyHex: '1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100', plainHex: '65736f6874206e49202e72656e6f6f70', cipherHex: '4109010405c0f53e4eeeb48d9c188f43', source: SRC },
];
