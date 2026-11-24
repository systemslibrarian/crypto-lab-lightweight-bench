/**
 * Exhibit 1 — Five ciphers, one bench.
 *
 * Pick a family and a size, encrypt, decrypt, and compare against the vectors
 * that cipher's designers published. Three things here are load-bearing:
 *
 *  - The vector comparison is COMPUTED when you ask for it, from the key and
 *    plaintext on screen, against the fixture's own expected ciphertext. There
 *    is no "vectors pass" flag anywhere in this file. Mutation (11) replaces
 *    the live comparison with a stored boolean, and the claims suite sees it
 *    because the rendered expected/computed pair stops disagreeing when the
 *    cipher is broken.
 *  - The menu is built from `VARIANTS`, which is `ALL_VARIANTS` filtered by a
 *    live self-check (invariant 1). A broken cipher module is not offered, and
 *    the page says how many were withheld.
 *  - Changing the family, the size, the key or the block RETIRES any verdict on
 *    screen, and says it retired it rather than silently blanking it.
 */

import {
  PASSING_VECTORS,
  TOTAL_VECTORS,
  VARIANTS,
  WITHHELD,
  families,
  variantsOf,
} from '../ciphers';
import type { CipherVariant } from '../ciphers/types';
import { HexError, parseHex, randomHex, toHex } from '../ciphers/hex';
import { BYTE_ORDER_NOTE } from '../ciphers/words';
import { button, clear, dataTable, el, field, kv, list, scrollX, select, sourceNote, textInput, verdict } from './dom';

interface State {
  family: string;
  variant: CipherVariant;
}

