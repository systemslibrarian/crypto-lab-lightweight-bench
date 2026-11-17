#!/usr/bin/env node
/**
 * Mutation discipline, run from a script — §4.1c of `_MASTER-TEMPLATE.md`.
 *
 * A green suite is not evidence until you have watched it fail. This page
 * renders `data-verdict` markers, so the template requires three things of it,
 * and all three are mechanical here rather than written down afterwards:
 *
 *  1. EVERY MUTATION IS A CONCRETE PATCH — a file, an anchor that must occur
 *     EXACTLY ONCE, and a replacement. Never a sentence describing an edit. A
 *     sentence cannot be replayed; this file can.
 *
 *  2. A KILL IS DEFINED BY FOUR RULES, AND THIS SCRIPT ENFORCES ALL FOUR:
 *       a. the owning test PASSED unmutated, in this same run;
 *       b. the patch actually CHANGED the file (hash before != hash after);
 *       c. the run served the MUTATED code (the built bundle's hash moved, and
 *          the e2e runs are forced to build and serve fresh with CI=1 so no
 *          reused preview server can answer with unmutated code);
 *       d. a patch that does not compile is DOES NOT BUILD, and is never a
 *          kill. `npm run build` is `tsc --noEmit && vite build`, so a type
 *          error is caught here rather than passing as a red test run.
 *
 *  3. EVERY `observed` RECORD IS WRITTEN BY THE THING THAT RAN IT. Nothing in
 *     the ledger this script emits is typed by a person. The script fails if
 *     any mutation is not a kill, so an unperformed record cannot exist: there
 *     is no record without a run.
 *
 * Two mutations are deliberately expected to SURVIVE one named test while
 * killing another — see `survivesWith`. That is not a weakness being excused;
 * it is the brief's point about GIFT made executable: an all-zero key and an
 * all-zero plaintext cannot detect a round-key-position bug, because an
 * all-zero round key XORs to nothing wherever you put it. The script asserts
 * that the blind test really does stay green, so the claim "this vector cannot
 * see it" is measured rather than asserted.
 *
 * Usage:
 *   node scripts/mutations.mjs            # every mutation
 *   node scripts/mutations.mjs 4 7 11     # only these ids
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const LEDGER = join(ROOT, 'audits', 'mutation-ledger.json');

/**
 * The ledger.
 *
 * `owner` names the test that must fail. `survivesWith`, where present, names a
 * test that must KEEP PASSING under the same mutation — the blindness the
 * mutation exists to document.
 */
