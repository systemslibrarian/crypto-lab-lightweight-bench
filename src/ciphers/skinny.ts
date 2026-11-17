/**
 * SKINNY — Beierle, Jean, Kölbl, Leander, Moradi, Peyrin, Sasaki, Sasdrich, Sim,
 * "The SKINNY Family of Block Ciphers and its Low-Latency Variant MANTIS",
 * IACR ePrint 2016/660, section 2.
 *
 * SKINNY is the tweakable one: its key input is a TWEAKEY, and the user decides
 * how much of it is key and how much is tweak. Six versions ship here: block 64
 * with tweakey 64/128/192, and block 128 with tweakey 128/256/384.
 *
 * Four conventions decide whether an implementation matches, and the first is
 * the one that catches AES readers:
 *
 *  1. The state is loaded ROW BY ROW, not column by column. The paper says so
 *     in as many words — "note that the state is loaded row-wise rather than in
 *     the column-wise fashion we have come to expect from the AES". Loading it
 *     column-wise is mutation (6); it costs nothing in self-consistency and
 *     every published vector.
 *  2. The tweakey is XORed in BEFORE it is updated. ART comes fifth in the
 *     paper's prose and the update is described after it. Updating first is
 *     mutation (7).
 *  3. Both cell permutations are GATHER maps: the paper writes IS_i <- IS_{P[i]}
 *     and TK1_i <- TK1_{PT[i]}, so the new cell i takes the OLD cell at P[i].
 *  4. ShiftRows rotates rows to the RIGHT, not left as in the AES.
 *
 * One note on reading the paper from extracted text: the bit-level description
 * of S4 loses an overline in machine extraction, so it reads `x0 XOR (x3 OR x2)`
 * when the figure shows a NOR. With OR, S4[0] computes to 0 rather than 0xc.
 * This implementation uses the printed TABLES (Table 2 and Appendix A), which
 * carry no such ambiguity.
 */

import type { CipherVariant, RoundStep, TestVector } from './types';
import { SKINNY_VECTORS } from '../vectors/skinny';
import { roundConstants } from './gift';

/** Table 2: the 4-bit S-box used when s = 4. */
export const S4 = [0xc, 0x6, 0x9, 0x0, 0x1, 0xa, 0x2, 0xb, 0x3, 0x8, 0x5, 0xd, 0x4, 0xe, 0x7, 0xf] as const;

/** Appendix A: the 8-bit S-box used when s = 8, as printed. */
const S8_HEX =
  '654c6a424b63436b55755a7a53735b7b358c3a818933803b9525982a9023992b' +
  'e5cce8c1c9e0c0e9d5f5d8f8d0f0d9f9a51ca8121ba013a905b50ab803b00bb9' +
  '32883c858d34843d91229c2c94249d2d624a6c454d64446d52725c7c54745d7d' +
  'a11aac151da414ad02b10cbc04b40dbde1c8ecc5cde4c4edd1f1dcfcd4f4ddfd' +
  '368e38828b30833996269a2893209b29664e6841496040695676587850705979' +
  'a61eaa1119a310ab06b608ba00b309bbe6ceeac2cbe3c3ebd6f6dafad3f3dbfb' +
  '318a3e868f37873f92219e2e97279f2f61486e464f67476f51715e7e57775f7f' +
  'a218ae161fa717af01b20ebe07b70fbfe2caeec6cfe7c7efd2f2defed7f7dfff';

export const S8: readonly number[] = (() => {
  const t: number[] = [];
  for (let i = 0; i < 256; i++) t.push(parseInt(S8_HEX.slice(i * 2, i * 2 + 2), 16));
  return t;
})();

/** Invert a bijective table rather than transcribing a second printed one. */
function invert(t: readonly number[]): number[] {
  const inv = new Array<number>(t.length);
  for (let x = 0; x < t.length; x++) inv[t[x]] = x;
  return inv;
}

export const S4_INV = invert(S4);
export const S8_INV = invert(S8);