export function renderBench(root: HTMLElement): void {
  clear(root);

  if (VARIANTS.length === 0) {
    root.appendChild(
      verdict(
        'bad',
        'bench-unavailable',
        'NO CIPHER IS AVAILABLE',
        `All ${WITHHELD.length} implementations failed their designers’ vectors, so none is offered. ` +
          'Invariant 1 forbids running a cipher the page cannot reproduce a published vector with.',
      ),
    );
    return;
  }

  const state: State = { family: families()[0], variant: variantsOf(families()[0])[0] };

  root.appendChild(el('h2', { text: 'Five ciphers, one bench' }));
  root.appendChild(
    el('p', {
      text:
        'Each cipher below is implemented from its designers’ paper. Pick one, encrypt a block, ' +
        'and then check it against the vectors the designers published — the comparison runs here, ' +
        'in your browser, against the hex printed in the source.',
    }),
  );

  // ---- availability line: invariant 1, visible ----
  const availability = el('div', { attrs: { id: 'bench-availability' } });
  root.appendChild(availability);
  renderAvailability(availability);

  // ---- controls ----
  const familySelect = select(
    'bench-family',
    families().map((f) => ({ value: f, label: f })),
  );
  const sizeSelect = select('bench-size', []);
  const keyInput = textInput('bench-key', '');
  const blockInput = textInput('bench-block', '');

  const controls = el('div', { class: 'controls' });
  controls.appendChild(field('Cipher', familySelect));
  controls.appendChild(field('Block / key size', sizeSelect));
  root.appendChild(controls);

  const inputs = el('div', { class: 'controls' });
  inputs.appendChild(field('Key (hex)', keyInput, { grow: true, hint: '' }));
  inputs.appendChild(field('Plaintext block (hex)', blockInput, { grow: true, hint: '' }));
  root.appendChild(inputs);

  const byteOrder = el('p', { class: 'hint', text: '', attrs: { id: 'bench-convention' } });
  root.appendChild(byteOrder);

  const actions = el('div', { class: 'btn-row' });
  const encryptBtn = button('bench-encrypt', 'Encrypt');
  const decryptBtn = button('bench-decrypt', 'Decrypt the result', { secondary: true });
  const randomBtn = button('bench-random', 'Random key and block', { secondary: true });
  const vectorsBtn = button('bench-check-vectors', 'Check the designers’ vectors', { secondary: true });
  actions.append(encryptBtn, decryptBtn, randomBtn, vectorsBtn);
  root.appendChild(actions);

  const output = el('div', { attrs: { id: 'bench-output' } });
  root.appendChild(output);

  const vectorsOut = el('div', { attrs: { id: 'bench-vectors' } });
  root.appendChild(vectorsOut);

  // ---- behaviour ----

  function loadSizes(): void {
    clear(sizeSelect);
    for (const v of variantsOf(state.family)) {
      sizeSelect.appendChild(el('option', { text: sizeLabel(v), attrs: { value: v.id } }));
    }
    state.variant = variantsOf(state.family)[0];
    sizeSelect.value = state.variant.id;
  }

  function loadDefaults(): void {
    const v = state.variant;
    const t = v.vectors[0];
    keyInput.value = t ? t.keyHex : randomHex(v.keyBits);
    blockInput.value = t ? t.plainHex : randomHex(v.blockBits);
    keyInput.setAttribute('maxlength', String(v.keyBits / 4));
    blockInput.setAttribute('maxlength', String(v.blockBits / 4));
    const keyWord = v.family === 'SKINNY' ? 'Tweakey' : 'Key';
    const keyField = keyInput.closest('.field')?.querySelector('label');
    if (keyField) keyField.textContent = `${keyWord} (hex, ${v.keyBits / 4} digits)`;
    const blockField = blockInput.closest('.field')?.querySelector('label');
    if (blockField) blockField.textContent = `Plaintext block (hex, ${v.blockBits / 4} digits)`;
    const keyHint = document.getElementById('bench-key-hint');
    if (keyHint) keyHint.textContent = `${v.keyBits} bits — ${v.keyBits / 4} hex digits.`;
    const blockHint = document.getElementById('bench-block-hint');
    if (blockHint) blockHint.textContent = `${v.blockBits} bits — ${v.blockBits / 4} hex digits. ${v.rounds} rounds.`;
    byteOrder.textContent = conventionFor(v);
  }

  function retire(reason: string): void {
    const had = output.childElementCount > 0 || vectorsOut.childElementCount > 0;
    clear(output);
    clear(vectorsOut);
    if (had) {
      output.appendChild(
        verdict('info', 'bench-retired', 'VERDICT RETIRED', `${reason} Run it again to get a verdict for what is on screen now.`),
      );
    }
  }

  familySelect.addEventListener('change', () => {
    const next = familySelect.value;
    if (next === state.family) return; // a no-op selection retires nothing
    state.family = next;
    loadSizes();
    loadDefaults();
    retire(`The cipher changed to ${state.variant.family}.`);
  });

  sizeSelect.addEventListener('change', () => {
    const next = variantsOf(state.family).find((v) => v.id === sizeSelect.value);
    if (!next || next.id === state.variant.id) return;
    state.variant = next;
    loadDefaults();
    retire(`The size changed to ${state.variant.label}.`);
  });

  for (const input of [keyInput, blockInput]) {
    let last = '';
    input.addEventListener('focus', () => (last = input.value));
    input.addEventListener('change', () => {
      if (input.value === last) return; // typing and reverting retires nothing
      last = input.value;
      retire(input === keyInput ? 'The key changed.' : 'The plaintext changed.');
    });
  }

  randomBtn.addEventListener('click', () => {
    keyInput.value = randomHex(state.variant.keyBits);
    blockInput.value = randomHex(state.variant.blockBits);
    retire('The key and block were replaced with fresh random values from crypto.getRandomValues.');
  });

  encryptBtn.addEventListener('click', () => {
    clear(output);
    clear(vectorsOut);
    const v = state.variant;
    let key: Uint8Array;
    let pt: Uint8Array;
    try {
      key = parseHex(keyInput.value, v.keyBits, v.family === 'SKINNY' ? 'tweakey' : 'key');
      pt = parseHex(blockInput.value, v.blockBits, 'plaintext block');
    } catch (e) {
      output.appendChild(refusal(e));
      return;
    }
    const ct = toHex(v.encrypt(pt, key));
    output.appendChild(
      el('div', {
        attrs: { 'data-claim': 'bench-ciphertext', 'data-cipher': v.id, 'data-plaintext': toHex(pt), 'data-ciphertext': ct },
        children: [
          kv([
            { key: 'cipher', value: v.label },
            { key: 'rounds', value: String(v.rounds) },
            { key: 'plaintext', value: toHex(pt) },
            { key: 'ciphertext', value: ct },
          ]),
        ],
      }),
    );
    output.appendChild(stateGrid(v, ct));
  });

  decryptBtn.addEventListener('click', () => {
    const holder = output.querySelector('[data-claim="bench-ciphertext"]');
    if (!holder) {
      clear(output);
      output.appendChild(
        verdict('warn', 'bench-nothing-to-decrypt', 'NOTHING TO DECRYPT', 'Encrypt a block first, then decrypt it.'),
      );
      return;
    }
    const v = state.variant;
    const ctHex = holder.getAttribute('data-ciphertext') ?? '';
    const ptHex = holder.getAttribute('data-plaintext') ?? '';
    const key = parseHex(keyInput.value, v.keyBits, 'key');
    const back = toHex(v.decrypt(parseHex(ctHex, v.blockBits, 'ciphertext'), key));
    const ok = back === ptHex;
    const existing = output.querySelector('[data-claim="bench-decrypted"]');
    if (existing) existing.remove();
    output.appendChild(
      el('div', {
        attrs: { 'data-claim': 'bench-decrypted', 'data-decrypted': back, 'data-plaintext': ptHex },
        children: [
          verdict(
            ok ? 'ok' : 'bad',
            'bench-roundtrip',
            ok ? 'DECRYPTED BACK TO THE PLAINTEXT' : 'DECRYPTION DID NOT RETURN THE PLAINTEXT',
            ok
              ? `${v.label} decrypted ${ctHex} to ${back}, which is the block that was encrypted.`
              : `${v.label} decrypted ${ctHex} to ${back}, but the plaintext was ${ptHex}.`,
          ),
        ],
      }),
    );
  });

  vectorsBtn.addEventListener('click', () => {
    clear(vectorsOut);
    renderVectorCheck(vectorsOut, state.variant, (key, block) => {
      if (keyInput.value === key && blockInput.value === block) return;
      keyInput.value = key;
      blockInput.value = block;
      if (output.childElementCount > 0) {
        clear(output);
        output.appendChild(verdict('info', 'bench-retired', 'VERDICT RETIRED', 'The published vector was loaded. Encrypt it to see its ciphertext.'));
      }
    });
  });

  loadSizes();
  loadDefaults();
}

