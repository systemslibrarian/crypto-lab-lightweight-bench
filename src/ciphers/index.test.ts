import { describe, expect, it } from 'vitest';
import {
  ALL_VARIANTS,
  FAMILY_FACTS,
  PAPER_FIGURES,
  PASSING_VECTORS,
  SELF_CHECKS,
  TOTAL_VECTORS,
  VARIANTS,
  WITHHELD,
  selfCheck,
  variantById,
} from './index';
import type { CipherVariant } from './types';
import { PRINCE_VARIANT } from './prince';

describe('the registry', () => {
  it('offers 29 versions carrying 37 published vectors', () => {
    // 10 SIMON + 10 SPECK + 2 GIFT + 6 SKINNY + 1 PRINCE.
    expect(ALL_VARIANTS).toHaveLength(29);
    // 10 + 10 + 6 + 6 + 5.
    expect(TOTAL_VECTORS).toBe(37);
  });

  it('withholds nothing, because every published vector reproduces', () => {
    expect(WITHHELD.map((c) => `${c.variant.label}: ${c.failure}`)).toEqual([]);
    expect(VARIANTS).toHaveLength(ALL_VARIANTS.length);
    expect(PASSING_VECTORS).toBe(TOTAL_VECTORS);
  });

  it('runs every vector in the self-check, encryption and decryption both', () => {
    for (const c of SELF_CHECKS) {
      expect(c.ok, `${c.variant.label}: ${c.failure}`).toBe(true);
      expect(c.passed).toBe(c.total);
      expect(c.total).toBeGreaterThan(0);
    }
  });

  it('has a FamilyFacts entry and figures for every family it offers', () => {
    const families = new Set(VARIANTS.map((v) => v.family));
    expect(new Set(FAMILY_FACTS.map((f) => f.family))).toEqual(families);
    // Every family named on the bench appears in at least one published table.
    const inTables = new Set(
      PAPER_FIGURES.flatMap((t) => t.rows.filter((r) => r.onBench).map((r) => r.name.split(/[ -]/)[0])),
    );
    for (const f of families) expect(inTables.has(f), `${f} must appear in a figure table`).toBe(true);
  });
});

/**
 * INVARIANT 1, as a named test: a deliberately broken cipher module disappears
 * from the UI's choices.
 *
 * This is the one test that owns mutation (11) in the ledger — replacing the
 * live comparison in `selfCheck` with a stored flag. Everything else about this
 * page would look identical under that mutation, because every cipher that
 * ships here is correct; only a deliberately broken one can tell the
 * difference.
 */
describe('invariant 1: a broken cipher is withheld', () => {
  /** A real variant with one byte of its output corrupted. */
  function broken(from: CipherVariant, how: 'encrypt' | 'decrypt'): CipherVariant {
    return {
      ...from,
      id: `${from.id}-broken-${how}`,
      label: `${from.label} (deliberately broken ${how})`,
      encrypt: how === 'encrypt' ? (b, k) => flip(from.encrypt(b, k)) : from.encrypt,
      decrypt: how === 'decrypt' ? (b, k) => flip(from.decrypt(b, k)) : from.decrypt,
    };
  }
  const flip = (out: Uint8Array): Uint8Array => {
    const copy = out.slice();
    copy[0] ^= 1;
    return copy;
  };

  it('withholds a cipher whose encryption is wrong, and says what it computed', () => {
    const check = selfCheck(broken(PRINCE_VARIANT, 'encrypt'));
    expect(check.ok).toBe(false);
    expect(check.failure).toMatch(/encryption gave [0-9a-f]+, the source prints [0-9a-f]+/);
    expect(check.passed).toBeLessThan(check.total);
  });

  it('withholds a cipher that encrypts correctly and cannot invert itself', () => {
    const check = selfCheck(broken(PRINCE_VARIANT, 'decrypt'));
    expect(check.ok).toBe(false);
    expect(check.failure).toMatch(/decryption gave [0-9a-f]+, the source prints [0-9a-f]+/);
  });

  it('withholds a cipher with no recorded vectors at all', () => {
    const check = selfCheck({ ...PRINCE_VARIANT, id: 'empty', vectors: [] });
    expect(check.ok).toBe(false);
    expect(check.failure).toMatch(/no designers/);
  });

  it('withholds a cipher whose vector lengths do not match its declared sizes', () => {
    const check = selfCheck({
      ...PRINCE_VARIANT,
      id: 'mislabelled',
      blockBits: 128, // PRINCE's vectors are 64-bit blocks
    });
    expect(check.ok).toBe(false);
    expect(check.failure).toMatch(/hex digits/);
  });

  it('a withheld cipher is not reachable through the registry lookup', () => {
    expect(variantById('prince-64-128-broken-encrypt')).toBeUndefined();
    // And every id the registry DOES return really passed its self-check.
    for (const v of VARIANTS) {
      expect(variantById(v.id)).toBe(v);
      expect(selfCheck(v).ok).toBe(true);
    }
  });
});
