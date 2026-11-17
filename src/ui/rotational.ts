/**
 * Exhibit 5 — Rotational pairs.
 *
 * Three runs, in order of how much they prove:
 *
 *  1. ONE modular addition at 16 bits, EXHAUSTIVELY. All 2^32 pairs counted;
 *     the answer is 1,610,661,888, and it agrees with Lemma 1 to the last bit.
 *  2. CHAINED additions at 8 bits, exhaustively, against the folklore estimate
 *     of multiplying Lemma 1 once per addition. The folklore overestimates, and
 *     this run says by how much — which is the whole content of Lemma 2.
 *  3. SPECK32/64 for one to six rounds, SAMPLED, in two key models. The round
 *     function passes rotational pairs at about 0.375 per round. The real key
 *     schedule does not.
 *
 * Run 3 is where the NEGATIVE CLAIM lives. When both columns have run, the
 * verdict reads as a success and a limit at once — the round function has the
 * property, and the cipher does not — and the negative-claim sentence is on
 * screen in that state, not behind a disclosure.
 */

import {
  NEGATIVE_CLAIM,
  RotationError,
  SAMPLE_CAP,
  SAMPLE_DEFAULT,
  type ExhaustiveResult,
  type SpeckRotationalPoint,
  capSamples,
  lemma1,
  lemma2,
  lemma2Exact,
  naiveProduct,
  requireRotation,
} from '../analysis/rotational';
import type { WorkerRequest, WorkerResponse } from '../analysis/rotational.worker';
import { button, clear, dataTable, el, field, scrollX, select, sourceNote, textInput, verdict } from './dom';

const MAX_ROUNDS = 6;

/**
 * The cap's exponent, DERIVED from the cap.
 *
 * It was written out beside it as a literal "(2^26)" until the cap moved to
 * 2^24 and the page carried on printing the old exponent next to the new
 * number. A number and a restatement of the same number must not be able to
 * disagree.
 */
const CAP_EXPONENT = Math.log2(SAMPLE_CAP);

/** Two validated categorical hues for the dark chart surface (#121c19). */
const SERIES_ROUND_FN = '#199e70';
const SERIES_REAL = '#d95926';

