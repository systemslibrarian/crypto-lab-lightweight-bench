/**
 * The bench registry — and where invariant 1 is enforced.
 *
 * INVARIANT 1: a cipher is offered in the UI only if every one of its
 * designers' vectors passes.
 *
 * That is enforced here by RUNNING the vectors, in the browser, at module load,
 * and filtering the list the UI builds its menus from. It is deliberately not a
 * boolean recorded by a human or copied out of a test report: a cipher whose
 * module is broken has to vanish from the page's choices without anyone
 * remembering to update a flag. Mutation (11) in the ledger replaces this with
 * a stored flag, and the claims suite catches it because the withheld-count on
 * the page stops moving when a cipher breaks.
 *
 * The check includes DECRYPTION of each vector, so a module that encrypts
 * correctly and cannot invert itself is also withheld.
 */

import type { CipherVariant, FamilyFacts } from './types';
import { parseHex, toHex } from './hex';
import { SIMON_VARIANTS } from './simon';
import { SPECK_VARIANTS } from './speck';
import { GIFT_VARIANTS } from './gift';
import { SKINNY_VARIANTS } from './skinny';
import { PRINCE_VARIANTS } from './prince';

/** Every variant this bench implements, before the self-check. */
export const ALL_VARIANTS: readonly CipherVariant[] = [
  ...SIMON_VARIANTS,
  ...SPECK_VARIANTS,
  ...GIFT_VARIANTS,
  ...SKINNY_VARIANTS,
  ...PRINCE_VARIANTS,
];

export interface SelfCheck {
  readonly variant: CipherVariant;
  readonly passed: number;
  readonly total: number;
  readonly ok: boolean;
  readonly failure?: string;
}

/** Run every vector of one variant, encryption and decryption both. */
export function selfCheck(v: CipherVariant): SelfCheck {
  let passed = 0;
  const total = v.vectors.length;
  if (total === 0) {
    return { variant: v, passed: 0, total: 0, ok: false, failure: 'no designers’ vectors are recorded' };
  }
  for (const t of v.vectors) {
    try {
      const key = parseHex(t.keyHex, v.keyBits, 'key');
      const pt = parseHex(t.plainHex, v.blockBits, 'plaintext');
      const ct = parseHex(t.cipherHex, v.blockBits, 'ciphertext');
      const got = toHex(v.encrypt(pt, key));
      if (got !== t.cipherHex) {
        return {
          variant: v,
          passed,
          total,
          ok: false,
          failure: `encryption gave ${got}, the source prints ${t.cipherHex}`,
        };
      }
      const back = toHex(v.decrypt(ct, key));
      if (back !== t.plainHex) {
        return {
          variant: v,
          passed,
          total,
          ok: false,
          failure: `decryption gave ${back}, the source prints ${t.plainHex}`,
        };
      }
      passed++;
    } catch (e) {
      return { variant: v, passed, total, ok: false, failure: e instanceof Error ? e.message : String(e) };
    }
  }
  return { variant: v, passed, total, ok: true };
}

export const SELF_CHECKS: readonly SelfCheck[] = ALL_VARIANTS.map(selfCheck);

/** The variants the UI may offer. */
export const VARIANTS: readonly CipherVariant[] = SELF_CHECKS.filter((c) => c.ok).map((c) => c.variant);

/** The variants withheld, and why — shown on the page rather than hidden. */
export const WITHHELD: readonly SelfCheck[] = SELF_CHECKS.filter((c) => !c.ok);

export const TOTAL_VECTORS = ALL_VARIANTS.reduce((n, v) => n + v.vectors.length, 0);
export const PASSING_VECTORS = SELF_CHECKS.reduce((n, c) => n + (c.ok ? c.total : 0), 0);

export function variantById(id: string): CipherVariant | undefined {
  return VARIANTS.find((v) => v.id === id);
}

export function families(): string[] {
  const seen: string[] = [];
  for (const v of VARIANTS) if (!seen.includes(v.family)) seen.push(v.family);
  return seen;
}

export function variantsOf(family: string): CipherVariant[] {
  return VARIANTS.filter((v) => v.family === family);
}