const MUTATIONS = [
  {
    id: 1,
    title: 'SIMON key words used left to right (printed order, not round-key order)',
    why:
      'ePrint 2013/404 §3.2: "they are loaded into the shift registers with k0 on the right". ' +
      'Reading the printed words left to right gives a cipher that is self-consistent, decrypts ' +
      'its own ciphertext, and agrees with no published vector.',
    file: 'src/ciphers/simon.ts',
    anchor: '  return bytesToWords(key, p.n).reverse();',
    replacement: '  return bytesToWords(key, p.n);',
    owner: { kind: 'unit', grep: 'SIMON 32/64 reproduces' },
  },
  {
    id: 2,
    title: "SPECK's 16-bit rotation amounts (7, 2) used at every word size",
    why:
      'ePrint 2013/404 §4.1 fixes (alpha, beta) = (7, 2) only for n = 16 and (8, 3) otherwise. ' +
      'Hardcoding (7, 2) leaves SPECK32/64 passing, so a suite that tests only the smallest ' +
      'size cannot see it.',
    file: 'src/ciphers/speck.ts',
    anchor:
      'export function speckRound(x: bigint, y: bigint, k: bigint, p: SpeckParams): [bigint, bigint] {\n' +
      '  const { n, alpha, beta } = p;',
    replacement:
      'export function speckRound(x: bigint, y: bigint, k: bigint, p: SpeckParams): [bigint, bigint] {\n' +
      '  const { n } = p;\n' +
      '  const alpha = 7;\n' +
      '  const beta = 2;',
    owner: { kind: 'unit', grep: 'SPECK 48/72 reproduces' },
    survivesWith: { kind: 'unit', grep: 'SPECK 32/64 reproduces' },
  },
  {
    id: 3,
    title: "SIMON's constant sequence read from the wrong end",
    why:
      'ePrint 2013/404 §3.2 indexes round key i+m with (z_j)_i, reading the printed sequence ' +
      'left to right. Reading it right to left is a different cipher with the same structure.',
    file: 'src/ciphers/simon.ts',
    anchor: '    const zi = BigInt(z.charCodeAt((i % 62)) - 48);',
    replacement: '    const zi = BigInt(z.charCodeAt(61 - (i % 62)) - 48);',
    owner: { kind: 'unit', grep: 'SIMON 32/64 reproduces' },
  },
  {
    id: 4,
    title: 'GIFT-64 round key added at bit positions 4i+1 and 4i+2 (the GIFT-128 positions)',
    why:
      'ePrint 2017/622 §2 puts GIFT-64’s round key at 4i and 4i+1, and GIFT-128’s at 4i+1 ' +
      'and 4i+2. The all-zero vector CANNOT see this: an all-zero round key XORs to nothing ' +
      'wherever it is placed. Vectors 2 and 3 can.',
    file: 'src/ciphers/gift.ts',
    anchor:
      '  if (blockBits === 64) {\n' +
      '    for (let i = 0; i < s; i++) {\n' +
      '      bits[4 * i + 1] ^= u[i];\n' +
      '      bits[4 * i] ^= v[i];\n' +
      '    }',
    replacement:
      '  if (blockBits === 64) {\n' +
      '    for (let i = 0; i < s; i++) {\n' +
      '      bits[4 * i + 2] ^= u[i];\n' +
      '      bits[4 * i + 1] ^= v[i];\n' +
      '    }',
    owner: { kind: 'unit', grep: 'GIFT-64 reproduces designers’ vector 2' },
    survivesWith: { kind: 'unit', grep: 'GIFT-64 reproduces designers’ vector 1' },
  },
  {
    id: 5,
    title: "GIFT's key state rotation skipped",
    why:
      'ePrint 2017/622 §2 updates the key state as k1 >>> 2 || k0 >>> 12 || k7 ... k2. Skipping ' +
      'the two rotations is invisible to the all-zero vector, whose key state is all zero ' +
      'however it is rotated.',
    file: 'src/ciphers/gift.ts',
    anchor: '  return [k[2], k[3], k[4], k[5], k[6], k[7], ror16(k[0], 12), ror16(k[1], 2)];',
    replacement: '  return [k[2], k[3], k[4], k[5], k[6], k[7], ror16(k[0], 0), ror16(k[1], 0)];',
    owner: { kind: 'unit', grep: 'GIFT-64 reproduces designers’ vector 2' },
    survivesWith: { kind: 'unit', grep: 'GIFT-64 reproduces designers’ vector 1' },
  },
  {
    id: 6,
    title: "SKINNY's state loaded column-wise instead of row-wise",
    why:
      'ePrint 2016/660 §2: "the state is loaded row-wise rather than in the column-wise fashion ' +
      'we have come to expect from the AES". The transposed load costs nothing in ' +
      'self-consistency and every published vector.',
    file: 'src/ciphers/skinny.ts',
    anchor:
      '  // Returned row-major, which is what the paper specifies and what the AES\n' +
      '  // habit gets wrong. Transposing here instead is mutation (6) in the ledger:\n' +
      '  // the cipher stays perfectly self-consistent and matches no published vector.\n' +
      '  return cells;',
    replacement:
      '  // MUTATION (6): column-wise load.\n' +
      '  return cells.map((_, i) => cells[(i % 4) * 4 + Math.floor(i / 4)]);',
    owner: { kind: 'unit', grep: 'SKINNY-64-64 reproduces' },
  },
  {
    id: 7,
    title: "SKINNY's tweakey updated BEFORE it is XORed in",
    why:
      'ePrint 2016/660 §2 applies AddRoundTweakey and then updates the arrays. Updating first ' +
      'shifts every round key by one round.',
    file: 'src/ciphers/skinny.ts',
    anchor:
      '    addRoundTweakey(st, tk); // XOR in FIRST ...\n' +
      '    updateTweakey(tk, p.s); // ... then update',
    replacement:
      '    updateTweakey(tk, p.s); // MUTATION (7): update BEFORE the XOR\n' +
      '    addRoundTweakey(st, tk);',
    owner: { kind: 'unit', grep: 'SKINNY-64-64 reproduces' },
  },
  {
    id: 8,
    title: "PRINCE's SR applied as a scatter instead of a gather",
    why:
      'ePrint 2012/529 §3.3 prints SR as a mapping whose direction the prose leaves implicit. ' +
      'Read as a scatter it is the inverse permutation, which is a different cipher.',
    file: 'src/ciphers/prince.ts',
    anchor:
      '    const nib = (x >> BigInt(60 - 4 * perm[i])) & 0xfn;\n' +
      '    out |= nib << BigInt(60 - 4 * i);',
    replacement:
      '    const nib = (x >> BigInt(60 - 4 * i)) & 0xfn;\n' +
      '    out |= nib << BigInt(60 - 4 * perm[i]);',
    owner: { kind: 'unit', grep: 'reproduces Appendix A vector 1' },
  },
  {
    id: 9,
    title: "PRINCE's reflection decryption without adding alpha to the core key",
    why:
      'ePrint 2012/529 §2: D_(k0||k0′||k1) = E_(k0′||k0||k1 XOR alpha). Swapping the ' +
      'whitening keys without adding alpha is the shape of the property with the constant that ' +
      'makes it true removed.',
    file: 'src/ciphers/prince.ts',
    anchor: '  toBytes(k1 ^ alpha).forEach((b, i) => (swapped[8 + i] = b));',
    replacement: '  toBytes(k1 ^ (alpha & 0n)).forEach((b, i) => (swapped[8 + i] = b));',
    owner: { kind: 'unit', grep: 'reflection decryption equals the step-by-step inverse' },
  },
  {
    id: 10,
    title: 'Rotational survival counted on one output word instead of both',
    why:
      'A pair survives only if BOTH output words are rotationally related. At ONE round the two ' +
      'checks are provably equivalent (the second word is the first XOR a rotation-invariant ' +
      'term), which is why a single-round test cannot see this; from three rounds on they come ' +
      'apart by about 15%.',
    file: 'src/analysis/rotational.ts',
    anchor: '      if (bx === rot16(ax, r) && by === rot16(ay, r)) survivors++;',
    replacement: '      if (bx === rot16(ax, r)) survivors++;',
    owner: { kind: 'unit', grep: 'at three rounds, checking one output word' },
    survivesWith: { kind: 'unit', grep: 'at one round, checking one output word' },
  },
  {
    id: 11,
    title: 'A cipher reported as "vectors pass" from a stored value instead of a live comparison',
    why:
      'Invariant 1 says a cipher is offered only if every published vector reproduces, and it is ' +
      'enforced by RUNNING them at load. Replacing the comparison with the expected value makes ' +
      'the check vacuous — and invisible, because every cipher that ships here is correct. Only ' +
      'a deliberately broken module can tell the difference, which is what the owning test ' +
      'injects.',
    file: 'src/ciphers/index.ts',
    anchor:
      '      const got = toHex(v.encrypt(pt, key));\n' +
      '      if (got !== t.cipherHex) {',
    replacement:
      '      const got = v.encrypt(pt, key) ? t.cipherHex : t.cipherHex; // MUTATION (11)\n' +
      '      if (got !== t.cipherHex) {',
    owner: { kind: 'unit', grep: 'withholds a cipher whose encryption is wrong' },
  },
  {
    id: 12,
    title: 'SPECK key words reversed (round-key order, not printed order)',
    why:
      'The mirror of mutation (1). SPECK’s schedule takes the key in the order the paper ' +
      'PRINTS it — (l[m-2], ..., l[0], k[0]) — where SIMON’s wants it reversed. Applying ' +
      'SIMON’s convention to SPECK is the same class of error in the other direction.',
    file: 'src/ciphers/speck.ts',
    anchor: '  const rk = speckKeySchedule(bytesToWords(key, p.n), p);\n  let [x, y] = bytesToWords(block, p.n);\n  for (let r = 0; r < p.rounds; r++) [x, y] = speckRound(x, y, rk[r], p);',
    replacement: '  const rk = speckKeySchedule(bytesToWords(key, p.n).reverse(), p);\n  let [x, y] = bytesToWords(block, p.n);\n  for (let r = 0; r < p.rounds; r++) [x, y] = speckRound(x, y, rk[r], p);',
    owner: { kind: 'unit', grep: 'SPECK 32/64 reproduces' },
  },
  {
    id: 13,
    title: 'The negative claim’s second clause deleted (§4.1d bite 1)',
    why:
      '§4.1d requires the negative-claim test to bite: delete the text naming the limitation and ' +
      'assertion 3 must fail. What is left still says the round function has the property, which ' +
      'is the half that flatters the page.',
    file: 'src/analysis/rotational.ts',
    anchor:
      'export const NEGATIVE_CLAIM =\n' +
      "  'Rotational pairs pass through SPECK\u2019s round function with high probability. ' +\n" +
      "  'That says nothing about SPECK as specified: with its real key schedule the same ' +\n" +
      "  'pairs do not survive two rounds.';",
    replacement:
      'export const NEGATIVE_CLAIM =\n' +
      "  'Rotational pairs pass through SPECK\u2019s round function with high probability.';",
    owner: { kind: 'claims', grep: 'the round function has the property AND the real cipher does not' },
  },
  {
    id: 14,
    title: 'The real-schedule column fed rotated round keys by mistake (§4.1d bite 2)',
    why:
      '§4.1d requires that breaking a check inside the fixture fails assertion 2. Feeding the ' +
      'real-schedule column rotated round keys makes survivors appear past two rounds, so the ' +
      'verdict loses its second clause and the negative claim stops rendering — the page would ' +
      'then be claiming the limitation without the evidence for it.',
    file: 'src/analysis/rotational.ts',
    anchor: "        [bx, by] = round32(bx, by, mode === 'real-schedule' ? k : rot16(k, r));",
    replacement: '        [bx, by] = round32(bx, by, rot16(k, r)); // MUTATION (14)',
    owner: { kind: 'claims', grep: 'the round function has the property AND the real cipher does not' },
  },
  {
    id: 15,
    title: 'The control-boundary token degraded below WCAG 1.4.11\u2019s 3:1',
    why:
      'A gate is only worth what a mutation proves. This restores --border-strong to #3a554d, ' +
      'the value this lab actually shipped until the gate measured it at 2.14:1 against --panel, ' +
      'and requires the a11y run to fail NAMING the non-text contrast finding. Without this, the ' +
      'contrast oracle could be dead and every run would still be green.',
    file: 'src/styles.css',
    anchor: '  --border-strong: #5e897e;',
    replacement: '  --border-strong: #3a554d;',
    owner: { kind: 'a11y', grep: 'no WCAG A/AA violations in dark theme$' },
    mustName: /control-boundary|non-text contrast/,
  },
  {
    id: 16,
    title: 'The global border-box removed, reintroducing the 380px reflow failure',
    why:
      'The other half of the same argument: the reflow oracle is the only check for WCAG 1.4.10, ' +
      'because axe has no rule for it at all. Removing border-box returns .cl-hero-why to a ' +
      '384px box inside a 348px container, and the phone-width run must fail naming the ' +
      'horizontal scroll.',
    file: 'src/styles.css',
    anchor: '*,\n*::before,\n*::after {\n  box-sizing: border-box;\n}',
    replacement: '*,\n*::before,\n*::after {\n  box-sizing: content-box;\n}',
    owner: { kind: 'a11y', grep: 'no WCAG A/AA violations in dark theme at 380px' },
    mustName: /must not scroll horizontally/,
  },
];