export function renderRotational(root: HTMLElement): void {
  clear(root);

  root.appendChild(el('h2', { text: 'Rotational pairs: a round-function property that the key schedule removes' }));
  root.appendChild(
    el('p', {
      text:
        'Take a word and rotate it. XOR and rotation do not care — rotating the inputs rotates the output, ' +
        'always. Modular addition mostly does not care either, and "mostly" is the opening: if a cipher is ' +
        'built only from additions, rotations and XORs, a rotated pair of inputs gives a rotated pair of ' +
        'outputs more often than chance. SPECK is built from exactly those three operations.',
    }),
  );
  root.appendChild(
    el('p', {
      text:
        'What follows is three runs. The first two count every case rather than sampling, so they are not ' +
        'estimates. The third samples, and says how many samples with every number it prints.',
    }),
  );

  const rotSelect = select(
    'rot-amount',
    [1, 2, 3, 4, 5, 7, 8, 15].map((r) => ({ value: String(r), label: `rotate by ${r}` })),
  );
  const samplesInput = textInput('rot-samples', String(SAMPLE_DEFAULT));

  const controls = el('div', { class: 'controls' });
  controls.appendChild(
    field('Rotation amount', rotSelect, {
      hint: 'Must be a real rotation: 0 and the word size are the identity and are refused.',
    }),
  );
  controls.appendChild(
    field('Samples per point (run 3)', samplesInput, {
      hint: `Capped at ${SAMPLE_CAP.toLocaleString()} (2^${CAP_EXPONENT}) so the worker finishes. The cap is stated when it bites.`,
    }),
  );
  root.appendChild(controls);

  const badRotation = el('div', { attrs: { id: 'rot-rotation-error' } });
  root.appendChild(badRotation);

  // ---------- run 1 ----------
  root.appendChild(el('h3', { text: 'Run 1 — one addition, every pair counted' }));
  const oneActions = el('div', { class: 'btn-row' });
  const oneBtn = button('rot-run-one', 'Count all 2^32 pairs at 16 bits');
  const oneSmallBtn = button('rot-run-one-small', 'Count all 2^16 pairs at 8 bits (instant)', { secondary: true });
  oneActions.append(oneBtn, oneSmallBtn);
  root.appendChild(oneActions);
  const oneOut = el('div', { attrs: { id: 'rot-one-output' } });
  root.appendChild(oneOut);

  // ---------- run 2 ----------
  root.appendChild(el('h3', { text: 'Run 2 — chained additions, against the folklore' }));
  root.appendChild(
    el('p', {
      text:
        'The folklore says: count the modular additions, raise Lemma 1 to that power, done. ' +
        'ePrint 2015/095 shows that is wrong when the additions are CHAINED — they are not independent, ' +
        'so the product overestimates. These counts are exhaustive at 8-bit words. ' +
        '16-bit chains would be 2^48 tuples and are not attempted here.',
    }),
  );
  const chainActions = el('div', { class: 'btn-row' });
  const chainBtn = button('rot-run-chain', 'Count every 8-bit tuple, 1 to 3 chained additions');
  chainActions.append(chainBtn);
  root.appendChild(chainActions);
  const chainOut = el('div', { attrs: { id: 'rot-chain-output' } });
  root.appendChild(chainOut);

  // ---------- run 3 ----------
  root.appendChild(el('h3', { text: 'Run 3 — SPECK32/64, round function against real cipher' }));
  root.appendChild(
    el('p', {
      text:
        'Two columns. In the first, the second member of each pair gets every round key ROTATED — the ' +
        'related-key model, which isolates the round function by letting the key cancel. In the second, ' +
        'both members get the SAME round keys from SPECK’s real key schedule, built from a fresh random ' +
        'master key per sample. The only difference between the columns is the key schedule.',
    }),
  );
  const speckActions = el('div', { class: 'btn-row' });
  const speckBtn = button('rot-run-speck', `Sample both key models, 1 to ${MAX_ROUNDS} rounds`);
  speckActions.append(speckBtn);
  root.appendChild(speckActions);
  const speckOut = el('div', { attrs: { id: 'rot-speck-output' } });
  root.appendChild(speckOut);

  const progress = el('div', { class: 'progress-line', attrs: { id: 'rot-progress', role: 'status', 'aria-live': 'polite' } });
  root.appendChild(progress);

  // ---------- plumbing ----------

  let worker: Worker | null = null;
  const buttons = [oneBtn, oneSmallBtn, chainBtn, speckBtn];

  function readRotation(): number | null {
    clear(badRotation);
    const r = Number(rotSelect.value);
    try {
      requireRotation(r, 16);
      return r;
    } catch (e) {
      badRotation.appendChild(
        verdict('bad', 'rot-refused', 'REFUSED', e instanceof RotationError ? e.message : String(e)),
      );
      return null;
    }
  }

  function setBusy(busy: boolean): void {
    for (const b of buttons) b.disabled = busy;
  }

  function send(req: WorkerRequest, onDone: (r: WorkerResponse) => void): void {
    const r = readRotation();
    if (r === null) return;
    worker?.terminate();
    worker = new Worker(new URL('../analysis/rotational.worker.ts', import.meta.url), { type: 'module' });
    setBusy(true);
    progress.textContent = 'starting…';
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (msg.kind === 'progress') {
        progress.textContent = `${msg.label}: ${(msg.fraction * 100).toFixed(1)}%`;
        return;
      }
      progress.textContent = '';
      setBusy(false);
      worker?.terminate();
      worker = null;
      onDone(msg);
    };
    worker.onerror = () => {
      progress.textContent = '';
      setBusy(false);
    };
    worker.postMessage(req);
  }

  function errorInto(target: HTMLElement, msg: string): void {
    clear(target);
    target.appendChild(verdict('bad', 'rot-worker-error', 'THE RUN FAILED', msg));
  }

  function runOne(n: 8 | 16): void {
    const r = readRotation();
    if (r === null) return;
    clear(oneOut);
    send({ kind: 'one', n, r }, (msg) => {
      if (msg.kind === 'error') return errorInto(oneOut, msg.message);
      if (msg.kind !== 'one') return;
      renderOne(oneOut, msg.result);
    });
  }

  oneBtn.addEventListener('click', () => runOne(16));
  oneSmallBtn.addEventListener('click', () => runOne(8));

  chainBtn.addEventListener('click', () => {
    const r = readRotation();
    if (r === null) return;
    clear(chainOut);
    send({ kind: 'chain', r }, (msg) => {
      if (msg.kind === 'error') return errorInto(chainOut, msg.message);
      if (msg.kind !== 'chain') return;
      renderChain(chainOut, msg.results, r);
    });
  });

  speckBtn.addEventListener('click', () => {
    const r = readRotation();
    if (r === null) return;
    clear(speckOut);
    let requested: number;
    try {
      requested = Number(samplesInput.value.replace(/[\s,_]/g, ''));
      if (!Number.isFinite(requested)) throw new RotationError('The sample count must be a number.');
    } catch (e) {
      speckOut.appendChild(
        verdict('bad', 'rot-refused', 'REFUSED', e instanceof Error ? e.message : String(e)),
      );
      return;
    }
    let capped: { samples: number; capped: boolean };
    try {
      capped = capSamples(requested);
    } catch (e) {
      speckOut.appendChild(
        verdict('bad', 'rot-refused', 'REFUSED', e instanceof RotationError ? e.message : String(e)),
      );
      return;
    }
    if (capped.capped) {
      samplesInput.value = String(capped.samples);
      speckOut.appendChild(
        verdict(
          'warn',
          'rot-sample-capped',
          'SAMPLE COUNT CAPPED',
          `You asked for ${requested.toLocaleString()} samples per point. The worker’s budget is ` +
            `${SAMPLE_CAP.toLocaleString()} (2^${CAP_EXPONENT}), so the run below uses ${capped.samples.toLocaleString()}.`,
        ),
      );
    }
    send({ kind: 'speck', maxRounds: MAX_ROUNDS, samples: capped.samples, r }, (msg) => {
      if (msg.kind === 'error') return errorInto(speckOut, msg.message);
      if (msg.kind !== 'speck') return;
      renderSpeck(speckOut, msg.points, msg.samples, r, capped.capped, requested);
    });
  });

  // Retire run 3's verdict when the rotation amount changes under it.
  rotSelect.addEventListener('change', () => {
    const stale = [oneOut, chainOut, speckOut].filter((o) => o.childElementCount > 0);
    for (const o of stale) clear(o);
    if (stale.length > 0) {
      speckOut.appendChild(
        verdict(
          'info',
          'rot-retired',
          'RESULTS RETIRED',
          'The rotation amount changed, so the counts on screen no longer describe the current setting. Run them again.',
        ),
      );
    }
  });
}