/**
 * Exhibit 3's table, built from the design papers.
 *
 * Every figure here is the PAPERS' figure, cited to the section or table that
 * prints it. This page measures no area, no code size and no latency — a
 * browser cannot — and says so wherever these are rendered.
 */
export const FAMILY_FACTS: readonly FamilyFacts[] = [
  {
    family: 'SIMON',
    paper: 'The SIMON and SPECK Families of Lightweight Block Ciphers',
    eprint: 'https://eprint.iacr.org/2013/404',
    authors: 'Beaulieu, Shors, Smith, Treatman-Clark, Weeks, Wingers',
    goal: 'area',
    statedTarget:
      '“Simon is tuned for optimal performance in hardware” — the round function is one AND, three rotations and two XORs, chosen to be small and easy to serialise.',
    figureSource: 'ePrint 2013/404, Abstract and §3.1; parameters from Table 3.1',
    structure: 'Feistel; AND-rotate-XOR',
  },
  {
    family: 'SPECK',
    paper: 'The SIMON and SPECK Families of Lightweight Block Ciphers',
    eprint: 'https://eprint.iacr.org/2013/404',
    authors: 'Beaulieu, Shors, Smith, Treatman-Clark, Weeks, Wingers',
    goal: 'code-size',
    statedTarget:
      '“Simon is tuned for optimal performance in hardware, and Speck for optimal performance in software” — one modular addition, two rotations and two XORs per round, all operations a microcontroller already has.',
    figureSource: 'ePrint 2013/404, Abstract and §4.1; parameters from Table 4.1',
    structure: 'Feistel-like; add-rotate-XOR (ARX)',
  },
  {
    family: 'GIFT',
    paper: 'GIFT: A Small Present — Towards Reaching the Limit of Lightweight Encryption',
    eprint: 'https://eprint.iacr.org/2017/622',
    authors: 'Banik, Pandey, Peyrin, Sasaki, Sim, Todo',
    goal: 'area',
    statedTarget:
      '“we argue that GIFT is probably very close to reaching the area limit of lightweight encryption” — the bit permutation is wires, and the key schedule is a rotation.',
    figureSource: 'ePrint 2017/622, §1 (Outline) and §2; round counts from §2',
    structure: 'SPN; 4-bit S-box then a bit permutation',
  },
  {
    family: 'SKINNY',
    paper: 'The SKINNY Family of Block Ciphers and its Low-Latency Variant MANTIS',
    eprint: 'https://eprint.iacr.org/2016/660',
    authors: 'Beierle, Jean, Kölbl, Leander, Moradi, Peyrin, Sasaki, Sasdrich, Sim',
    goal: 'area',
    statedTarget:
      '“whose goal is to compete with NSA recent design SIMON in terms of hardware/software performances, while proving in addition much stronger security guarantees” — and it is TWEAKABLE, which the others are not.',
    figureSource: 'ePrint 2016/660, Abstract and §2; round counts from Table 1',
    structure: 'SPN, tweakable (TWEAKEY); binary MixColumns, no field multiplication',
  },
  {
    family: 'PRINCE',
    paper: 'PRINCE — A Low-latency Block Cipher for Pervasive Computing Applications',
    eprint: 'https://eprint.iacr.org/2012/529',
    authors:
      'Borghoff, Canteaut, Güneysu, Kavun, Knežević, Knudsen, Leander, Nikov, Paar, Rechberger, Rombouts, Thomsen, Yalçın',
    goal: 'latency',
    statedTarget:
      '“optimized with respect to latency when implemented in hardware… allows encryption of data within one clock cycle” — 12 rounds, meant to be fully unrolled.',
    figureSource: 'ePrint 2012/529, Abstract and §2; round constants from §2',
    structure: 'SPN, FX construction; reflective (alpha-reflection)',
  },
];

export const GOAL_LABELS: Readonly<Record<FamilyFacts['goal'], string>> = {
  area: 'Small circuit (hardware area)',
  'code-size': 'Small program (code size)',
  latency: 'Short delay (latency)',
};