function sizeLabel(v: CipherVariant): string {
  return `${v.label} — block ${v.blockBits}, ${v.family === 'SKINNY' ? 'tweakey' : 'key'} ${v.keyBits}, ${v.rounds} rounds`;
}

function conventionFor(v: CipherVariant): string {
  switch (v.family) {
    case 'SIMON':
    case 'SPECK':
      return `Byte order: ${BYTE_ORDER_NOTE} The key is printed (k[m-1], …, k[0]), so the RIGHTMOST word is the first round key.`;
    case 'GIFT':
      return 'Byte order: big-endian. The key word k7 is the most significant, and there is no initial key addition — round 1 begins with SubCells on the plaintext itself.';
    case 'SKINNY':
      return 'Cell order: the 16 cells load ROW BY ROW, not column by column as in the AES. The tweakey is TK1 ‖ TK2 ‖ TK3 and is XORed in before it is updated.';
    case 'PRINCE':
      return 'Nibble order: most significant first. The 128-bit key is k0 ‖ k1; k0 whitens the input and k1 is the core key.';
    default:
      return '';
  }
}

function refusal(e: unknown): HTMLElement {
  const message = e instanceof HexError ? e.message : e instanceof Error ? e.message : String(e);
  return verdict('bad', 'bench-refused', 'REFUSED', message);
}