/** ShiftRows: IS_i <- IS_{P[i]}. Rows 1, 2, 3 rotate RIGHT by 1, 2, 3. */
export const SR_P = [0, 1, 2, 3, 7, 4, 5, 6, 10, 11, 8, 9, 13, 14, 15, 12] as const;

/** The tweakey cell permutation: TK_i <- TK_{PT[i]}. */
export const TK_PT = [9, 15, 8, 13, 10, 14, 12, 11, 0, 1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Table 3's tweakey LFSRs, as forward maps on one cell.
 *
 * TK1 gets no LFSR. The inverses are obtained by inverting the tables, so a
 * hand-derived inverse cannot drift from its forward map.
 */
function lfsrTable(bits: 4 | 8, which: 2 | 3): number[] {
  const size = 1 << bits;
  const top = bits - 1;
  const out: number[] = [];
  for (let v = 0; v < size; v++) {
    const bit = (i: number) => (v >> i) & 1;
    let r: number;
    if (which === 2) {
      // s=4: (x3..x0) -> (x2||x1||x0||x3^x2);  s=8: -> (x6..x0||x7^x5)
      const fed = bits === 4 ? bit(3) ^ bit(2) : bit(7) ^ bit(5);
      r = ((v << 1) & (size - 1)) | fed;
    } else {
      // s=4: (x3..x0) -> (x0^x3||x3||x2||x1);  s=8: -> (x0^x6||x7..x1)
      const fed = bits === 4 ? bit(0) ^ bit(3) : bit(0) ^ bit(6);
      r = (v >> 1) | (fed << top);
    }
    out.push(r);
  }
  return out;
}

const LFSR = {
  4: { 2: lfsrTable(4, 2), 3: lfsrTable(4, 3) },
  8: { 2: lfsrTable(8, 2), 3: lfsrTable(8, 3) },
} as const;

const LFSR_INV = {
  4: { 2: invert(LFSR[4][2]), 3: invert(LFSR[4][3]) },
  8: { 2: invert(LFSR[8][2]), 3: invert(LFSR[8][3]) },
} as const;

export interface SkinnyParams {
  readonly blockBits: 64 | 128;
  readonly tweakeyBits: number;
  readonly s: 4 | 8;
  readonly z: 1 | 2 | 3;
  readonly rounds: number;
}

/** Table 1. */
export const SKINNY_PARAMS: readonly SkinnyParams[] = [
  { blockBits: 64, tweakeyBits: 64, s: 4, z: 1, rounds: 32 },
  { blockBits: 64, tweakeyBits: 128, s: 4, z: 2, rounds: 36 },
  { blockBits: 64, tweakeyBits: 192, s: 4, z: 3, rounds: 40 },
  { blockBits: 128, tweakeyBits: 128, s: 8, z: 1, rounds: 40 },
  { blockBits: 128, tweakeyBits: 256, s: 8, z: 2, rounds: 48 },
  { blockBits: 128, tweakeyBits: 384, s: 8, z: 3, rounds: 56 },
];

/** 16 cells, ROW-MAJOR: cell index i sits at row floor(i/4), column i mod 4. */
export function bytesToCells(bytes: Uint8Array, s: 4 | 8): number[] {
  const cells: number[] = [];
  if (s === 8) for (const b of bytes) cells.push(b);
  else for (const b of bytes) cells.push(b >> 4, b & 0xf);
  // Returned row-major, which is what the paper specifies and what the AES
  // habit gets wrong. Transposing here instead is mutation (6) in the ledger:
  // the cipher stays perfectly self-consistent and matches no published vector.
  return cells;
}

export function cellsToBytes(cells: readonly number[], s: 4 | 8): Uint8Array {
  if (s === 8) return new Uint8Array(cells);
  const out = new Uint8Array(cells.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = (cells[i * 2] << 4) | cells[i * 2 + 1];
  return out;
}

function subCells(st: number[], s: 4 | 8): void {
  const t = s === 4 ? S4 : S8;
  for (let i = 0; i < 16; i++) st[i] = t[st[i]];
}

function subCellsInv(st: number[], s: 4 | 8): void {
  const t = s === 4 ? S4_INV : S8_INV;
  for (let i = 0; i < 16; i++) st[i] = t[st[i]];
}

/** AddConstants: c0 at cell 0, c1 at cell 4, c2 = 0x2 at cell 8. */
function addConstants(st: number[], rc: number): void {
  st[0] ^= rc & 0xf;
  st[4] ^= (rc >> 4) & 0x3;
  st[8] ^= 0x2;
}

/** The first two rows of every tweakey array, XORed in. */
function addRoundTweakey(st: number[], tk: readonly number[][]): void {
  for (const arr of tk) for (let i = 0; i < 8; i++) st[i] ^= arr[i];
}

function updateTweakey(tk: number[][], s: 4 | 8): void {
  for (let a = 0; a < tk.length; a++) {
    const old = tk[a];
    const next = new Array<number>(16);
    for (let i = 0; i < 16; i++) next[i] = old[TK_PT[i]];
    if (a >= 1) {
      const t = LFSR[s][a === 1 ? 2 : 3];
      for (let i = 0; i < 8; i++) next[i] = t[next[i]];
    }
    tk[a] = next;
  }
}

function unupdateTweakey(tk: number[][], s: 4 | 8): void {
  for (let a = 0; a < tk.length; a++) {
    const cur = tk[a].slice();
    if (a >= 1) {
      const t = LFSR_INV[s][a === 1 ? 2 : 3];
      for (let i = 0; i < 8; i++) cur[i] = t[cur[i]];
    }
    const prev = new Array<number>(16);
    for (let i = 0; i < 16; i++) prev[TK_PT[i]] = cur[i];
    tk[a] = prev;
  }
}

function shiftRows(st: number[]): number[] {
  const out = new Array<number>(16);
  for (let i = 0; i < 16; i++) out[i] = st[SR_P[i]];
  return out;
}

function shiftRowsInv(st: number[]): number[] {
  const out = new Array<number>(16);
  for (let i = 0; i < 16; i++) out[SR_P[i]] = st[i];
  return out;
}

/** M = [[1,0,1,1],[1,0,0,0],[0,1,1,0],[1,0,1,0]] on each column. */
function mixColumns(st: number[]): void {
  for (let c = 0; c < 4; c++) {
    const a = st[c];
    const b = st[c + 4];
    const d = st[c + 8];
    const e = st[c + 12];
    st[c] = a ^ d ^ e;
    st[c + 4] = a;
    st[c + 8] = b ^ d;
    st[c + 12] = a ^ d;
  }
}

function mixColumnsInv(st: number[]): void {
  for (let c = 0; c < 4; c++) {
    const d0 = st[c];
    const d1 = st[c + 4];
    const d2 = st[c + 8];
    const d3 = st[c + 12];
    st[c] = d1;
    st[c + 4] = d1 ^ d2 ^ d3;
    st[c + 8] = d1 ^ d3;
    st[c + 12] = d0 ^ d3;
  }
}

function loadTweakey(tweakey: Uint8Array, p: SkinnyParams): number[][] {
  const cells = bytesToCells(tweakey, p.s);
  if (cells.length !== 16 * p.z) {
    throw new Error(`SKINNY-${p.blockBits}-${p.tweakeyBits} needs a ${p.tweakeyBits}-bit tweakey`);
  }
  const tk: number[][] = [];
  for (let a = 0; a < p.z; a++) tk.push(cells.slice(a * 16, a * 16 + 16));
  return tk;
}

export function skinnyEncrypt(block: Uint8Array, tweakey: Uint8Array, p: SkinnyParams): Uint8Array {
  const rcs = roundConstants(p.rounds);
  let st = bytesToCells(block, p.s);
  if (st.length !== 16) throw new Error(`SKINNY-${p.blockBits} needs a ${p.blockBits}-bit block`);
  const tk = loadTweakey(tweakey, p);
  for (let r = 0; r < p.rounds; r++) {
    subCells(st, p.s);
    addConstants(st, rcs[r]);
    addRoundTweakey(st, tk); // XOR in FIRST ...
    updateTweakey(tk, p.s); // ... then update
    st = shiftRows(st);
    mixColumns(st);
  }
  return cellsToBytes(st, p.s);
}

export function skinnyDecrypt(block: Uint8Array, tweakey: Uint8Array, p: SkinnyParams): Uint8Array {
  const rcs = roundConstants(p.rounds);
  let st = bytesToCells(block, p.s);
  const tk = loadTweakey(tweakey, p);
  for (let r = 0; r < p.rounds; r++) updateTweakey(tk, p.s);
  for (let r = p.rounds - 1; r >= 0; r--) {
    mixColumnsInv(st);
    st = shiftRowsInv(st);
    unupdateTweakey(tk, p.s);
    addRoundTweakey(st, tk);
    addConstants(st, rcs[r]);
    subCellsInv(st, p.s);
  }
  return cellsToBytes(st, p.s);
}

const hexCells = (st: readonly number[], s: 4 | 8) =>
  st.map((c) => c.toString(16).padStart(s / 4, '0'));

function skinnyTrace(block: Uint8Array, tweakey: Uint8Array, p: SkinnyParams): RoundStep[] {
  const rc = roundConstants(1)[0];
  let st = bytesToCells(block, p.s);
  const tk = loadTweakey(tweakey, p);
  const steps: RoundStep[] = [
    {
      op: 'input',
      note: `16 cells of ${p.s} bits, loaded ROW BY ROW (not column-wise as in the AES)`,
      state: hexCells(st, p.s),
    },
  ];
  subCells(st, p.s);
  steps.push({ op: 'SubCells', note: `the ${p.s}-bit S-box on every cell`, state: hexCells(st, p.s) });
  addConstants(st, rc);
  steps.push({
    op: 'AddConstants',
    note: `6-bit LFSR constant 0x${rc.toString(16).padStart(2, '0')} into column 0, plus a fixed 0x2`,
    state: hexCells(st, p.s),
  });
  addRoundTweakey(st, tk);
  steps.push({
    op: 'AddRoundTweakey',
    note: `rows 0 and 1 only, from TK1${p.z > 1 ? ' XOR TK2' : ''}${p.z > 2 ? ' XOR TK3' : ''} — before the tweakey updates`,
    state: hexCells(st, p.s),
  });
  st = shiftRows(st);
  steps.push({ op: 'ShiftRows', note: 'rows 1, 2, 3 rotate RIGHT by 1, 2, 3 (a gather map)', state: hexCells(st, p.s) });
  mixColumns(st);
  steps.push({ op: 'MixColumns', note: 'a binary matrix, no field multiplication at all', state: hexCells(st, p.s) });
  return steps;
}

function variantFor(p: SkinnyParams, vectors: readonly TestVector[]): CipherVariant {
  const label = `SKINNY-${p.blockBits}-${p.tweakeyBits}`;
  return {
    id: `skinny-${p.blockBits}-${p.tweakeyBits}`,
    family: 'SKINNY',
    label,
    blockBits: p.blockBits,
    keyBits: p.tweakeyBits,
    rounds: p.rounds,
    layout: { kind: 'cells', rows: 4, cols: 4, bits: p.s, order: 'row-major' },
    encrypt: (b, k) => skinnyEncrypt(b, k, p),
    decrypt: (b, k) => skinnyDecrypt(b, k, p),
    traceRound: (b, k) => skinnyTrace(b, k, p),
    vectors: vectors.filter((v) => v.label === label),
  };
}

export const SKINNY_VARIANTS: readonly CipherVariant[] = SKINNY_PARAMS.map((p) =>
  variantFor(p, SKINNY_VECTORS),
);

export function skinnyParamsFor(blockBits: number, tweakeyBits: number): SkinnyParams {
  const p = SKINNY_PARAMS.find((q) => q.blockBits === blockBits && q.tweakeyBits === tweakeyBits);
  if (!p) throw new Error(`no SKINNY version with block ${blockBits} and tweakey ${tweakeyBits}`);
  return p;
}