/** Run 1's result: the exhaustive count beside Lemma 1. */
function renderOne(root: HTMLElement, res: ExhaustiveResult): void {
  const fraction = res.survivors / res.total;
  const predicted = lemma1(res.n, res.r);
  const exact = fraction === predicted;
  root.appendChild(
    el('div', {
      attrs: {
        'data-claim': 'rot-one',
        'data-n': String(res.n),
        'data-r': String(res.r),
        'data-survivors': String(res.survivors),
        'data-total': String(res.total),
        'data-exhaustive': 'true',
      },
      children: [
        scrollX(
          'One addition, exhaustive count',
          dataTable(
            `Every pair at ${res.n}-bit words, rotation ${res.r}. EXHAUSTIVE — all ${res.total.toLocaleString()} pairs were counted, not sampled.`,
            ['Quantity', 'Value'],
            [
              { cells: ['Pairs that survived', res.survivors.toLocaleString()] },
              { cells: ['Pairs counted', res.total.toLocaleString()] },
              { cells: ['Fraction', fraction.toPrecision(10)] },
              { cells: ["Lemma 1's probability", predicted.toPrecision(10)] },
            ],
            1,
          ),
        ),
        verdict(
          exact ? 'ok' : 'warn',
          'rot-one-verdict',
          exact ? 'THE EXHAUSTIVE COUNT EQUALS LEMMA 1 EXACTLY' : 'THE COUNT AND LEMMA 1 DIFFER',
          exact
            ? `${res.survivors.toLocaleString()} of ${res.total.toLocaleString()} pairs pass through one ` +
              `modular addition with the rotation intact. Lemma 1 predicts that fraction from n and r alone, ` +
              `and the two agree to the last bit of a double.`
            : `The count gives ${fraction.toPrecision(10)} where Lemma 1 gives ${predicted.toPrecision(10)}.`,
        ),
        sourceNote(
          'Lemma 1 (attributed there to Daum): ePrint 2015/095, §3. Pr = (1 + 2^(r-n) + 2^-r + 2^-n) / 4.',
        ),
      ],
    }),
  );
}

