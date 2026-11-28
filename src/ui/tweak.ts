/**
 * Exhibit 6 — SKINNY with a tweak.
 *
 * SKINNY's key input is a TWEAKEY: the user decides how much of it is secret
 * key and how much is a public tweak. SKINNY-64-128 takes 128 bits of tweakey,
 * so with a 64-bit key there are 64 bits left for a tweak — and changing only
 * the tweak gives an unrelated permutation of the same block under the same
 * key, with no rekeying.
 *
 * The exhibit is a difference: same key, same plaintext, two tweaks. The
 * Hamming distance between the two ciphertexts is computed from the two
 * rendered values, so the "unrelated" claim is a number on the page rather than
 * an adjective.
 */

import { variantById } from '../ciphers';
import type { CipherVariant } from '../ciphers/types';
import { HexError, parseHex, randomHex, toHex } from '../ciphers/hex';
import { button, clear, el, field, kv, textInput, verdict } from './dom';

/** SKINNY-64-128: 64 bits of key as TK1, 64 bits of tweak as TK2. */
const VARIANT_ID = 'skinny-64-128';
const KEY_BITS = 64;
const TWEAK_BITS = 64;

export class TweakError extends Error {}

/**
 * Build a tweakey from a key and a tweak.
 *
 * A tweak longer than the tweakey leaves room for is refused, with the room
 * stated: this is the fail-closed path the brief names, and silently truncating
 * would teach that a tweak can be any length.
 */
export function buildTweakey(key: Uint8Array, tweak: Uint8Array, tweakeyBits: number): Uint8Array {
  const room = tweakeyBits / 8 - key.length;
  if (tweak.length > room) {
    throw new TweakError(
      `The tweak is ${tweak.length} bytes (${tweak.length * 8} bits), but with a ${key.length * 8}-bit key ` +
        `a ${tweakeyBits}-bit tweakey leaves room for only ${room} bytes (${room * 8} bits). ` +
        `Shorten the tweak, shorten the key, or choose a version with a larger tweakey.`,
    );
  }
  const out = new Uint8Array(tweakeyBits / 8);
  out.set(key, 0);
  out.set(tweak, key.length);
  return out;
}

