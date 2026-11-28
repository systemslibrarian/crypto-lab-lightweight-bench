/**
 * Exhibit 4 — PRINCE runs backwards with the same circuit.
 *
 * The alpha-reflection property: because RC_i XOR RC_(11-i) = alpha for every
 * i and the middle layer M' is an involution,
 *
 *     D_(k0||k0'||k1)(.) = E_(k0'||k0||k1 XOR alpha)(.)
 *
 * so decryption is the ENCRYPTION routine with the whitening keys swapped and
 * alpha added to the core key. The exhibit runs both and compares them, and
 * then runs the same thing with one bit of alpha flipped as a negative control
 * — because a demonstration that only ever succeeds has not shown that the
 * property is doing any work.
 */

import { ALPHA, RC, decryptByReflection, decryptStepwise, princeEncrypt } from '../ciphers/prince';
import { HexError, parseHex, randomBytes, randomHex, toHex } from '../ciphers/hex';
import { button, clear, dataTable, el, field, kv, scrollX, textInput, verdict } from './dom';

const TRIALS = 1000;
const CONTROL_TRIALS = 2000;

export function renderReflection(root: HTMLElement): void {
  clear(root);
  root.appendChild(el('h2', { text: 'PRINCE decrypts with its own encryption circuit' }));
  root.appendChild(
    el('p', {
      text:
        'PRINCE can use its encryption core to decrypt. Swap the two whitening keys and XOR the core ' +
        'key with alpha. The designers report negligible additional hardware for decryption in their ' +
        'architecture. This browser compares the resulting blocks. Chip area requires a hardware measurement.',
    }),
  );

  root.appendChild(
    el('p', {
      children: [],
      text:
        'It works because of two facts you can check on this page: the round constants come in pairs that ' +
        'differ by exactly alpha, and the middle layer is its own inverse.',
    }),
  );

  const keyInput = textInput('reflect-key', '0000000000000000fedcba9876543210', { maxlength: 32 });
  const blockInput = textInput('reflect-block', '0123456789abcdef', { maxlength: 16 });

  const controls = el('div', { class: 'controls' });
  controls.appendChild(
    field('Key (hex, 32 digits = k0 ‖ k1)', keyInput, {
      grow: true,
      hint: 'k0 whitens the block; k1 is the 64-bit core key that alpha is added to.',
    }),
  );
  controls.appendChild(field('Block (hex, 16 digits)', blockInput, { grow: true }));
  root.appendChild(controls);

  const actions = el('div', { class: 'btn-row' });
  const runBtn = button('reflect-run', 'Encrypt, then decrypt both ways');
  const batchBtn = button('reflect-batch', `Compare on ${TRIALS.toLocaleString()} random blocks`, { secondary: true });
  const controlBtn = button('reflect-control', 'Negative control: flip one bit of alpha', { secondary: true });
  const randomBtn = button('reflect-random', 'Random key and block', { secondary: true });
  actions.append(runBtn, batchBtn, controlBtn, randomBtn);
  root.appendChild(actions);

  const out = el('div', { attrs: { id: 'reflect-output' } });
  root.appendChild(out);

  function retire(reason: string): void {
    if (out.childElementCount === 0) return;
    clear(out);
    out.appendChild(verdict('info', 'reflect-retired', 'VERDICT RETIRED', `${reason} Run it again.`));
  }

  for (const input of [keyInput, blockInput]) {
    let last = input.value;
    input.addEventListener('change', () => {
      if (input.value === last) return;
      last = input.value;
      retire(input === keyInput ? 'The key changed.' : 'The block changed.');
    });
  }

  runBtn.addEventListener('click', () => {
    clear(out);
    let key: Uint8Array;
    let pt: Uint8Array;
    try {
      key = parseHex(keyInput.value, 128, 'key');
      pt = parseHex(blockInput.value, 64, 'block');
    } catch (e) {
      out.appendChild(verdict('bad', 'reflect-refused', 'REFUSED', e instanceof HexError ? e.message : String(e)));
      return;
    }
    const ct = princeEncrypt(pt, key);
    const viaReflection = toHex(decryptByReflection(ct, key));
    const viaInverse = toHex(decryptStepwise(ct, key));
    const ptHex = toHex(pt);
    const agree = viaReflection === viaInverse;
    const correct = viaReflection === ptHex;

    out.appendChild(
      el('div', {
        attrs: {
          'data-claim': 'reflect-single',
          'data-plaintext': ptHex,
          'data-ciphertext': toHex(ct),
          'data-reflection': viaReflection,
          'data-stepwise': viaInverse,
        },
        children: [
          kv([
            { key: 'plaintext', value: ptHex },
            { key: 'ciphertext', value: toHex(ct) },
            { key: 'by reflection', value: viaReflection, flag: correct ? 'match' : 'mismatch' },
            { key: 'by inverse', value: viaInverse, flag: viaInverse === ptHex ? 'match' : 'mismatch' },
          ]),
        ],
      }),
    );

    out.appendChild(
      verdict(
        agree && correct ? 'ok' : 'bad',
        'reflect-verdict',
        agree && correct
          ? 'THE ENCRYPTION CIRCUIT DECRYPTED IT'
          : 'THE TWO ROUTES DISAGREE',
        agree && correct
          ? 'The reflection route called the encryption routine with the whitening keys swapped and alpha ' +
            'added to the core key, and got the plaintext back. The step-by-step inverse agrees with it.'
          : 'The reflection route and the explicit inverse returned different blocks, so the property does not hold here.',
      ),
    );

    out.appendChild(el('h4', { text: 'Why it works: the round constants pair up' }));
    const pairs = [];
    for (let i = 0; i <= 5; i++) {
      pairs.push({
        cells: [
          `RC${i} ⊕ RC${11 - i}`,
          RC[i].toString(16).padStart(16, '0'),
          RC[11 - i].toString(16).padStart(16, '0'),
          (RC[i] ^ RC[11 - i]).toString(16).padStart(16, '0'),
        ],
        className: (RC[i] ^ RC[11 - i]) === ALPHA ? 'on-bench' : '',
      });
    }
    out.appendChild(
      scrollX(
        'Round constant pairs',
        dataTable(
          `Every pair XORs to alpha = ${ALPHA.toString(16)}. Computed here from the constants in §2 of ePrint 2012/529.`,
          ['Pair', 'First', 'Second', 'XOR'],
          pairs,
          1,
        ),
      ),
    );
  });

  batchBtn.addEventListener('click', () => {
    clear(out);
    let agreed = 0;
    for (let i = 0; i < TRIALS; i++) {
      const key = randomBytes(16);
      const ct = randomBytes(8);
      if (toHex(decryptByReflection(ct, key)) === toHex(decryptStepwise(ct, key))) agreed++;
    }
    out.appendChild(
      el('div', {
        attrs: {
          'data-claim': 'reflect-batch',
          'data-agreed': String(agreed),
          'data-trials': String(TRIALS),
        },
        children: [
          verdict(
            agreed === TRIALS ? 'ok' : 'bad',
            'reflect-batch-verdict',
            agreed === TRIALS
              ? `AGREED ON ALL ${TRIALS.toLocaleString()} RANDOM BLOCKS`
              : `AGREED ON ONLY ${agreed.toLocaleString()} OF ${TRIALS.toLocaleString()}`,
            `Fresh key and ciphertext from crypto.getRandomValues each time; the reflection route and the ` +
              `step-by-step inverse were compared block by block.`,
          ),
        ],
      }),
    );
  });

  controlBtn.addEventListener('click', () => {
    clear(out);
    let agreed = 0;
    for (let i = 0; i < CONTROL_TRIALS; i++) {
      const key = randomBytes(16);
      const ct = randomBytes(8);
      const wrongAlpha = ALPHA ^ (1n << BigInt(i % 64));
      if (toHex(decryptByReflection(ct, key, wrongAlpha)) === toHex(decryptStepwise(ct, key))) agreed++;
    }
    out.appendChild(
      el('div', {
        attrs: {
          'data-claim': 'reflect-control',
          'data-agreed': String(agreed),
          'data-trials': String(CONTROL_TRIALS),
        },
        children: [
          verdict(
            agreed === 0 ? 'ok' : 'bad',
            'reflect-control-verdict',
            `${agreed.toLocaleString()} OF ${CONTROL_TRIALS.toLocaleString()} SAMPLED TRIALS AGREED`,
            'Each trial changed one bit of alpha and compared the two outputs. The count describes this run. ' +
              'The six round-constant pairs in the single-block example show where the specified alpha comes from.',
          ),
        ],
      }),
    );
  });

  randomBtn.addEventListener('click', () => {
    keyInput.value = randomHex(128);
    blockInput.value = randomHex(64);
    retire('The key and block were replaced with fresh random values.');
  });

  const caveat = el('details');
  caveat.appendChild(el('summary', { text: 'What reflection costs' }));
  caveat.appendChild(
    el('p', {
      text:
        'Reflection is not free security-wise, and the designers say so. It makes encryption under one key ' +
        'equal to decryption under a related key, which is a structural relation an attacker knows about. ' +
        'The paper addresses this directly — it proves a bound in the ideal cipher model that accounts for ' +
        'the relation. The designers limit that bound to their stated model and make no related-key security claim.',
    }),
  );
  root.appendChild(caveat);
}
