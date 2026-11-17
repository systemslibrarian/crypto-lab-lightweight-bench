/**
 * Exhibit 3 — Three goals.
 *
 * "Lightweight" means three things that pull against each other: a small
 * circuit, a small program, or a short delay. Each design picked one, said so
 * in its own paper, and built its round function around it.
 *
 * EVERY FIGURE ON THIS PANEL IS A PAPER'S FIGURE, cited to the table that
 * prints it. This page measures no gate count, no code size and no propagation
 * delay, and could not: it is a browser. The panel says that twice — once at
 * the top and once per table — because it is the single easiest thing for a
 * reader to misattribute.
 */

import { ALL_VARIANTS, FAMILY_FACTS, GOAL_LABELS, PAPER_FIGURES } from '../ciphers';
import { el, clear, scrollX, sourceNote, dataTable, verdict } from './dom';

export function renderGoals(root: HTMLElement): void {
  clear(root);
  root.appendChild(el('h2', { text: 'Three goals, five answers' }));
  root.appendChild(
    el('p', {
      text:
        'A cipher small enough for a 1,500-gate ASIC is not the same cipher as one small enough for ' +
        'two kilobytes of flash, and neither is the one that finishes in a single clock cycle. The three ' +
        'goals conflict, so there is no winner here — only designs that chose differently.',
    }),
  );

  root.appendChild(
    verdict(
      'warn',
      'goals-attribution',
      'THESE ARE THE PAPERS’ NUMBERS, NOT THIS PAGE’S',
      'Every gate count, delay and byte count below was published by the cited design paper. This page ' +
        'runs ciphers in a browser; it measures no hardware area, no latency and no code size, and nothing ' +
        'here is a measurement made by this demo.',
    ),
  );

  // ---- the design-goal table ----
  root.appendChild(el('h3', { text: 'What each paper says it optimised for' }));
  const rows = FAMILY_FACTS.map((f) => {
    const vs = ALL_VARIANTS.filter((v) => v.family === f.family);
    const blocks = unique(vs.map((v) => v.blockBits)).join(', ');
    const keys = unique(vs.map((v) => v.keyBits)).join(', ');
    const rounds = unique(vs.map((v) => v.rounds));
    const roundText = rounds.length === 1 ? String(rounds[0]) : `${Math.min(...rounds)}–${Math.max(...rounds)}`;
    return {
      cells: [f.family, GOAL_LABELS[f.goal], blocks, keys, roundText, f.structure],
      className: 'on-bench',
    };
  });
  root.appendChild(
    scrollX(
      'Design goals and parameters',
      dataTable(
        'Block and key sizes, and round counts, are the versions this bench implements; the goal is each paper’s own stated target.',
        ['Family', 'Stated goal', 'Block sizes', 'Key sizes', 'Rounds', 'Structure'],
        rows,
        2,
      ),
    ),
  );

  // ---- the stated-target quotes, each sourced ----
  root.appendChild(el('h3', { text: 'In the designers’ own words' }));
  const quotes = el('ul', { class: 'vector-list', attrs: { role: 'list' } });
  for (const f of FAMILY_FACTS) {
    const li = el('li', { attrs: { role: 'listitem', 'data-goal-family': f.family, 'data-goal': f.goal } });
    li.appendChild(el('h4', { text: `${f.family} — ${GOAL_LABELS[f.goal]}` }));
    li.appendChild(el('p', { text: f.statedTarget }));
    const link = el('a', {
      text: f.paper,
      attrs: { href: f.eprint, target: '_blank', rel: 'noopener noreferrer' },
    });
    const by = el('p', { class: 'source-note', attrs: { 'data-source': f.figureSource } });
    by.appendChild(document.createTextNode(`${f.authors} · `));
    by.appendChild(link);
    by.appendChild(document.createTextNode(` · ${f.figureSource}`));
    li.appendChild(by);
    quotes.appendChild(li);
  }
  root.appendChild(quotes);

  // ---- the papers' comparison tables ----
  root.appendChild(el('h3', { text: 'The comparison tables, as published' }));
  root.appendChild(
    el('p', {
      text:
        'Figures are comparable WITHIN a table and not across them: each table is one paper synthesising ' +
        'its comparison set against one standard cell library. Reading a number out of one table and ' +
        'setting it beside a number from another is the most common way these figures get misused.',
    }),
  );

  for (const t of PAPER_FIGURES) {
    const section = el('div', { attrs: { 'data-figure-table': t.id } });
    section.appendChild(el('h4', { text: t.title }));
    section.appendChild(el('p', { class: 'hint', text: t.note }));
    section.appendChild(
      scrollX(
        t.title,
        dataTable(
          t.source,
          ['Cipher', ...t.columns],
          t.rows.map((r) => ({
            cells: [r.name, ...r.cells],
            className: r.onBench ? 'on-bench' : '',
          })),
          1,
        ),
      ),
    );
    const src = sourceNote(`Source: ${t.source}`);
    const link = el('a', {
      text: t.eprint.replace('https://', ''),
      attrs: { href: t.eprint, target: '_blank', rel: 'noopener noreferrer' },
    });
    src.appendChild(document.createTextNode(' · '));
    src.appendChild(link);
    section.appendChild(src);
    root.appendChild(section);
  }

  const caveat = el('details');
  caveat.appendChild(el('summary', { text: 'Why there is no single league table here' }));
  caveat.appendChild(
    el('p', {
      text:
        'A gate count depends on the cell library, the synthesis constraint and whether the circuit is ' +
        'round-based or unrolled; a code size depends on the instruction set and on what the author counted ' +
        'as code. The SIMON and SPECK paper makes this point about its own table — it notes that it is not ' +
        'always clear what a particular author means by code size. So the tables above are kept apart, with ' +
        'the library and the circuit style named, rather than merged into a ranking that would be tidier and ' +
        'wrong.',
    }),
  );
  root.appendChild(caveat);
}

function unique(xs: number[]): number[] {
  return [...new Set(xs)].sort((a, b) => a - b);
}