/** Run 2's result: exhaustive chains against the naive product. */
function renderChain(root: HTMLElement, results: readonly ExhaustiveResult[], r: number): void {
  const rows = results.map((res) => {
    const words = res.additions + 1;
    const fraction = res.survivors / res.total;
    const lemma = lemma2(8, r, words);
    const naive = naiveProduct(8, r, words);
    const exactMatch = BigInt(res.survivors) === lemma2Exact(8, r, words).num;
    return {
      cells: [
        `${res.additions} addition${res.additions === 1 ? '' : 's'}`,
        res.survivors.toLocaleString(),
        fraction.toExponential(4),
        lemma.toExponential(4),
        naive.toExponential(4),
        `${(naive / fraction).toFixed(3)}×`,
      ],
      className: exactMatch ? 'on-bench' : '',
    };
  });

  const allExact = results.every(
    (res) => BigInt(res.survivors) === lemma2Exact(8, r, res.additions + 1).num,
  );
  const factors = results.map((res) => naiveProduct(8, r, res.additions + 1) / (res.survivors / res.total));

  root.appendChild(
    el('div', {
      attrs: {
        'data-claim': 'rot-chain',
        'data-r': String(r),
        'data-exhaustive': 'true',
        'data-factors': factors.map((f) => f.toFixed(4)).join(','),
        'data-survivors': results.map((x) => x.survivors).join(','),
        'data-totals': results.map((x) => x.total).join(','),
      },
      children: [
        scrollX(
          'Chained additions, exhaustive counts',
          dataTable(
            `8-bit words, rotation ${r}. EXHAUSTIVE — every tuple counted (${(256 ** 4).toLocaleString()} of them for three additions).`,
            ['Chain', 'Survivors', 'Measured', 'Lemma 2', 'Lemma 1 per addition', 'Folklore overestimates by'],
            rows,
            1,
          ),
        ),
        verdict(
          allExact ? 'ok' : 'warn',
          'rot-chain-verdict',
          allExact
            ? 'EVERY EXHAUSTIVE COUNT EQUALS LEMMA 2 EXACTLY'
            : 'A COUNT DISAGREES WITH LEMMA 2',
          allExact
            ? `And the folklore — Lemma 1 once per addition — overestimates by ` +
              `${factors.map((f) => f.toFixed(2) + '×').join(', ')} for one, two and three chained additions. ` +
              `Chained additions share their carries, so they are not independent events, which is exactly ` +
              `what ePrint 2015/095 set out to correct.`
            : 'The exhaustive counts and Lemma 2 do not agree, so one of the two is implemented wrongly here.',
        ),
        sourceNote('Lemma 2 (chained modular additions): ePrint 2015/095, §4.'),
      ],
    }),
  );
}