// ── plumbing ────────────────────────────────────────────────────────────────

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

function read(file) {
  return readFileSync(join(ROOT, file), 'utf8');
}

function write(file, text) {
  writeFileSync(join(ROOT, file), text);
}

/** The hash of every emitted JS/CSS asset, so "did it reach the browser" is a fact. */
function bundleHash() {
  const dir = join(ROOT, 'dist', 'assets');
  const names = readdirSync(dir).sort();
  const h = createHash('sha256');
  for (const n of names) {
    h.update(n);
    h.update(readFileSync(join(dir, n)));
  }
  return h.digest('hex').slice(0, 16);
}

function run(cmd, args, env = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, out: stdout };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}\n${e.stderr ?? ''}` };
  }
}

function build() {
  return run('npm', ['run', 'build']);
}

/**
 * Run one owning test.
 *
 * The e2e runs force `CI=1`. That is rule 2c: without it
 * `reuseExistingServer: !process.env.CI` lets a preview server already
 * listening on the port answer the whole run, and it would be serving
 * UNMUTATED code — which reads as "the mutation was not caught" and sends
 * someone to fix a check that works.
 */
function runOwner(owner) {
  if (owner.kind === 'unit') {
    return run('npx', ['vitest', 'run', '-t', owner.grep]);
  }
  return run('npx', ['playwright', 'test', `--project=${owner.kind}`, '--retries=0', '-g', owner.grep], {
    CI: '1',
  });
}

/** A red run that is actually a broken harness, not a caught mutation. */
function looksLikeInfrastructureFailure(out) {
  return (
    /Process from config\.webServer was not able to start/.test(out) ||
    /ERR_CONNECTION_REFUSED/.test(out) ||
    /No tests found/.test(out) ||
    /Cannot find module/.test(out) ||
    /EADDRINUSE/.test(out)
  );
}

/** Did the run execute any test at all? A step that runs zero tests exits 0. */
function countRan(out) {
  const vitest = out.match(/Tests\s+(?:(\d+) failed \| )?(\d+) passed/);
  if (vitest) return Number(vitest[1] ?? 0) + Number(vitest[2]);
  const pw = out.match(/(\d+) (?:passed|failed)/g);
  if (pw) return pw.reduce((n, m) => n + Number(m.match(/\d+/)[0]), 0);
  return 0;
}

// ── the run ─────────────────────────────────────────────────────────────────

const only = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const selected = only.length ? MUTATIONS.filter((m) => only.includes(m.id)) : MUTATIONS;

console.log(`\nMutation run — ${selected.length} of ${MUTATIONS.length} mutations\n`);

// Anchors are validated for ALL mutations even when only some are selected, so
// a stale anchor cannot hide behind a partial run.
let anchorsOk = true;
for (const m of MUTATIONS) {
  const src = read(m.file);
  const n = src.split(m.anchor).length - 1;
  if (n !== 1) {
    console.log(`  ANCHOR BROKEN  (${m.id}) ${m.file}: anchor occurs ${n} times, must occur exactly once`);
    anchorsOk = false;
  }
}
if (!anchorsOk) {
  console.log('\nFAILED: an anchor no longer matches its source exactly once.\n');
  process.exit(1);
}
console.log(`  anchors: all ${MUTATIONS.length} occur exactly once\n`);

// Rule 2c's denominator: the unmutated bundle.
const baselineBuild = build();
if (!baselineBuild.ok) {
  console.log('FAILED: the unmutated tree does not build.\n' + baselineBuild.out);
  process.exit(1);
}
const baselineBundle = bundleHash();
console.log(`  baseline bundle: ${baselineBundle}\n`);

const records = [];
for (const m of selected) {
  const label = `(${m.id}) ${m.title}`;
  console.log(`── ${label}`);

  // Rule 2a: the owning test must PASS unmutated, in this same run.
  const pre = runOwner(m.owner);
  const preRan = countRan(pre.out);
  if (!pre.ok || preRan === 0) {
    records.push({
      ...summary(m),
      verdict: 'OWNER DID NOT PASS UNMUTATED',
      ran: preRan,
      detail: pre.out.slice(-2000),
    });
    console.log(`   OWNER DID NOT PASS UNMUTATED (${preRan} tests ran) — not a kill\n`);
    continue;
  }
  console.log(`   owner passed unmutated (${preRan} test${preRan === 1 ? '' : 's'})`);

  const original = read(m.file);
  const beforeHash = sha(original);
  const patched = original.replace(m.anchor, m.replacement);

  // Rule 2b: the patch actually changed the file.
  const afterHash = sha(patched);
  if (afterHash === beforeHash) {
    records.push({ ...summary(m), verdict: 'PATCH CHANGED NOTHING' });
    console.log('   PATCH CHANGED NOTHING — not a kill\n');
    continue;
  }

  write(m.file, patched);
  try {
    // Rule 2d: a patch that does not compile is never a kill.
    const built = build();
    if (!built.ok) {
      records.push({
        ...summary(m),
        verdict: 'DOES NOT BUILD',
        fileHashBefore: beforeHash,
        fileHashAfter: afterHash,
        detail: built.out.slice(-2000),
      });
      console.log('   DOES NOT BUILD — not a kill\n');
      continue;
    }

    // Rule 2c: the run served the mutated code.
    const mutatedBundle = bundleHash();
    if (mutatedBundle === baselineBundle) {
      records.push({
        ...summary(m),
        verdict: 'BUNDLE DID NOT MOVE',
        fileHashBefore: beforeHash,
        fileHashAfter: afterHash,
        bundleBaseline: baselineBundle,
        bundleMutated: mutatedBundle,
      });
      console.log('   BUNDLE DID NOT MOVE — the mutation never reached the browser; not a kill\n');
      continue;
    }

    const post = runOwner(m.owner);
    const postRan = countRan(post.out);
    if (post.ok) {
      records.push({
        ...summary(m),
        verdict: 'SURVIVED',
        fileHashBefore: beforeHash,
        fileHashAfter: afterHash,
        bundleBaseline: baselineBundle,
        bundleMutated: mutatedBundle,
        ran: postRan,
      });
      console.log('   SURVIVED — the owning test still passes; this is a finding, not an excuse\n');
      continue;
    }
    if (looksLikeInfrastructureFailure(post.out)) {
      records.push({
        ...summary(m),
        verdict: 'RED RUN WAS INFRASTRUCTURE, NOT A KILL',
        detail: post.out.slice(-2000),
      });
      console.log('   RED RUN WAS INFRASTRUCTURE — not a kill\n');
      continue;
    }
    // "Confirm the gate fails NAMING the finding." A red run that fails for an
    // unrelated reason is not evidence that the oracle looked.
    if (m.mustName && !m.mustName.test(post.out)) {
      records.push({
        ...summary(m),
        verdict: 'FAILED WITHOUT NAMING THE FINDING',
        mustName: String(m.mustName),
        detail: post.out.slice(-4000),
      });
      console.log(`   FAILED, but the output never named ${m.mustName} — not a kill\n`);
      continue;
    }

    // A blind test that must stay green under the same mutation.
    let blind = null;
    if (m.survivesWith) {
      const b = runOwner(m.survivesWith);
      const bRan = countRan(b.out);
      blind = { grep: m.survivesWith.grep, passed: b.ok, ran: bRan };
      if (!b.ok || bRan === 0) {
        records.push({
          ...summary(m),
          verdict: 'KILLED, BUT THE BLIND TEST DID NOT STAY GREEN',
          blind,
          detail: b.out.slice(-2000),
        });
        console.log(`   KILLED, but "${m.survivesWith.grep}" did not stay green as documented\n`);
        continue;
      }
      console.log(`   blind test stayed green: "${m.survivesWith.grep}" (${bRan} ran)`);
    }

    records.push({
      ...summary(m),
      verdict: 'KILLED',
      fileHashBefore: beforeHash,
      fileHashAfter: afterHash,
      bundleBaseline: baselineBundle,
      bundleMutated: mutatedBundle,
      ownerRanUnmutated: preRan,
      ownerRanMutated: postRan,
      blind,
      named: m.mustName
        ? (post.out.match(m.mustName) ?? ['(no match)'])[0]
        : undefined,
    });
    console.log(`   KILLED by "${m.owner.grep}"\n`);
  } finally {
    // Restore immediately, and prove the restore landed.
    write(m.file, original);
    const restored = sha(read(m.file));
    if (restored !== beforeHash) {
      console.log(`   RESTORE FAILED for ${m.file} — the tree is dirty, stop and check it`);
      process.exit(1);
    }
  }
}

function summary(m) {
  return {
    id: m.id,
    title: m.title,
    why: m.why,
    file: m.file,
    anchor: m.anchor,
    replacement: m.replacement,
    owner: m.owner,
  };
}

// Restore the baseline bundle so the tree is left as it was found.
build();
const finalBundle = bundleHash();
if (finalBundle !== baselineBundle) {
  console.log(`\nFAILED: the rebuilt bundle ${finalBundle} does not match the baseline ${baselineBundle}.`);
  process.exit(1);
}

mkdirSync(join(ROOT, 'audits'), { recursive: true });
writeFileSync(
  LEDGER,
  JSON.stringify(
    {
      note:
        'Written by scripts/mutations.mjs. Every observed field here was produced by the run ' +
        'that performed the mutation; none of it is typed by hand. Re-run the script to ' +
        'reproduce it.',
      ranAt: new Date().toISOString(),
      baselineBundle,
      records,
    },
    null,
    2,
  ) + '\n',
);

const killed = records.filter((r) => r.verdict === 'KILLED');
const notKilled = records.filter((r) => r.verdict !== 'KILLED');

console.log('── ledger ──────────────────────────────────────────────────────');
for (const r of records) console.log(`  ${String(r.id).padStart(2)}  ${r.verdict.padEnd(38)} ${r.title}`);
console.log(`\n  ${killed.length} killed, ${notKilled.length} not killed`);
console.log(`  ledger written to audits/mutation-ledger.json`);
console.log(`  bundle restored to ${finalBundle}\n`);

if (notKilled.length > 0) {
  console.log('FAILED: a mutation was not killed. That is reported, never explained away.\n');
  process.exit(1);
}
console.log('All mutations killed.\n');