/**
 * A short caption (the table's accessible name) plus the explanation beside it.
 *
 * The explanation used to BE the caption, and a `<caption>` box is as wide as
 * its table — so a full sentence over a two-column word grid wrapped to about
 * twelve characters a line. The sentence is a sibling now; the caption stays
 * because it is what names the table.
 */
function gridBlock(caption: string, note: string, table: HTMLElement, label: string): HTMLElement {
  table.insertBefore(el('caption', { text: caption }), table.firstChild);
  return el('div', {
    children: [el('p', { class: 'hint', text: note }), scrollX(label, table)],
  });
}

/** The ciphertext as the grid its own paper would draw. */
function stateGrid(v: CipherVariant, hex: string): HTMLElement {
  const layout = v.layout;
  if (layout.kind === 'cells') {
    const cells: string[] = [];
    const per = layout.bits / 4;
    for (let i = 0; i < 16; i++) cells.push(hex.slice(i * per, i * per + per));
    const table = el('table', { class: 'state-grid' });
    const head = el('tr');
    head.appendChild(el('th', { text: '', attrs: { scope: 'col' } }));
    for (let c = 0; c < 4; c++) head.appendChild(el('th', { text: `col ${c}`, attrs: { scope: 'col' } }));
    table.appendChild(head);
    for (let r = 0; r < 4; r++) {
      const tr = el('tr');
      tr.appendChild(el('th', { text: `row ${r}`, attrs: { scope: 'row' } }));
      for (let c = 0; c < 4; c++) tr.appendChild(el('td', { text: cells[r * 4 + c] }));
      table.appendChild(tr);
    }
    return gridBlock(
      `${v.label} ciphertext as a 4 × 4 state`,
      'Cells are numbered ROW BY ROW, which is SKINNY’s order and not the AES’s: cell 0 is row 0 ' +
        'column 0, and cell 4 is row 1 column 0, not row 0 column 1.',
      table,
      'Ciphertext state grid',
    );
  }
  if (layout.kind === 'words') {
    const per = layout.bits / 4;
    const table = el('table', { class: 'state-grid' });
    const head = el('tr');
    head.appendChild(el('th', { text: 'x', attrs: { scope: 'col' } }));
    head.appendChild(el('th', { text: 'y', attrs: { scope: 'col' } }));
    table.appendChild(head);
    const tr = el('tr');
    tr.appendChild(el('td', { text: hex.slice(0, per) }));
    tr.appendChild(el('td', { text: hex.slice(per) }));
    table.appendChild(tr);
    return gridBlock(
      `${v.label} ciphertext as two ${layout.bits}-bit words`,
      'The block is the word pair (x, y) with x on the left, exactly as ePrint 2013/404 prints it.',
      table,
      'Ciphertext word pair',
    );
  }
  const table = el('table', { class: 'state-grid' });
  const head = el('tr');
  const row = el('tr');
  for (let i = 0; i < layout.count; i++) {
    head.appendChild(el('th', { text: String(layout.count - 1 - i), attrs: { scope: 'col' } }));
    row.appendChild(el('td', { text: hex[i] ?? '' }));
  }
  table.appendChild(head);
  table.appendChild(row);
  return gridBlock(
    `${v.label} ciphertext as ${layout.count} nibbles`,
    'Numbered most significant first, which is the order both GIFT and PRINCE specify.',
    table,
    'Ciphertext nibbles',
  );
}

/**
 * The designers' vectors, each compared live.
 *
 * For every vector this runs the cipher on the vector's OWN key and plaintext
 * and prints the expected and computed ciphertext side by side, plus the
 * decryption of the expected ciphertext. The verdict is derived from that
 * comparison in this function; nothing is read from a flag.
 */
