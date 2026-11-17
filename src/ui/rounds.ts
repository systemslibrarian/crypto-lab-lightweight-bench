/**
 * Exhibit 2 — Round functions side by side.
 *
 * All five families have a 64-bit block version, so one 64-bit block can go
 * through all five first rounds and the columns are genuinely comparable:
 * SIMON 64/128, SPECK 64/128, GIFT-64, SKINNY-64-64 and PRINCE.
 *
 * The keys are not the same length, and the page says so rather than hiding it:
 * four of the five take a 128-bit key, SKINNY-64-64 takes a 64-bit tweakey, so
 * it uses the first half of the same hex.
 *
 * A step is marked `changed` when its state differs from the step before it.
 * That is computed from the two rendered states, not asserted.
 */

import { variantById } from '../ciphers';
import { FAMILY_FACTS, GOAL_LABELS } from '../ciphers';
import { HexError, parseHex, randomHex } from '../ciphers/hex';
import { button, clear, el, field, textInput, verdict } from './dom';

/** One 64-bit-block version of each family, in paper-chronological order. */
const COLUMNS = ['prince-64-128', 'simon-64-128', 'speck-64-128', 'skinny-64-64', 'gift-64'] as const;

export function renderRounds(root: HTMLElement): void {
  clear(root);
  root.appendChild(el('h2', { text: 'One round of each, on the same block' }));
  root.appendChild(
    el('p', {
      text:
        'Every family here has a 64-bit block version, so the same block can be pushed through all five ' +
        'first rounds and the columns compared. Read down a column and you are reading what that design ' +
        'chose to spend its gates on — and what it refused to spend them on.',
    }),
  );

  const blockInput = textInput('rounds-block', '0123456789abcdef', { maxlength: 16 });
  const keyInput = textInput('rounds-key', '00000000000000000000000000000000', { maxlength: 32 });

  const controls = el('div', { class: 'controls' });
  controls.appendChild(
    field('Block (hex, 16 digits)', blockInput, { grow: true, hint: 'One 64-bit block, fed to all five.' }),
  );
  controls.appendChild(
    field('Key (hex, 32 digits)', keyInput, {
      grow: true,
      hint: 'A 128-bit key. SKINNY-64-64 takes a 64-bit tweakey, so it uses the first 16 digits.',
    }),
  );
  root.appendChild(controls);

  const actions = el('div', { class: 'btn-row' });
  const traceBtn = button('rounds-trace', 'Trace one round of each');
  const randomBtn = button('rounds-random', 'Random block and key', { secondary: true });
  actions.append(traceBtn, randomBtn);
  root.appendChild(actions);

  const out = el('div', { attrs: { id: 'rounds-output' } });
  root.appendChild(out);

  function draw(): void {
    clear(out);
    let block: Uint8Array;
    let key: Uint8Array;
    try {
      block = parseHex(blockInput.value, 64, 'block');
      key = parseHex(keyInput.value, 128, 'key');
    } catch (e) {
      out.appendChild(
        verdict('bad', 'rounds-refused', 'REFUSED', e instanceof HexError ? e.message : String(e)),
      );
      return;
    }

    const grid = el('div', { class: 'trace-columns', attrs: { 'data-claim': 'round-trace' } });
    for (const id of COLUMNS) {
      const v = variantById(id);
      if (!v) continue;
      const facts = FAMILY_FACTS.find((f) => f.family === v.family);
      const col = el('div', {
        class: 'trace-col',
        attrs: { 'data-trace-column': v.family, 'data-variant': v.id },
      });
      col.appendChild(el('h4', { text: v.label }));
      col.appendChild(
        el('span', {
          class: 'trace-goal',
          text: facts ? `${GOAL_LABELS[facts.goal]} · ${v.rounds} rounds` : `${v.rounds} rounds`,
        }),
      );

      const keyForThis = key.slice(0, v.keyBits / 8);
      const steps = v.traceRound(block, keyForThis);
      let previous = '';
      for (const [i, s] of steps.entries()) {
        const joined = s.state.join(' ');
        const changed = i > 0 && joined !== previous;
        previous = joined;
        const stepEl = el('div', {
          class: `trace-step${changed ? ' changed' : ''}`,
          attrs: { 'data-step': String(i), 'data-op': s.op, 'data-state': s.state.join('') },
        });
        stepEl.appendChild(el('span', { class: 'trace-op', text: s.op }));
        stepEl.appendChild(el('div', { class: 'trace-state', text: joined }));
        stepEl.appendChild(el('p', { class: 'trace-note', text: s.note }));
        col.appendChild(stepEl);
      }
      grid.appendChild(col);
    }
    out.appendChild(grid);

    out.appendChild(
      verdict(
        'info',
        'rounds-traced',
        `ONE ROUND TRACED IN ${COLUMNS.length} CIPHERS`,
        'Each column is that cipher’s own first round on the block above, step by step, in the order its ' +
          'paper specifies. Highlighted rows are the steps that changed the state.',
      ),
    );

    const notes = el('details');
    notes.appendChild(el('summary', { text: 'What to look for in each column' }));
    const ul = el('ul', { attrs: { role: 'list' } });
    for (const [text] of [
      [
        'PRINCE spends its gates on being SHALLOW. Twelve rounds, one S-box, one linear layer — and the linear layer is an involution, which is what lets the same circuit decrypt.',
      ],
      [
        'SIMON spends almost nothing per round: one AND, three rotations, two XORs, and 44 rounds to make up for it. There is no S-box table to store at all.',
      ],
      [
        'SPECK replaces the AND with a modular ADDITION, which a microcontroller already has as one instruction. That is the whole hardware-versus-software split between the two.',
      ],
      [
        'SKINNY adds a TWEAKEY on top of the key, and its MixColumns is a binary matrix — no field multiplication anywhere, unlike the AES.',
      ],
      [
        'GIFT does the least per round of any of them: an S-box and a bit permutation that is literally wires, with the round key added at fixed bit positions and no whitening at all.',
      ],
    ]) {
      const li = el('li', { attrs: { role: 'listitem' } });
      li.appendChild(el('span', { text }));
      ul.appendChild(li);
    }
    notes.appendChild(ul);
    out.appendChild(notes);
  }

  traceBtn.addEventListener('click', draw);
  randomBtn.addEventListener('click', () => {
    blockInput.value = randomHex(64);
    keyInput.value = randomHex(128);
    draw();
  });

  draw();
}