export function hammingDistance(a: Uint8Array, b: Uint8Array): number {
  let bits = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[i];
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

export function renderTweak(root: HTMLElement): void {
  clear(root);
  const v = variantById(VARIANT_ID);

  root.appendChild(el('h2', { text: 'SKINNY takes a tweak' }));
  root.appendChild(
    el('p', {
      text:
        'A tweakable block cipher has a third input besides the key and the block. The tweak is PUBLIC — ' +
        'it can be a disk sector number, a record index, a counter — and changing it gives you a different ' +
        'permutation for the same secret key. This exhibit uses SKINNY-64-128 with 64 bits of secret key and 64 bits of public tweak. ' +
        'Both values enter the tweakey schedule on each encryption.',
    }),
  );

  if (!v) {
    root.appendChild(
      verdict(
        'bad',
        'tweak-unavailable',
        'SKINNY-64-128 IS NOT AVAILABLE',
        'Invariant 1 withheld this version because a published vector did not reproduce, so the tweak ' +
          'exhibit cannot run. See exhibit 1 for what was withheld and why.',
      ),
    );
    return;
  }

  // Bind the narrowed variant to its own const: TypeScript does not carry the
  // `if (!v) return` narrowing into the event handlers below.
  const variant: CipherVariant = v;

  const keyInput = textInput('tweak-key', '9eb93640d088da63', { maxlength: KEY_BITS / 4 });
  const blockInput = textInput('tweak-block', 'cf16cfe8fd0f98aa', { maxlength: 16 });
  const tweakA = textInput('tweak-a', '0000000000000000', { maxlength: TWEAK_BITS / 4 });
  const tweakB = textInput('tweak-b', '0000000000000001', { maxlength: TWEAK_BITS / 4 });

  const controls = el('div', { class: 'controls' });
  controls.appendChild(
    field(`Key (hex, ${KEY_BITS / 4} digits)`, keyInput, {
      grow: true,
      hint: `Loaded as TK1. SKINNY-64-128 takes ${variant.keyBits} bits of tweakey in total.`,
    }),
  );
  controls.appendChild(field('Plaintext block (hex, 16 digits)', blockInput, { grow: true }));
  root.appendChild(controls);

  const tweaks = el('div', { class: 'controls' });
  tweaks.appendChild(
    field(`Tweak A (hex, ${TWEAK_BITS / 4} digits)`, tweakA, {
      grow: true,
      hint: `Loaded as TK2. ${TWEAK_BITS} bits of room with a ${KEY_BITS}-bit key.`,
    }),
  );
  tweaks.appendChild(field(`Tweak B (hex, ${TWEAK_BITS / 4} digits)`, tweakB, { grow: true }));
  root.appendChild(tweaks);

  const actions = el('div', { class: 'btn-row' });
  const runBtn = button('tweak-run', 'Encrypt under both tweaks');
  const oneBitBtn = button('tweak-one-bit', 'Make B differ from A by one bit', { secondary: true });
  const longBtn = button('tweak-too-long', 'Try a tweak that is too long', { secondary: true });
  const randomBtn = button('tweak-random', 'Random key, block and tweaks', { secondary: true });
  actions.append(runBtn, oneBitBtn, longBtn, randomBtn);
  root.appendChild(actions);

  const out = el('div', { attrs: { id: 'tweak-output' } });
  root.appendChild(out);

  function run(): void {
    clear(out);
    let key: Uint8Array;
    let pt: Uint8Array;
    let ta: Uint8Array;
    let tb: Uint8Array;
    try {
      key = parseHex(keyInput.value, KEY_BITS, 'key');
      pt = parseHex(blockInput.value, variant.blockBits, 'plaintext block');
      ta = parseHex(tweakA.value, TWEAK_BITS, 'tweak A');
      tb = parseHex(tweakB.value, TWEAK_BITS, 'tweak B');
    } catch (e) {
      out.appendChild(
        verdict('bad', 'tweak-refused', 'REFUSED', e instanceof HexError ? e.message : String(e)),
      );
      return;
    }

    let ca: Uint8Array;
    let cb: Uint8Array;
    try {
      ca = variant.encrypt(pt, buildTweakey(key, ta, variant.keyBits));
      cb = variant.encrypt(pt, buildTweakey(key, tb, variant.keyBits));
    } catch (e) {
      out.appendChild(
        verdict('bad', 'tweak-refused', 'REFUSED', e instanceof TweakError ? e.message : String(e)),
      );
      return;
    }

    const tweakDistance = hammingDistance(ta, tb);
    const cipherDistance = hammingDistance(ca, cb);
    const same = toHex(ca) === toHex(cb);

    out.appendChild(
      el('div', {
        attrs: {
          'data-claim': 'tweak-pair',
          'data-tweak-a': toHex(ta),
          'data-tweak-b': toHex(tb),
          'data-cipher-a': toHex(ca),
          'data-cipher-b': toHex(cb),
          'data-tweak-distance': String(tweakDistance),
          'data-cipher-distance': String(cipherDistance),
          'data-block-bits': String(variant.blockBits),
        },
        children: [
          kv([
            { key: 'key (TK1)', value: toHex(key) },
            { key: 'plaintext', value: toHex(pt) },
            { key: 'tweak A', value: toHex(ta) },
            { key: 'ciphertext A', value: toHex(ca) },
            { key: 'tweak B', value: toHex(tb) },
            { key: 'ciphertext B', value: toHex(cb) },
          ]),
        ],
      }),
    );

    if (tweakDistance === 0) {
      out.appendChild(
        verdict(
          same ? 'info' : 'bad',
          'tweak-verdict',
          same ? 'SAME TWEAK, SAME CIPHERTEXT' : 'SAME TWEAK, DIFFERENT CIPHERTEXT',
          same
            ? 'The two tweaks are identical, so the two ciphertexts must be too. Change one of them to see ' +
              'what a tweak buys.'
            : 'Identical tweaks produced different ciphertexts, which should be impossible for a deterministic cipher.',
        ),
      );
      return;
    }

    out.appendChild(
      verdict(
        same ? 'info' : 'ok',
        'tweak-verdict',
        same
          ? 'DIFFERENT TWEAKS GAVE THE SAME CIPHERTEXT'
          : 'SAME KEY, SAME PLAINTEXT, DIFFERENT CIPHERTEXT',
        same
          ? 'Two tweak settings can produce the same output for one plaintext. This observation alone cannot tell whether the permutations differ elsewhere.'
          : `The tweaks differ in ${tweakDistance} bit${tweakDistance === 1 ? '' : 's'}; the ciphertexts differ in ` +
            `${cipherDistance} of ${variant.blockBits} bits. For an unrelated pair of ${variant.blockBits}-bit blocks you would ` +
            `expect about ${variant.blockBits / 2}. This measurement describes one pair of outputs.`,
      ),
    );

    out.appendChild(
      el('p', {
        class: 'hint',
        text:
          'Note what this is NOT: it is not a proof that SKINNY is a secure tweakable cipher. One pair of ' +
          'blocks measures the output distance for these inputs; the security argument is in the paper’s related-tweakey ' +
          'bounds, not here.',
      }),
    );
  }

  for (const input of [keyInput, blockInput, tweakA, tweakB]) {
    input.addEventListener('input', () => { out.textContent = 'Inputs changed. Encrypt under both tweaks to compare again.'; });
  }
  runBtn.addEventListener('click', run);

  oneBitBtn.addEventListener('click', () => {
    try {
      const a = parseHex(tweakA.value, TWEAK_BITS, 'tweak A');
      a[a.length - 1] ^= 1;
      tweakB.value = toHex(a);
      run();
    } catch (e) {
      clear(out);
      out.appendChild(
        verdict('bad', 'tweak-refused', 'REFUSED', e instanceof HexError ? e.message : String(e)),
      );
    }
  });

  longBtn.addEventListener('click', () => {
    clear(out);
    // 128 bits of tweak with a 64-bit key needs a 192-bit tweakey; this version
    // has 128, so there is room for 64.
    const oversized = new Uint8Array(16);
    crypto.getRandomValues(oversized);
    try {
      buildTweakey(parseHex(keyInput.value, KEY_BITS, 'key'), oversized, variant.keyBits);
      out.appendChild(
        verdict('bad', 'tweak-overlong', 'AN OVERSIZED TWEAK WAS ACCEPTED', 'It should have been refused.'),
      );
    } catch (e) {
      out.appendChild(
        verdict(
          'ok',
          'tweak-overlong',
          'REFUSED — THE TWEAK DOES NOT FIT',
          e instanceof TweakError ? e.message : String(e),
        ),
      );
      out.appendChild(
        el('p', {
          class: 'hint',
          text:
            'SKINNY-64-192 would take this tweak: it has 192 bits of tweakey, so a 64-bit key leaves 128 bits ' +
            'of room. The refusal is about this version’s budget, not about SKINNY.',
        }),
      );
    }
  });

  randomBtn.addEventListener('click', () => {
    keyInput.value = randomHex(KEY_BITS);
    blockInput.value = randomHex(variant.blockBits);
    tweakA.value = randomHex(TWEAK_BITS);
    tweakB.value = randomHex(TWEAK_BITS);
    run();
  });

  const related = el('p', { class: 'hint' });
  related.appendChild(document.createTextNode('A tweak is what makes disk-sector encryption work. '));
  related.appendChild(
    el('a', {
      text: 'Sector Vault',
      attrs: {
        href: 'https://systemslibrarian.github.io/crypto-lab-sector-vault/',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    }),
  );
  related.appendChild(
    document.createTextNode(
      ' takes the same idea the other way round: it builds a tweakable mode (XTS) out of a cipher that has no tweak input, and shows what that mode does and does not detect. ',
    ),
  );
  related.appendChild(
    el('a', {
      text: 'Format Ward',
      attrs: {
        href: 'https://systemslibrarian.github.io/crypto-lab-format-ward/',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    }),
  );
  related.appendChild(document.createTextNode(' uses tweaks in format-preserving encryption.'));
  root.appendChild(related);
}
