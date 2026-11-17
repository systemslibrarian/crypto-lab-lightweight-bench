/**
 * The shape every cipher on this bench presents to the UI.
 *
 * Five families sit behind this interface and nothing in `src/ui/` knows which
 * one it is holding. That is the point: exhibit 1 drives any variant, exhibit 2
 * traces any variant's first round, and exhibit 3 tabulates any variant's
 * published figures, so adding a sixth family is a new module plus a registry
 * entry rather than a change to six panels.
 */

/** Which of the three lightweight goals a design's own paper says it chose. */
export type DesignGoal = 'area' | 'code-size' | 'latency';

/** A single labelled step inside one round, for the side-by-side tracer. */
export interface RoundStep {
  /** The operation's name as its own paper spells it: 'SubCells', 'S^-8', ... */
  readonly op: string;
  /** One short line on what the operation does. */
  readonly note: string;
  /** The state after this step, as the cipher's natural unit (words or cells). */
  readonly state: readonly string[];
}

/** A designers' test vector, carrying the source that printed it. */
export interface TestVector {
  readonly label: string;
  readonly keyHex: string;
  readonly plainHex: string;
  readonly cipherHex: string;
  /** SKINNY only: the tweakey beyond TK1 is tweak material in exhibit 6. */
  readonly tweakHex?: string;
  /** Where this vector was read from, named precisely enough to re-check. */
  readonly source: string;
}

/**
 * How a cipher's state is laid out on screen, so the grid can label its own
 * axes honestly. SKINNY's `row-major` is the one that catches people out and is
 * therefore spelled on the page rather than assumed.
 */
export type StateLayout =
  | { readonly kind: 'words'; readonly count: number; readonly bits: number }
  | { readonly kind: 'cells'; readonly rows: 4; readonly cols: 4; readonly bits: number; readonly order: 'row-major' }
  | { readonly kind: 'nibbles'; readonly count: number };

export interface CipherVariant {
  /** Stable id used in the DOM and in test fixtures: 'simon-64-128'. */
  readonly id: string;
  /** 'SIMON', 'SPECK', 'GIFT', 'SKINNY', 'PRINCE'. */
  readonly family: string;
  /** Human label: 'SIMON 64/128', 'SKINNY-128-384'. */
  readonly label: string;
  readonly blockBits: number;
  readonly keyBits: number;
  readonly rounds: number;
  readonly layout: StateLayout;

  encrypt(block: Uint8Array, key: Uint8Array): Uint8Array;
  decrypt(block: Uint8Array, key: Uint8Array): Uint8Array;
  /** The first round, step by step, on the given block and key. */
  traceRound(block: Uint8Array, key: Uint8Array): RoundStep[];

  readonly vectors: readonly TestVector[];
}

/**
 * A family's shared facts: what the paper says it optimised for, and where in
 * the paper each figure came from. Exhibit 3 renders these with their sources
 * and never computes a performance number of its own.
 */
export interface FamilyFacts {
  readonly family: string;
  readonly paper: string;
  readonly eprint: string;
  readonly authors: string;
  readonly goal: DesignGoal;
  /** The designers' own words for the target, quoted or closely paraphrased. */
  readonly statedTarget: string;
  /** Where in the paper `statedTarget` and the figures come from. */
  readonly figureSource: string;
  readonly structure: string;
}

// [extension] point — a sixth family (MANTIS, PRINCEv2, Midori, ...) is a module
// exporting CipherVariant[] plus a FamilyFacts, registered in `./index.ts`.
// NOT BUILT HERE: this bench ships exactly the five families the brief names.

// [extension] point — an `Analysis` seam for automated differential or
// rotational trail SEARCH would sit beside `src/analysis/rotational.ts` with the
// same worker protocol (`AnalysisRequest` -> progress -> `AnalysisResult`).
// NOT BUILT HERE: exhibit 5 counts the rotational property of a given rotation,
// it does not search for trails.
export interface Analysis<Req, Res> {
  readonly id: string;
  run(request: Req, onProgress: (fraction: number) => void): Promise<Res>;
}
