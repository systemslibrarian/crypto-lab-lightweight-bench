/**
 * Hex parsing that fails closed, with the message doing the teaching.
 *
 * Every refusal here is one of the EDGE CASES the brief enumerates, and each
 * message names the expected length or the offending character rather than
 * saying "invalid input" — a learner who typed 15 nibbles should be told it
 * wants 16, not told to try again.
 */

export class HexError extends Error {}

/** Parse hex to bytes, requiring exactly `bits` bits. */
export function parseHex(text: string, bits: number, what: string): Uint8Array {
  const s = text.trim().replace(/\s+/g, '').replace(/^0[xX]/, '');
  if (s.length === 0) throw new HexError(`The ${what} is empty. It needs ${bits / 4} hex digits (${bits} bits).`);
  const bad = s.match(/[^0-9a-fA-F]/);
  if (bad) {
    throw new HexError(
      `The ${what} contains ${JSON.stringify(bad[0])}, which is not a hex digit. ` +
        `Use 0-9 and a-f only.`,
    );
  }
  if (s.length !== bits / 4) {
    throw new HexError(
      `The ${what} is ${s.length} hex digits (${s.length * 4} bits); ` +
        `this size needs ${bits / 4} hex digits (${bits} bits).`,
    );
  }
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** `crypto.getRandomValues` only — invariant 5. */
export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function randomHex(bits: number): string {
  return toHex(randomBytes(bits / 8));
}