function renderVectorCheck(
  root: HTMLElement,
  v: CipherVariant,
  loadInputs: (key: string, block: string) => void,
): void {
  root.appendChild(el('h3', { text: `The designers’ vectors for ${v.label}` }));

  const items: Node[] = [];
  let matched = 0;
  for (const [i, t] of v.vectors.entries()) {
    const key = parseHex(t.keyHex, v.keyBits, 'key');
    const pt = parseHex(t.plainHex, v.blockBits, 'plaintext');
    const computed = toHex(v.encrypt(pt, key));
    const back = toHex(v.decrypt(parseHex(t.cipherHex, v.blockBits, 'ciphertext'), key));
    const ok = computed === t.cipherHex && back === t.plainHex;
    if (ok) matched++;
    const holder = el('div', {
      attrs: {
        'data-vector': String(i),
        'data-cipher': v.id,
        'data-expected': t.cipherHex,
        'data-computed': computed,
        'data-key': t.keyHex,
        'data-plaintext': t.plainHex,
        'data-decrypted': back,
        'data-verdict': ok ? 'vector-match' : 'vector-mismatch',
      },
      children: [
        kv([
          { key: v.family === 'SKINNY' ? 'tweakey' : 'key', value: t.keyHex },
          { key: 'plaintext', value: t.plainHex },
          { key: 'expected', value: t.cipherHex },
          { key: 'computed', value: computed, flag: computed === t.cipherHex ? 'match' : 'mismatch' },
          { key: 'decrypted', value: back, flag: back === t.plainHex ? 'match' : 'mismatch' },
        ]),
        verdict(
          ok ? 'ok' : 'bad',
          ok ? 'vector-verdict-ok' : 'vector-verdict-bad',
          ok ? 'MATCHES THE PUBLISHED VECTOR' : 'DOES NOT MATCH THE PUBLISHED VECTOR',
          ok
            ? 'Computed here, compared against the hex in the source below.'
            : 'The computed value differs from the source. This cipher should not have been offered.',
        ),
        sourceNote(`Source: ${t.source}`),
      ],
    });
    items.push(holder);
  }

  root.appendChild(list('vector-list', items));
  root.appendChild(
    verdict(
      matched === v.vectors.length ? 'ok' : 'bad',
      'bench-vector-summary',
      matched === v.vectors.length
        ? `ALL ${v.vectors.length} VECTORS REPRODUCED`
        : `${matched} OF ${v.vectors.length} VECTORS REPRODUCED`,
      `Each line above was computed in this page just now, encrypting the vector’s key and plaintext ` +
        `and decrypting its ciphertext.`,
    ),
  );

  const load = button('bench-load-vector', 'Load the first vector into the controls above', { secondary: true });
  load.addEventListener('click', () => {
    const t = v.vectors[0];
    loadInputs(t.keyHex, t.plainHex);
  });
  root.appendChild(load);
}

/** Invariant 1 rendered: what is offered, what is withheld, and why. */
function renderAvailability(root: HTMLElement): void {
  clear(root);
  const offered = VARIANTS.length;
  const all = offered + WITHHELD.length;
  if (WITHHELD.length === 0) {
    root.appendChild(
      verdict(
        'ok',
        'bench-availability',
        `${offered} OF ${all} VERSIONS OFFERED`,
        `Every one of the ${TOTAL_VECTORS} vectors their designers published reproduced in this page at load, ` +
          `encryption and decryption both. A version whose vectors did not reproduce would not appear in the menu.`,
      ),
    );
    return;
  }
  root.appendChild(
    verdict(
      'bad',
      'bench-availability',
      `${offered} OF ${all} VERSIONS OFFERED — ${WITHHELD.length} WITHHELD`,
      `${PASSING_VECTORS} of ${TOTAL_VECTORS} published vectors reproduced. Invariant 1 withholds any version ` +
        `whose designers’ vectors do not reproduce, so the versions listed below are not in the menu.`,
    ),
  );
  root.appendChild(
    scrollX(
      'Withheld cipher versions',
      dataTable(
        'Withheld because a published vector did not reproduce.',
        ['Version', 'Vectors passed', 'What went wrong'],
        WITHHELD.map((c) => ({
          cells: [c.variant.label, `${c.passed} / ${c.total}`, c.failure ?? 'unknown'],
        })),
        1,
      ),
    ),
  );
}
