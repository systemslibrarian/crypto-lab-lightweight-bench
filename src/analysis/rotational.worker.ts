/**
 * The rotational worker.
 *
 * Exhibit 5's three jobs all run here rather than on the main thread, because
 * the exhaustive ones are billions of iterations and would freeze the page:
 *
 *   'one'    — every (x, y) pair at 16 bits: 2^32 iterations, about 8 seconds.
 *   'chain'  — every tuple at 8 bits for 1, 2 and 3 chained additions. The
 *              three-addition case is also 2^32 tuples, but the chain condition
 *              prunes, so it finishes in seconds.
 *   'speck'  — sampled, with the sample size reported alongside every figure.
 *
 * Randomness is `crypto.getRandomValues`, drawn in large blocks rather than per
 * sample: at 2^22 samples a call per sample is the dominant cost, and a pool
 * refilled 64 words at a time is the same randomness with none of that.
 */

import {
  type ExhaustiveResult,
  type KeyMode,
  type SpeckRotationalPoint,
  exhaustiveChain,
  exhaustiveOneAddition,
  sampleSpeckRotational,
} from './rotational';

export type WorkerRequest =
  | { kind: 'one'; n: 8 | 12 | 16; r: number }
  | { kind: 'chain'; r: number }
  | { kind: 'speck'; maxRounds: number; samples: number; r: number };

export type WorkerResponse =
  | { kind: 'progress'; label: string; fraction: number }
  | { kind: 'one'; result: ExhaustiveResult }
  | { kind: 'chain'; results: ExhaustiveResult[] }
  | { kind: 'speck'; points: SpeckRotationalPoint[]; samples: number }
  | { kind: 'error'; message: string };

/** A pooled `crypto.getRandomValues`, refilled in 16,384-word blocks. */
function makeRng(): (out: Uint16Array) => void {
  const POOL = 16384;
  const pool = new Uint16Array(POOL);
  let next = POOL;
  return (out) => {
    if (next + out.length > POOL) {
      crypto.getRandomValues(pool);
      next = 0;
    }
    for (let i = 0; i < out.length; i++) out[i] = pool[next + i];
    next += out.length;
  };
}

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.kind === 'one') {
      const result = exhaustiveOneAddition(req.n, req.r, (done, total) =>
        post({ kind: 'progress', label: `counting all 2^${2 * req.n} pairs`, fraction: done / total }),
      );
      post({ kind: 'one', result });
      return;
    }

    if (req.kind === 'chain') {
      const results: ExhaustiveResult[] = [];
      for (const additions of [1, 2, 3] as const) {
        results.push(
          exhaustiveChain(8, req.r, additions, (done, total) =>
            post({
              kind: 'progress',
              label: `counting all 8-bit tuples for ${additions} chained addition${additions === 1 ? '' : 's'}`,
              fraction: (additions - 1) / 3 + done / total / 3,
            }),
          ),
        );
      }
      post({ kind: 'chain', results });
      return;
    }

    const rng = makeRng();
    const points: SpeckRotationalPoint[] = [];
    const modes: KeyMode[] = ['rotated-round-keys', 'real-schedule'];
    const jobs = modes.length * req.maxRounds;
    let done = 0;
    for (const mode of modes) {
      for (let rounds = 1; rounds <= req.maxRounds; rounds++) {
        points.push(
          sampleSpeckRotational(rounds, req.samples, mode, req.r, rng, (d, t) =>
            post({
              kind: 'progress',
              label: `${mode === 'real-schedule' ? 'real key schedule' : 'rotated round keys'}, ${rounds} round${rounds === 1 ? '' : 's'}`,
              fraction: (done + d / t) / jobs,
            }),
          ),
        );
        done++;
      }
    }
    post({ kind: 'speck', points, samples: req.samples });
  } catch (e) {
    post({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
