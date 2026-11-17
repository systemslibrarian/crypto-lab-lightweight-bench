/**
 * GIFT test vectors.
 *
 * ePrint 2017/622 prints NO test vectors — its only use of the phrase is a
 * timing simulation "with 1000 test vectors" in the hardware section. These six
 * come from the designers' own repository:
 *
 *   github.com/giftcipher/gift
 *   commit f43c6b3e214e39c22dc0ae5efcc39297809d9b68
 *   implementations/test vectors/GIFT{64,128}_test_vector_{1,2,3}.txt
 *
 * Each of those files also prints the state after SubCells, PermBits and
 * AddRoundKeys for every round, and after the key update — `gift.test.ts`
 * checks this lab's first-round trace against the designers' own dump for the
 * two non-zero GIFT-64 vectors, which is a stronger check than the ciphertext
 * alone: a cipher can reach the right ciphertext through compensating errors,
 * but not through 28 matching intermediate states.
 *
 * Vector 1 of each size is all-zero and is kept for completeness, but it cannot
 * detect a key-word-order bug or a round-key-position bug: an all-zero key
 * state XORs to nothing wherever the round key is placed. Vectors 2 and 3 can,
 * and the mutation ledger relies on them.
 */

import type { TestVector } from '../ciphers/types';

const SRC =
  'github.com/giftcipher/gift @ f43c6b3e, implementations/test vectors/';

export const GIFT_VECTORS: readonly TestVector[] = [
  {
    label: 'GIFT-64',
    keyHex: '00000000000000000000000000000000',
    plainHex: '0000000000000000',
    cipherHex: 'f62bc3ef34f775ac',
    source: SRC + 'GIFT64_test_vector_1.txt',
  },
  {
    label: 'GIFT-64',
    keyHex: 'fedcba9876543210fedcba9876543210',
    plainHex: 'fedcba9876543210',
    cipherHex: 'c1b71f66160ff587',
    source: SRC + 'GIFT64_test_vector_2.txt',
  },
  {
    label: 'GIFT-64',
    keyHex: 'bd91731eb6bc2713a1f9f6ffc75044e7',
    plainHex: 'c450c7727a9b8a7d',
    cipherHex: 'e3272885fa94ba8b',
    source: SRC + 'GIFT64_test_vector_3.txt',
  },
  {
    label: 'GIFT-128',
    keyHex: '00000000000000000000000000000000',
    plainHex: '00000000000000000000000000000000',
    cipherHex: 'cd0bd738388ad3f668b15a36ceb6ff92',
    source: SRC + 'GIFT128_test_vector_1.txt',
  },
  {
    label: 'GIFT-128',
    keyHex: 'fedcba9876543210fedcba9876543210',
    plainHex: 'fedcba9876543210fedcba9876543210',
    cipherHex: '8422241a6dbf5a9346af468409ee0152',
    source: SRC + 'GIFT128_test_vector_2.txt',
  },
  {
    label: 'GIFT-128',
    keyHex: 'd0f5c59a7700d3e799028fa9f90ad837',
    plainHex: 'e39c141fa57dba43f08a85b6a91f86c1',
    cipherHex: '13ede67cbdcc3dbf400a62d6977265ea',
    source: SRC + 'GIFT128_test_vector_3.txt',
  },
];

/**
 * The designers' own round-0 dump, for the three steps of the first round.
 *
 * Read from the same files at the same commit. These are what make the GIFT
 * implementation here checkable step by step rather than only end to end: the
 * ciphertext alone can be reached through two compensating errors, but
 * SubCells, PermBits and AddRoundKey cannot each land on the designers' value
 * by accident. The all-zero vector is deliberately not among them — its
 * intermediate states are uninformative.
 */
export interface GiftRoundDump {
  readonly label: string;
  readonly plainHex: string;
  readonly keyHex: string;
  readonly afterSubCells: string;
  readonly afterPermBits: string;
  readonly afterAddRoundKey: string;
  readonly source: string;
}

export const GIFT_ROUND0_DUMPS: readonly GiftRoundDump[] = [
  {
    label: 'GIFT-64',
    plainHex: 'fedcba9876543210',
    keyHex: 'fedcba9876543210fedcba9876543210',
    afterSubCells: 'e8057bd293f6c4a1',
    afterPermBits: '47346bd88f7090af',
    afterAddRoundKey: 'c50769e88d7392a7',
    source: SRC + 'GIFT64_test_vector_2.txt, round 0',
  },
  {
    label: 'GIFT-64',
    plainHex: 'c450c7727a9b8a7d',
    keyHex: 'bd91731eb6bc2713a1f9f6ffc75044e7',
    afterSubCells: '56f159949bd72b90',
    afterPermBits: '75338ddb59f87090',
    afterAddRoundKey: 'd6338ef94aea7189',
    source: SRC + 'GIFT64_test_vector_3.txt, round 0',
  },
  {
    label: 'GIFT-128',
    plainHex: 'e39c141fa57dba43f08a85b6a91f86c1',
    keyHex: 'd0f5c59a7700d3e799028fa9f90ad837',
    afterSubCells: '8cd5a6aebf907b6ce12b2f73bdae235a',
    afterPermBits: '1a3ec38bceb733f3c29d2eb6dec2b7e0',
    afterAddRoundKey: 'bc58e7cdceb713d3a49b0ef29aa0b18e',
    source: SRC + 'GIFT128_test_vector_3.txt, round 0',
  },
];
