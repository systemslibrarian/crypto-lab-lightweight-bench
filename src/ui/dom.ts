/**
 * Small DOM helpers.
 *
 * Everything the page renders goes through `el`, and every verdict through
 * `verdict`, so two rules hold everywhere by construction:
 *
 *  - Text is set with `textContent`, never `innerHTML`. Vector hex, error
 *    messages and cipher labels all reach the DOM as text.
 *  - A verdict is always an ICON plus a WORD plus a colour, never a colour
 *    alone (WCAG 1.4.1), and always carries `data-verdict` so the claims suite
 *    can find it by meaning rather than by position.
 */

export type VerdictKind = 'ok' | 'bad' | 'warn' | 'info';

export interface ElOptions {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
  children?: (Node | null | undefined)[];
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: ElOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  if (opts.children) for (const c of opts.children) if (c) node.appendChild(c);
  return node;
}

const ICONS: Record<VerdictKind, string> = {
  ok: '✓',
  bad: '✕',
  warn: '⚠',
  info: '●',
};

/**
 * A verdict block: icon, word, and an optional explanatory line.
 *
 * `marker` becomes `data-verdict`, which is how `e2e/claims.spec.ts` addresses
 * it. A verdict with no marker cannot be asserted against, so the parameter is
 * required.
 */
export function verdict(kind: VerdictKind, marker: string, word: string, note?: string): HTMLElement {
  const body = el('span', { class: 'verdict-body' });
  body.appendChild(el('span', { class: 'verdict-word', text: word }));
  if (note) body.appendChild(el('span', { class: 'verdict-note', text: note }));
  return el('div', {
    class: `verdict verdict-${kind}`,
    attrs: { 'data-verdict': marker, 'data-verdict-kind': kind, role: 'status', 'aria-live': 'polite' },
    children: [el('span', { class: 'verdict-icon', text: ICONS[kind], attrs: { 'aria-hidden': 'true' } }), body],
  });
}

/** A labelled field wrapping a real form control. */
export function field(
  labelText: string,
  control: HTMLElement,
  opts: { grow?: boolean; hint?: string } = {},
): HTMLElement {
  const id = control.id;
  if (!id) throw new Error('every control needs an id so its label can point at it');
  const children: Node[] = [el('label', { text: labelText, attrs: { for: id } }), control];
  if (opts.hint) {
    const hint = el('p', { class: 'hint', text: opts.hint, attrs: { id: `${id}-hint` } });
    control.setAttribute('aria-describedby', `${id}-hint`);
    children.push(hint);
  }
  return el('div', { class: `field${opts.grow ? ' field-grow' : ''}`, children });
}

export function select(id: string, options: { value: string; label: string }[]): HTMLSelectElement {
  const s = el('select', { attrs: { id } });
  for (const o of options) s.appendChild(el('option', { text: o.label, attrs: { value: o.value } }));
  return s;
}

export function textInput(id: string, value: string, opts: { maxlength?: number } = {}): HTMLInputElement {
  const i = el('input', { attrs: { id, type: 'text', spellcheck: 'false', autocomplete: 'off' } });
  i.value = value;
  if (opts.maxlength !== undefined) i.setAttribute('maxlength', String(opts.maxlength));
  return i;
}

export function button(id: string, label: string, opts: { secondary?: boolean } = {}): HTMLButtonElement {
  return el('button', {
    class: `btn${opts.secondary ? ' btn-secondary' : ''}`,
    text: label,
    attrs: { id, type: 'button' },
  });
}

/**
 * A horizontally scrollable wrapper.
 *
 * An `overflow: auto` region has to be focusable and named or the Linux CI
 * runner fails it even where local Chromium passes, so the role, the tabindex
 * and the label are applied here rather than left to each caller.
 */
export function scrollX(label: string, child: Node): HTMLElement {
  return el('div', {
    class: 'scroll-x',
    attrs: { tabindex: '0', role: 'region', 'aria-label': label },
    children: [child],
  });
}

/** A `<ul role="list">` whose children all carry `role="listitem"`. */
export function list(className: string, items: Node[]): HTMLElement {
  const ul = el('ul', { class: className, attrs: { role: 'list' } });
  for (const i of items) {
    const li = el('li', { attrs: { role: 'listitem' } });
    li.appendChild(i);
    ul.appendChild(li);
  }
  return ul;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** A definition list of key/value pairs, each value optionally flagged. */
export function kv(pairs: { key: string; value: string; flag?: 'match' | 'mismatch' }[]): HTMLElement {
  const dl = el('dl', { class: 'kv' });
  for (const p of pairs) {
    dl.appendChild(el('dt', { text: p.key }));
    dl.appendChild(el('dd', { class: p.flag ?? '', text: p.value }));
  }
  return dl;
}

/** A table with a caption, a header row and body rows. */
export function dataTable(
  caption: string,
  columns: readonly string[],
  rows: readonly { cells: readonly string[]; className?: string; numeric?: boolean }[],
  numericFrom = 1,
): HTMLTableElement {
  const table = el('table', { class: 'data' });
  table.appendChild(el('caption', { text: caption }));
  const thead = el('thead');
  const hr = el('tr');
  columns.forEach((c, i) =>
    hr.appendChild(el('th', { text: c, class: i >= numericFrom ? 'num' : '', attrs: { scope: 'col' } })),
  );
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = el('tbody');
  for (const r of rows) {
    const tr = el('tr', { class: r.className ?? '' });
    r.cells.forEach((cell, i) => {
      if (i === 0) tr.appendChild(el('th', { text: cell, attrs: { scope: 'row' } }));
      else tr.appendChild(el('td', { text: cell, class: i >= numericFrom ? 'num' : '' }));
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

/** A source attribution line, rendered under whatever it attributes. */
export function sourceNote(text: string): HTMLElement {
  return el('p', { class: 'source-note', text, attrs: { 'data-source': text } });
}
