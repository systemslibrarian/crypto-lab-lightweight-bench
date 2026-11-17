/**
 * Word arithmetic at the five widths this bench needs: 16, 24, 32, 48 and 64 bits.
 *
 * SIMON and SPECK are specified over n-bit words for n in {16, 24, 32, 48, 64}.
 * Two of those (48 and 64) do not fit in a JavaScript number once you need
 * modular addition, so every word here is a BigInt. The cost is irrelevant —
 * a block cipher on one block is a few hundred BigInt ops — and the benefit is
 * that one code path serves all ten SIMON sizes and all ten SPECK sizes, so a
 * width-specific bug cannot hide in a width-specific branch.
 *
 * The rotational analysis in `src/analysis/` deliberately does NOT use these:
 * it counts billions of 16-bit and 8-bit operations and uses machine integers.
 */

/** 2^n - 1, as a BigInt mask. */
export function mask(n: number): bigint {
  return (1n << BigInt(n)) - 1n;
}

/** Left circular shift of an n-bit word. The paper's S^j. */
export function rotl(v: bigint, j: number, n: number): bigint {
  const m = mask(n);
  const b = BigInt(((j % n) + n) % n);
  const x = v & m;
  if (b === 0n) return x;
  return ((x << b) | (x >> (BigInt(n) - b))) & m;
}

/** Right circular shift of an n-bit word. The paper's S^-j. */
export function rotr(v: bigint, j: number, n: number): bigint {
  return rotl(v, -(((j % n) + n) % n), n);
}

/** Addition modulo 2^n. */
export function addMod(a: bigint, b: bigint, n: number): bigint {
  return (a + b) & mask(n);
}

/** Subtraction modulo 2^n. */
export function subMod(a: bigint, b: bigint, n: number): bigint {
  return (a - b) & mask(n);
}

/**
 * Bytes to words, big-endian within each word, first word first.
 *
 * This is the convention that makes a flat hex string identical to the hex the
 * 2013 paper prints with its spaces removed — see `BYTE_ORDER_NOTE`.
 */
export function bytesToWords(bytes: Uint8Array, n: number): bigint[] {
  const bytesPerWord = n / 8;
  if (!Number.isInteger(bytesPerWord)) throw new Error(`word size ${n} is not a whole number of bytes`);
  if (bytes.length % bytesPerWord !== 0) {
    throw new Error(`${bytes.length} bytes is not a whole number of ${n}-bit words`);
  }
  const out: bigint[] = [];
  for (let i = 0; i < bytes.length; i += bytesPerWord) {
    let w = 0n;
    for (let j = 0; j < bytesPerWord; j++) w = (w << 8n) | BigInt(bytes[i + j]);
    out.push(w);
  }
  return out;
}

/** Words to bytes, the inverse of `bytesToWords`. */
export function wordsToBytes(words: bigint[], n: number): Uint8Array {
  const bytesPerWord = n / 8;
  const out = new Uint8Array(words.length * bytesPerWord);
  for (let i = 0; i < words.length; i++) {
    let w = words[i] & mask(n);
    for (let j = bytesPerWord - 1; j >= 0; j--) {
      out[i * bytesPerWord + j] = Number(w & 0xffn);
      w >>= 8n;
    }
  }
  return out;
}

/** An n-bit word as zero-padded lowercase hex. */
export function wordHex(v: bigint, n: number): string {
  return (v & mask(n)).toString(16).padStart(n / 4, '0');
}

/**
 * Why the page reads hex the way it does, stated on the page and in the README.
 *
 * ePrint 2013/404 specifies SIMON and SPECK over words that are *numbers*. It
 * fixes no serialisation of those numbers to bytes, so an implementation has to
 * choose one, and two implementations that choose differently agree with the
 * paper and with nobody else. The reference C code published alongside the
 * paper happens to be little-endian on a little-endian host; the printed test
 * vectors in Appendices B and C are big-endian per word, because they are
 * printed as numbers.
 *
 * This lab takes the printed form as the convention: big-endian within each
 * word, words left to right exactly as the appendix prints them. A flat hex
 * string in this page is therefore the paper's own hex with the spaces deleted,
 * and no byte-swap stands between what you type and what Appendix B says.
 */
export const BYTE_ORDER_NOTE =
  'Big-endian within each word, words in the order ePrint 2013/404 prints them. ' +
  'A flat hex string here is the paper’s printed hex with the spaces removed. ' +
  'The paper fixes no byte order, so this is a choice; the reference C code’s ' +
  'little-endian serialisation would need a byte-swap to match the printed vectors.';