/**
 * Exhibit 3's figure tables, each a comparison table from one design paper.
 *
 * These are THE PAPERS' NUMBERS, not this page's. A browser cannot measure
 * gate equivalents, propagation delay or flash footprint, and this page does
 * not try.
 *
 * Grouping matters as much as the numbers. Figures are only comparable within a
 * group, because each group is one paper synthesising every cipher in it
 * against ONE standard cell library. Lifting PRINCE's 8,260 GE next to GIFT's
 * 1,345 GE and calling PRINCE six times larger would be wrong twice over:
 * different library, and one figure is a fully unrolled circuit while the other
 * is a round-based one. The page says so above the tables.
 */
export interface PaperFigureTable {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly eprint: string;
  readonly note: string;
  readonly columns: readonly string[];
  readonly rows: readonly {
    readonly name: string;
    readonly cells: readonly string[];
    /** True when the row is one of this bench's five families. */
    readonly onBench: boolean;
  }[];
}

export const PAPER_FIGURES: readonly PaperFigureTable[] = [
  {
    id: 'simonspeck',
    title: 'SIMON and SPECK, hardware against software',
    source: 'ePrint 2013/404, Table 1.1 (p. 3), the 64/128 and 128/128 rows',
    eprint: 'https://eprint.iacr.org/2013/404',
    note:
      'The designers’ own table. Hardware is an ASIC at 100 kHz; software is an 8-bit microcontroller at 16 MHz. The AES row is block 128 / key 128 — the table has no AES at block 64 — so read it as scale, not as a like-for-like row. SIMON wins on area, SPECK on code size: that is the whole of the hardware-versus-software split, in two numbers.',
    columns: ['Area (GE)', 'Flash (bytes)', 'Software throughput (kbps)'],
    rows: [
      { name: 'SIMON 64/128', cells: ['1000', '282', '515'], onBench: true },
      { name: 'SPECK 64/128', cells: ['1127', '186', '855'], onBench: true },
      { name: 'AES-128 (block 128)', cells: ['2400', '943', '445'], onBench: false },
    ],
  },
  {
    id: 'gift',
    title: 'Round-based circuits, all in one cell library',
    source: 'ePrint 2017/622, Table 13 (§5.1), STM 90nm standard cell library',
    eprint: 'https://eprint.iacr.org/2017/622',
    note:
      'The GIFT designers synthesised every cipher in this table themselves, against the same STM 90nm library, so these rows ARE comparable with each other. Three of the five families on this bench appear in it. Note what the AES row costs and buys: five times the area of GIFT, and a third of the cycles.',
    columns: ['Area (GE)', 'Delay (ns)', 'Cycles'],
    rows: [
      { name: 'GIFT-64-128', cells: ['1345', '1.83', '29'], onBench: true },
      { name: 'SIMON 64/128', cells: ['1458', '1.83', '45'], onBench: true },
      { name: 'SKINNY-64-128', cells: ['1477', '1.84', '37'], onBench: true },
      { name: 'PRESENT 64/128', cells: ['1560', '1.63', '33'], onBench: false },
      { name: 'GIFT-128-128', cells: ['1997', '1.85', '41'], onBench: true },
      { name: 'AES 128', cells: ['7215', '3.83', '11'], onBench: false },
    ],
  },
  {
    id: 'prince',
    title: 'Fully UNROLLED circuits — the latency argument',
    source: 'ePrint 2012/529, Table 1 (§5), Nangate 45nm, constraint column 1000',
    eprint: 'https://eprint.iacr.org/2012/529',
    note:
      'A different paper and a different cell library, so do NOT compare these numbers with the table above. What matters is the ratio inside this table: unrolling a cipher so a block finishes in one clock cycle costs PRINCE about 8k gates, where the same treatment costs PRESENT-80 64k and AES-128 135k. That is what designing for latency buys, and it is why PRINCE has only 12 rounds. PRINCE’s area barely moves across the three synthesis constraints (8260–8263 GE).',
    columns: ['Area (GE)', 'Power (mW)'],
    rows: [
      { name: 'PRINCE', cells: ['8260', '38.5'], onBench: true },
      { name: 'PRESENT-80', cells: ['63942', '1304.6'], onBench: false },
      { name: 'AES-128', cells: ['135051', '3265.8'], onBench: false },
    ],
  },
];