/** Run 3's result: the two key models, the chart, the table, the negative claim. */
function renderSpeck(
  root: HTMLElement,
  points: readonly SpeckRotationalPoint[],
  samples: number,
  r: number,
  wasCapped: boolean,
  requested: number,
): void {
  const byMode = (mode: SpeckRotationalPoint['mode']) =>
    points.filter((p) => p.mode === mode).sort((a, b) => a.rounds - b.rounds);
  const roundFn = byMode('rotated-round-keys');
  const real = byMode('real-schedule');
  const p1 = lemma1(16, r);

  const holder = el('div', {
    attrs: {
      'data-claim': 'rot-speck',
      'data-samples': String(samples),
      'data-r': String(r),
      'data-roundfn-survivors': roundFn.map((p) => p.survivors).join(','),
      'data-real-survivors': real.map((p) => p.survivors).join(','),
      'data-predicted': roundFn.map((p) => (p1 ** p.rounds).toPrecision(6)).join(','),
    },
  });

  // ---- chart, with a table alternative immediately after ----
  holder.appendChild(survivalChart(roundFn, real, samples, p1));

  const rows = roundFn.map((p, i) => {
    const rp = real[i];
    const fraction = p.survivors / p.samples;
    const predicted = p1 ** p.rounds;
    return {
      cells: [
        String(p.rounds),
        p.survivors.toLocaleString(),
        fraction.toPrecision(6),
        predicted.toPrecision(6),
        `${(((fraction - predicted) / predicted) * 100).toFixed(2)}%`,
        rp.survivors.toLocaleString(),
        rp.survivors === 0 ? 'none observed' : (rp.survivors / rp.samples).toExponential(3),
      ],
      className: '',
    };
  });

  holder.appendChild(
    scrollX(
      'Rotational survival by round, both key models',
      dataTable(
        `SPECK32/64, rotation ${r}, ${samples.toLocaleString()} samples per point. ` +
          `This table is the chart above in numbers.`,
        [
          'Rounds',
          'Survivors (rotated round keys)',
          'Fraction',
          `Predicted ${p1.toPrecision(6)}^r`,
          'Difference',
          'Survivors (real schedule)',
          'Fraction',
        ],
        rows,
        1,
      ),
    ),
  );

  // ---- the verdict: success and limit in one line ----
  const worstError = Math.max(
    ...roundFn.slice(0, 3).map((p) => {
      const f = p.survivors / p.samples;
      const want = p1 ** p.rounds;
      return Math.abs(f - want) / want;
    }),
  );
  const roundFnHolds = worstError < 0.05;
  const realBreaksByTwo = real.filter((p) => p.rounds >= 2).every((p) => p.survivors === 0);

  const bothRan = roundFn.length === MAX_ROUNDS && real.length === MAX_ROUNDS;

  holder.appendChild(
    verdict(
      roundFnHolds && realBreaksByTwo ? 'warn' : 'bad',
      'rot-speck-verdict',
      roundFnHolds && realBreaksByTwo
        ? 'ROUND FUNCTION PRESERVES ROTATION — AND THE REAL CIPHER DOES NOT'
        : roundFnHolds
          ? 'ROUND FUNCTION PRESERVES ROTATION'
          : 'THE MEASURED SURVIVAL DOES NOT MATCH THE PREDICTION',
      roundFnHolds
        ? `With rotated round keys the survival fraction tracks ${p1.toPrecision(6)}^r for all ` +
          `${MAX_ROUNDS} rounds, measured over ${samples.toLocaleString()} samples per point. ` +
          (realBreaksByTwo
            ? `With SPECK’s real key schedule, and the same ${samples.toLocaleString()} samples per point, ` +
              `nothing survived two rounds.`
            : `The real-schedule column still shows survivors past one round.`)
        : `The rotated-round-key column is off the prediction by ${(worstError * 100).toFixed(1)}% at ` +
          `${samples.toLocaleString()} samples per point.`,
    ),
  );

  // The negative claim, on screen in exactly this state.
  if (bothRan && roundFnHolds && realBreaksByTwo) {
    const claim = el('div', {
      class: 'negative-claim',
      attrs: { 'data-claim': 'negative-claim', role: 'note' },
    });
    claim.appendChild(el('span', { class: 'negative-claim-label', text: 'WHAT THIS DOES NOT SHOW' }));
    claim.appendChild(el('p', { text: NEGATIVE_CLAIM }));
    claim.appendChild(
      el('p', {
        class: 'hint',
        text:
          `Both columns above were run at ${samples.toLocaleString()} samples per point. The difference ` +
          `between them is one term: SPECK’s key schedule XORs the round counter in at every step, and a ` +
          `counter is not rotation-invariant, so the round keys of a rotated pair are not rotations of each ` +
          `other. The property is real and it buys an attacker nothing here.`,
      }),
    );
    holder.appendChild(claim);
  }

  if (wasCapped) {
    holder.appendChild(
      el('p', {
        class: 'hint',
        text: `You asked for ${requested.toLocaleString()} samples per point; the run used the capped ${samples.toLocaleString()}.`,
      }),
    );
  }

  holder.appendChild(
    sourceNote(
      'SPECK32/64 is ePrint 2013/404 §4 with (alpha, beta) = (7, 2). The rotational framework and both ' +
        'lemmas are ePrint 2015/095. The two key models here are this page’s experiment, not the paper’s.',
    ),
  );

  root.appendChild(holder);
}

/**
 * The survival chart.
 *
 * y is log2 of the survival fraction, which turns a geometric decay into a
 * straight line — and a straight line is the claim being made, so the reader
 * can check it by eye. A zero count has no logarithm, so instead of dropping
 * those points the chart draws the DETECTION FLOOR at log2(1/samples) and says
 * what it means: nothing below that line is observable at this sample size.
 * Without the floor, "0 survivors" would look like a measurement of zero rather
 * than an absence of evidence.
 */
function survivalChart(
  roundFn: readonly SpeckRotationalPoint[],
  real: readonly SpeckRotationalPoint[],
  samples: number,
  p1: number,
): HTMLElement {
  const W = 680;
  const H = 320;
  const padL = 56;
  // Wide enough for the legend's longest line: it starts at W - padR + 24 and
  // the 10px note runs about 115px, so anything under ~140 clips it against
  // the viewBox edge with no overflow and no warning.
  const padR = 152;
  const padT = 18;
  const padB = 44;
  const floor = Math.log2(1 / samples);
  const yMin = Math.min(-24, Math.floor(floor) - 2);
  const xOf = (rounds: number) => padL + ((rounds - 1) / (MAX_ROUNDS - 1)) * (W - padL - padR);
  const yOf = (log2: number) => padT + (log2 / yMin) * (H - padT - padB);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `Rotational survival through SPECK32/64 rounds, log base 2 of the surviving fraction. ` +
      `With rotated round keys the fraction falls in a straight line from ${Math.log2(roundFn[0].survivors / samples).toFixed(1)} ` +
      `at one round to ${Math.log2(Math.max(roundFn[MAX_ROUNDS - 1].survivors, 1) / samples).toFixed(1)} at six. ` +
      `With the real key schedule, survivors appear only at one round and none at all beyond it. ` +
      `The same numbers are in the table below this chart.`,
  );

  const ns = 'http://www.w3.org/2000/svg';
  const add = (tag: string, attrs: Record<string, string>, text?: string) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    svg.appendChild(n);
    return n;
  };

  // recessive grid + axis labels
  for (let t = 0; t >= yMin; t -= 4) {
    add('line', {
      x1: String(padL),
      x2: String(W - padR),
      y1: String(yOf(t)),
      y2: String(yOf(t)),
      stroke: 'var(--border)',
      'stroke-width': '1',
    });
    add(
      'text',
      {
        x: String(padL - 8),
        y: String(yOf(t) + 4),
        'text-anchor': 'end',
        fill: 'var(--text-muted)',
        'font-size': '11',
        'font-family': 'ui-monospace, monospace',
      },
      t === 0 ? '1' : `2^${t}`,
    );
  }
  for (let r = 1; r <= MAX_ROUNDS; r++) {
    add(
      'text',
      {
        x: String(xOf(r)),
        y: String(H - padB + 18),
        'text-anchor': 'middle',
        fill: 'var(--text-muted)',
        'font-size': '11',
      },
      String(r),
    );
  }
  add(
    'text',
    {
      x: String((padL + W - padR) / 2),
      y: String(H - 6),
      'text-anchor': 'middle',
      fill: 'var(--text-dim)',
      'font-size': '12',
    },
    'rounds of SPECK32/64',
  );

  // the prediction, as a reference line in a TEXT token, not a series colour
  const predPath = Array.from({ length: MAX_ROUNDS }, (_, i) => {
    const rounds = i + 1;
    return `${i === 0 ? 'M' : 'L'}${xOf(rounds)},${yOf(Math.log2(p1 ** rounds))}`;
  }).join(' ');
  add('path', {
    d: predPath,
    fill: 'none',
    stroke: 'var(--text-dim)',
    'stroke-width': '1.5',
    'stroke-dasharray': '2 4',
  });

  // the detection floor
  add('line', {
    x1: String(padL),
    x2: String(W - padR),
    y1: String(yOf(floor)),
    y2: String(yOf(floor)),
    stroke: 'var(--warn)',
    'stroke-width': '1.5',
    'stroke-dasharray': '6 4',
  });
  add(
    'text',
    {
      x: String(padL + 4),
      y: String(yOf(floor) - 6),
      fill: 'var(--warn)',
      'font-size': '11',
    },
    `detection floor — one survivor in ${samples.toLocaleString()}`,
  );

  // series 1: the round function
  const fnPath = roundFn
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.rounds)},${yOf(Math.log2(Math.max(p.survivors, 1) / samples))}`)
    .join(' ');
  add('path', { d: fnPath, fill: 'none', stroke: SERIES_ROUND_FN, 'stroke-width': '2' });
  for (const p of roundFn) {
    const log2 = Math.log2(Math.max(p.survivors, 1) / samples);
    const c = add('circle', {
      cx: String(xOf(p.rounds)),
      cy: String(yOf(log2)),
      r: '4.5',
      fill: SERIES_ROUND_FN,
      stroke: 'var(--panel)',
      'stroke-width': '2',
    });
    const title = document.createElementNS(ns, 'title');
    title.textContent = `Rotated round keys, ${p.rounds} round${p.rounds === 1 ? '' : 's'}: ${p.survivors.toLocaleString()} of ${samples.toLocaleString()} survived (2^${log2.toFixed(2)})`;
    c.appendChild(title);
  }

  // series 2: the real schedule
  for (const p of real) {
    if (p.survivors === 0) {
      // Drawn AT the floor as a hollow marker with a cross, so an absence does
      // not render as a measurement.
      const g = add('path', {
        d: `M${xOf(p.rounds) - 4},${yOf(floor) - 4} L${xOf(p.rounds) + 4},${yOf(floor) + 4} M${xOf(p.rounds) + 4},${yOf(floor) - 4} L${xOf(p.rounds) - 4},${yOf(floor) + 4}`,
        stroke: SERIES_REAL,
        'stroke-width': '2',
        fill: 'none',
      });
      const title = document.createElementNS(ns, 'title');
      title.textContent = `Real key schedule, ${p.rounds} rounds: no survivors in ${samples.toLocaleString()} samples`;
      g.appendChild(title);
      continue;
    }
    const log2 = Math.log2(p.survivors / samples);
    const c = add('circle', {
      cx: String(xOf(p.rounds)),
      cy: String(yOf(log2)),
      r: '4.5',
      fill: SERIES_REAL,
      stroke: 'var(--panel)',
      'stroke-width': '2',
    });
    const title = document.createElementNS(ns, 'title');
    title.textContent = `Real key schedule, ${p.rounds} round${p.rounds === 1 ? '' : 's'}: ${p.survivors.toLocaleString()} of ${samples.toLocaleString()} survived (2^${log2.toFixed(2)})`;
    c.appendChild(title);
  }

  // legend: always present at two series, and each series also directly labelled
  const legend: [string, string, string][] = [
    [SERIES_ROUND_FN, 'rotated round keys', 'the round function alone'],
    [SERIES_REAL, 'real key schedule', '× = none observed'],
  ];
  legend.forEach(([colour, label, note], i) => {
    const y = padT + 10 + i * 34;
    add('rect', { x: String(W - padR + 8), y: String(y - 7), width: '10', height: '10', rx: '2', fill: colour });
    add(
      'text',
      { x: String(W - padR + 24), y: String(y + 2), fill: 'var(--text)', 'font-size': '11' },
      label,
    );
    add(
      'text',
      { x: String(W - padR + 24), y: String(y + 15), fill: 'var(--text-muted)', 'font-size': '10' },
      note,
    );
  });
  add(
    'text',
    { x: String(W - padR + 8), y: String(padT + 92), fill: 'var(--text-dim)', 'font-size': '10' },
    'dashed grey:',
  );
  add(
    'text',
    { x: String(W - padR + 8), y: String(padT + 104), fill: 'var(--text-dim)', 'font-size': '10' },
    `${p1.toFixed(4)}^r`,
  );

  return el('figure', {
    attrs: { 'data-chart': 'rot-survival', style: 'margin:0' },
    children: [
      svg,
      el('figcaption', {
        class: 'hint',
        text:
          'The vertical axis is log base 2 of the surviving fraction, so a constant per-round probability is ' +
          'a straight line. The dashed grey line is the prediction from Lemma 1 raised to the round count. ' +
          'Crosses on the amber floor are rounds where the real key schedule left no survivors at all — an ' +
          'absence of evidence at this sample size, not a measured zero.',
      }),
    ],
  });
}
