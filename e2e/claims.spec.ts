import { expect, test, type Page } from '@playwright/test';
import { boot } from './gate';

/**
 * The claims suite: what this page SAYS, as opposed to what it is shaped like.
 * §4.1b and §4.1d of `_MASTER-TEMPLATE.md`.
 *
 * These assertions are deliberately NOT in `boot()` in gate.ts, the shared
 * setup every a11y test imports. There, a one-word copy edit fails every test
 * in the accessibility gate at once and the step that goes red is named
 * "Accessibility gate" — a report naming the wrong subject.
 * crypto-lab-mceliece-gate lost three days of corrected security claims to
 * exactly that on 2026-09-26. Here, a failure says "claims", which is what
 * actually changed.
 *
 * THE RULE THAT MAKES THESE WORTH ANYTHING: compare two values the page itself
 * printed, or re-derive the claim by a DIFFERENT ROUTE than the source takes —
 * never by recomputing the same expression the source uses, which will happily
 * agree with a bug. Internal consistency alone is not enough either: a page can
 * be consistently wrong. So this file mixes three kinds of check.
 *
 *   CROSS-CHECKS — two surfaces that must agree: the rendered `computed`
 *     ciphertext against the rendered `expected`; the summary count against the
 *     rows it counts; the chart's plotted geometry against the table's numbers.
 *
 *   INDEPENDENT FIXTURES AND RE-DERIVATIONS — `PUBLISHED` below is transcribed
 *     from the five source documents independently of `src/vectors/`, so a
 *     corrupted fixture is caught even though the page would report it
 *     consistently. Lemma 1 is recomputed here from n and r; the Hamming
 *     distance in exhibit 6 is recomputed from the two rendered ciphertexts by
 *     a BigInt popcount rather than the source's byte loop; the exhaustive
 *     count is checked against the figure the brief and the arithmetic both
 *     give.
 *
 *   PARTS-SUM-TO-WHOLE — the survival fraction shown must equal survivors over
 *     samples as rendered, for every point.
 */

/**
 * Published vectors, transcribed HERE from the sources, independently of
 * `src/vectors/*.ts`.
 *
 * This is the point of the duplication: if `src/vectors/simon.ts` were
 * mistyped, the page would compute a ciphertext, compare it against its own
 * wrong fixture, disagree, and honestly report a mismatch — but a test that
 * only checked "the page agrees with itself" would also catch that. What a
 * second independent copy catches is the other direction: a fixture and an
 * implementation that are wrong TOGETHER, which is what copying a vector out of
 * one's own output produces.
 */
const PUBLISHED = {
  // ePrint 2013/404, Appendix B (p. 41) and Appendix C (p. 42).
  'simon-32-64': { key: '1918111009080100', pt: '65656877', ct: 'c69be9bb' },
  'speck-32-64': { key: '1918111009080100', pt: '6574694c', ct: 'a86842f2' },
  // github.com/giftcipher/gift @ f43c6b3e, GIFT64_test_vector_2.txt.
  'gift-64': { key: 'fedcba9876543210fedcba9876543210', pt: 'fedcba9876543210', ct: 'c1b71f66160ff587' },
  // ePrint 2016/660, Appendix B.1 (p. 46).
  'skinny-64-64': { key: 'f5269826fc681238', pt: '06034f957724d19d', ct: 'bb39dfb2429b8ac7' },
  // ePrint 2012/529, Appendix A, last row.
  'prince-64-128': { key: '0000000000000000fedcba9876543210', pt: '0123456789abcdef', ct: 'ae25ad3ca8fa9ccf' },
} as const;

/** Lemma 1, recomputed here rather than imported from the source. */
function lemma1(n: number, r: number): number {
  return (1 + 2 ** (r - n) + 2 ** -r + 2 ** -n) / 4;
}

/** Hamming distance by a different route than `src/ui/tweak.ts` takes. */
function hammingFromHex(a: string, b: string): number {
  let x = BigInt('0x' + a) ^ BigInt('0x' + b);
  let bits = 0;
  while (x > 0n) {
    bits += Number(x & 1n);
    x >>= 1n;
  }
  return bits;
}

async function openPanel(page: Page, tab: RegExp, panel: string): Promise<void> {
  await page.getByRole('tab', { name: tab }).click();
  await expect(page.locator(panel)).toBeVisible();
}

/** Drive exhibit 1 to a chosen family/size and check its vectors. */
async function checkVectorsFor(page: Page, family: string, variantId: string): Promise<void> {
  await page.selectOption('#bench-family', family);
  await page.selectOption('#bench-size', variantId);
  await page.getByRole('button', { name: /Check the designers/ }).click();
  await expect(page.locator('#bench-vectors [data-verdict="bench-vector-summary"]')).toBeVisible();
}

test.describe('exhibit 1 — the designers’ vectors', () => {
  test('each vector verdict is backed by the expected/computed pair rendered beside it', async ({
    page,
  }) => {
    await boot(page, 'dark');
    for (const [variantId, want] of Object.entries(PUBLISHED)) {
      const family = variantId.startsWith('simon')
        ? 'SIMON'
        : variantId.startsWith('speck')
          ? 'SPECK'
          : variantId.startsWith('gift')
            ? 'GIFT'
            : variantId.startsWith('skinny')
              ? 'SKINNY'
              : 'PRINCE';
      await checkVectorsFor(page, family, variantId);

      // Find the row holding the independently transcribed plaintext, and make
      // the page's own three values agree with each other AND with the source.
      const row = page.locator(
        `#bench-vectors [data-vector][data-plaintext="${want.pt}"][data-key="${want.key}"]`,
      );
      await expect(row, `${variantId} must render the published vector`).toHaveCount(1);
      const expected = await row.getAttribute('data-expected');
      const computed = await row.getAttribute('data-computed');
      const decrypted = await row.getAttribute('data-decrypted');

      // Cross-check: the page's two values agree.
      expect(computed, `${variantId}: computed must equal expected`).toBe(expected);
      // Independent fixture: and they are the SOURCE's value, not merely each
      // other's.
      expect(expected, `${variantId}: expected must be the published ciphertext`).toBe(want.ct);
      // Decrypting the published ciphertext returns the published plaintext.
      expect(decrypted, `${variantId}: decryption must return the plaintext`).toBe(want.pt);
      await expect(row).toHaveAttribute('data-verdict', 'vector-match');

      // The rendered text says what the attributes say.
      await expect(row.locator('[data-verdict="vector-verdict-ok"]')).toContainText(
        'MATCHES THE PUBLISHED VECTOR',
      );
      await expect(row.locator('.kv')).toContainText(want.ct);
    }
  });

  test('the vector summary count equals the rows it counts', async ({ page }) => {
    await boot(page, 'dark');
    await checkVectorsFor(page, 'PRINCE', 'prince-64-128');
    const rows = await page.locator('#bench-vectors [data-vector]').count();
    const matched = await page.locator('#bench-vectors [data-verdict="vector-match"]').count();
    expect(rows).toBe(5); // PRINCE has five published vectors
    expect(matched).toBe(rows);
    await expect(page.locator('#bench-vectors [data-verdict="bench-vector-summary"]')).toContainText(
      `ALL ${rows} VECTORS REPRODUCED`,
    );
  });

  test('every vector row names the source it was read from', async ({ page }) => {
    await boot(page, 'dark');
    await checkVectorsFor(page, 'GIFT', 'gift-64');
    const notes = page.locator('#bench-vectors [data-vector] .source-note');
    await expect(notes).toHaveCount(3);
    // GIFT's paper prints no vectors at all, so the citation has to be the
    // designers' repository AT A COMMIT — a bare repo name would not be
    // re-checkable. The commit is the claim.
    for (let i = 0; i < 3; i++) {
      await expect(notes.nth(i)).toContainText('github.com/giftcipher/gift');
      await expect(notes.nth(i)).toContainText('f43c6b3e');
    }
  });

  test('decrypting the ciphertext on screen returns the plaintext on screen', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
    const holder = page.locator('#bench-output [data-claim="bench-ciphertext"]');
    const pt = await holder.getAttribute('data-plaintext');
    const ct = await holder.getAttribute('data-ciphertext');
    expect(pt).not.toBe(ct);
    // The rendered readout carries both values, not just the attributes.
    await expect(holder.locator('.kv')).toContainText(ct!);

    await page.getByRole('button', { name: /Decrypt the result/ }).click();
    const back = page.locator('#bench-output [data-claim="bench-decrypted"]');
    expect(await back.getAttribute('data-decrypted')).toBe(pt);
    await expect(page.locator('#bench-output [data-verdict="bench-roundtrip"]')).toContainText(
      'DECRYPTED BACK TO THE PLAINTEXT',
    );
  });

  test('the availability line reports invariant 1 from the live self-check', async ({ page }) => {
    await boot(page, 'dark');
    const line = page.locator('#panel-bench [data-verdict="bench-availability"]');
    // 29 variants: 10 SIMON + 10 SPECK + 2 GIFT + 6 SKINNY + 1 PRINCE.
    // 37 vectors: 10 + 10 + 6 + 6 + 5.
    await expect(line).toContainText('29 OF 29 VERSIONS OFFERED');
    await expect(line).toContainText('Every one of the 37 vectors');
    // The count on screen must equal the options actually offered, not a
    // hardcoded sentence: this is the cross-check that catches a stored flag.
    const offered = await page.locator('#bench-size option').count();
    const families = await page.locator('#bench-family option').count();
    expect(families).toBe(5);
    // Every family's sizes, summed, must be 29.
    let total = 0;
    for (const f of ['SIMON', 'SPECK', 'GIFT', 'SKINNY', 'PRINCE']) {
      await page.selectOption('#bench-family', f);
      total += await page.locator('#bench-size option').count();
    }
    expect(total, 'the menus must offer exactly the versions the line claims').toBe(29);
    expect(offered).toBeGreaterThan(0);
  });
});

test.describe('retirement, and the no-op guard', () => {
  test('changing the cipher retires a fresh verdict AND says it retired it', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
    await expect(page.locator('#bench-output [data-claim="bench-ciphertext"]')).toBeVisible();

    await page.selectOption('#bench-family', 'GIFT');
    // The stale verdict is GONE ...
    await expect(page.locator('#bench-output [data-claim="bench-ciphertext"]')).toHaveCount(0);
    // ... and the page SAYS it was retired, rather than silently blanking.
    await expect(page.locator('#bench-output [data-verdict="bench-retired"]')).toContainText(
      'VERDICT RETIRED',
    );
    await expect(page.locator('#bench-output [data-verdict="bench-retired"]')).toContainText('GIFT');
  });

  test('changing the size retires a fresh verdict', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
    await page.selectOption('#bench-size', 'simon-128-256');
    await expect(page.locator('#bench-output [data-verdict="bench-retired"]')).toContainText(
      'SIMON 128/256',
    );
    await expect(page.locator('#bench-output [data-claim="bench-ciphertext"]')).toHaveCount(0);
  });

  test('changing the key retires a fresh verdict', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
    await page.locator('#bench-key').fill('0000000000000000');
    await page.locator('#bench-key').blur();
    await expect(page.locator('#bench-output [data-verdict="bench-retired"]')).toContainText(
      'The key changed',
    );
  });

  test('THE NO-OP GUARD: re-selecting the same cipher must NOT retire a fresh verdict', async ({
    page,
  }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
    const ct = await page
      .locator('#bench-output [data-claim="bench-ciphertext"]')
      .getAttribute('data-ciphertext');

    // Re-select the value that is already selected.
    const current = await page.locator('#bench-family').inputValue();
    await page.selectOption('#bench-family', current);
    await expect(page.locator('#bench-output [data-verdict="bench-retired"]')).toHaveCount(0);
    expect(
      await page.locator('#bench-output [data-claim="bench-ciphertext"]').getAttribute('data-ciphertext'),
      'a no-op selection must leave the verdict standing',
    ).toBe(ct);

    // And typing into the key box then reverting it is also a no-op.
    const key = await page.locator('#bench-key').inputValue();
    await page.locator('#bench-key').fill('abcdef');
    await page.locator('#bench-key').fill(key);
    await page.locator('#bench-key').blur();
    await expect(page.locator('#bench-output [data-verdict="bench-retired"]')).toHaveCount(0);
  });

  test('loading a published vector retires a result for another block', async ({ page }) => {
    await boot(page, 'dark');
    await page.locator('#bench-random').click();
    await page.locator('#bench-encrypt').click();
    await page.locator('#bench-decrypt').click();
    await page.locator('#bench-decrypt').click();
    await expect(page.locator('[data-claim="bench-decrypted"]')).toHaveCount(1);
    await page.locator('#bench-check-vectors').click();
    await page.locator('#bench-load-vector').click();
    await expect(page.locator('[data-claim="bench-ciphertext"]')).toHaveCount(0);
    await expect(page.locator('[data-verdict="bench-retired"]')).toBeVisible();
    await page.locator('#bench-encrypt').click();
    await expect(page.locator('[data-claim="bench-ciphertext"]')).toBeVisible();
  });

  test('changing the rotation amount retires exhibit 5’s counts', async ({ page }) => {
    await boot(page, 'dark');
    await openPanel(page, /Rotational Pairs/, '#panel-rotational');
    await page.getByRole('button', { name: /Count all 2\^16 pairs/ }).click();
    await expect(page.locator('#rot-one-output [data-claim="rot-one"]')).toBeVisible();
    await page.selectOption('#rot-amount', '3');
    await expect(page.locator('#rot-one-output [data-claim="rot-one"]')).toHaveCount(0);
    await expect(page.locator('#rot-speck-output [data-verdict="rot-retired"]')).toContainText(
      'RESULTS RETIRED',
    );
  });
});

test.describe('exhibit 3 — every figure carries its source', () => {
  test('all three published figure tables name their paper, table and library', async ({ page }) => {
    await boot(page, 'dark');
    await openPanel(page, /Three Goals/, '#panel-goals');

    const tables = page.locator('#panel-goals [data-figure-table]');
    await expect(tables).toHaveCount(3);

    // Each table's caption IS its citation, and each is followed by a source
    // note carrying the same text — a cross-check between two surfaces.
    for (const id of ['simonspeck', 'gift', 'prince']) {
      const section = page.locator(`#panel-goals [data-figure-table="${id}"]`);
      const caption = await section.locator('table.data caption').innerText();
      expect(caption, `${id} caption must cite an ePrint number`).toMatch(/ePrint \d{4}\/\d{3}/);
      await expect(section.locator('.source-note')).toContainText(caption.trim());
    }

    // The two tables whose numbers could be mistaken for each other must each
    // name the cell library they were synthesised against, because that is the
    // only thing that makes them incomparable.
    await expect(page.locator('#panel-goals [data-figure-table="gift"]')).toContainText('STM 90nm');
    await expect(page.locator('#panel-goals [data-figure-table="prince"]')).toContainText('Nangate 45nm');

    // And every family quote names the section it came from.
    const quotes = page.locator('#panel-goals [data-goal-family]');
    await expect(quotes).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      await expect(quotes.nth(i).locator('[data-source]')).toHaveAttribute(
        'data-source',
        /ePrint \d{4}\/\d{3}/,
      );
    }
  });

  test('the panel says the figures are the papers’ and not its own', async ({ page }) => {
    await boot(page, 'dark');
    await openPanel(page, /Three Goals/, '#panel-goals');
    await expect(page.locator('#panel-goals [data-verdict="goals-attribution"]')).toContainText(
      'THESE ARE THE PAPERS’ NUMBERS, NOT THIS PAGE’S',
    );
    await expect(page.locator('#panel-goals [data-verdict="goals-attribution"]')).toContainText(
      'measures no hardware area, no latency and no code size',
    );
  });
});

test.describe('exhibit 4 — the reflection claim and its control', () => {
  test('the reflection verdict is backed by the two routes rendered beside it', async ({ page }) => {
    await boot(page, 'dark');
    await openPanel(page, /PRINCE Backwards/, '#panel-reflection');
    await page.getByRole('button', { name: /Encrypt, then decrypt both ways/ }).click();
    const holder = page.locator('#reflect-output [data-claim="reflect-single"]');
    const pt = await holder.getAttribute('data-plaintext');
    const byReflection = await holder.getAttribute('data-reflection');
    const byInverse = await holder.getAttribute('data-stepwise');
    expect(byReflection).toBe(pt);
    expect(byInverse).toBe(pt);
    await expect(page.locator('#reflect-output [data-verdict="reflect-verdict"]')).toContainText(
      'THE ENCRYPTION CIRCUIT DECRYPTED IT',
    );
  });

  test('the negative control agrees zero times, and says so', async ({ page }) => {
    await boot(page, 'dark');
    await openPanel(page, /PRINCE Backwards/, '#panel-reflection');
    await page.getByRole('button', { name: /Negative control/ }).click();
    const holder = page.locator('#reflect-output [data-claim="reflect-control"]');
    expect(await holder.getAttribute('data-agreed')).toBe('0');
    const trials = Number(await holder.getAttribute('data-trials'));
    expect(trials).toBeGreaterThanOrEqual(2000);
    // The rendered wording must quote the same two numbers the attributes hold.
    await expect(page.locator('#reflect-output [data-verdict="reflect-control-verdict"]')).toContainText(
      `0 OF ${trials.toLocaleString()} AGREED`,
    );
  });

  test('every round-constant pair on screen XORs to the alpha the page names', async ({ page }) => {
    await boot(page, 'dark');
    await openPanel(page, /PRINCE Backwards/, '#panel-reflection');
    await page.getByRole('button', { name: /Encrypt, then decrypt both ways/ }).click();
    const table = page.locator('#reflect-output table.state-grid, #reflect-output table.data').last();
    const caption = await table.locator('caption').innerText();
    const alphaMatch = caption.match(/alpha = ([0-9a-f]{16})/);
    expect(alphaMatch, 'the caption must name alpha').not.toBeNull();
    const alpha = BigInt('0x' + alphaMatch![1]);

    // INDEPENDENT RE-DERIVATION: XOR the two rendered constants here and
    // compare against the rendered XOR column AND against alpha.
    const rows = table.locator('tbody tr');
    const n = await rows.count();
    expect(n).toBe(6);
    for (let i = 0; i < n; i++) {
      const cells = rows.nth(i).locator('td');
      const a = BigInt('0x' + (await cells.nth(0).innerText()).trim());
      const b = BigInt('0x' + (await cells.nth(1).innerText()).trim());
      const shown = BigInt('0x' + (await cells.nth(2).innerText()).trim());
      expect(a ^ b, `row ${i}: the rendered XOR must be the XOR of the rendered constants`).toBe(shown);
      expect(shown, `row ${i}: and it must equal alpha`).toBe(alpha);
    }
  });
});

test.describe('exhibit 5 — the counted and sampled claims', () => {
  test('the exhaustive 8-bit count equals Lemma 1 recomputed here', async ({ page }) => {
    await boot(page, 'dark');
    await openPanel(page, /Rotational Pairs/, '#panel-rotational');
    await page.getByRole('button', { name: /Count all 2\^16 pairs/ }).click();
    const holder = page.locator('#rot-one-output [data-claim="rot-one"]');
    await expect(holder).toBeVisible();
    const n = Number(await holder.getAttribute('data-n'));
    const r = Number(await holder.getAttribute('data-r'));
    const survivors = Number(await holder.getAttribute('data-survivors'));
    const total = Number(await holder.getAttribute('data-total'));
    expect(total).toBe(2 ** (2 * n));
    // INDEPENDENT RE-DERIVATION of the headline claim from n and r alone.
    expect(survivors / total).toBeCloseTo(lemma1(n, r), 12);
    await expect(page.locator('#rot-one-output [data-verdict="rot-one-verdict"]')).toContainText(
      'THE EXHAUSTIVE COUNT EQUALS LEMMA 1 EXACTLY',
    );
    // And the rendered table quotes the same survivor count.
    await expect(holder.locator('table.data')).toContainText(survivors.toLocaleString());
  });

  test('the 16-bit exhaustive count is exactly 1,610,661,888 of 2^32', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page, 'dark');
    await openPanel(page, /Rotational Pairs/, '#panel-rotational');
    await page.getByRole('button', { name: /Count all 2\^32 pairs/ }).click();
    const holder = page.locator('#rot-one-output [data-claim="rot-one"]');
    await expect(holder).toBeVisible({ timeout: 240_000 });
    expect(await holder.getAttribute('data-survivors')).toBe('1610661888');
    expect(await holder.getAttribute('data-total')).toBe(String(2 ** 32));
    expect(await holder.getAttribute('data-exhaustive')).toBe('true');
    // The closed form: 2^30 + 2^29 + 2^15 + 2^14, which is what Lemma 1 at
    // n = 16, r = 1 multiplied by 2^32 comes to, exactly.
    expect(1610661888).toBe(2 ** 30 + 2 ** 29 + 2 ** 15 + 2 ** 14);
  });

  test('the chained counts show the folklore overestimating, and name the factor', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page, 'dark');
    await openPanel(page, /Rotational Pairs/, '#panel-rotational');
    await page.getByRole('button', { name: /Count every 8-bit tuple/ }).click();
    const holder = page.locator('#rot-chain-output [data-claim="rot-chain"]');
    await expect(holder).toBeVisible({ timeout: 240_000 });

    const factors = (await holder.getAttribute('data-factors'))!.split(',').map(Number);
    const survivors = (await holder.getAttribute('data-survivors'))!.split(',').map(Number);
    const totals = (await holder.getAttribute('data-totals'))!.split(',').map(Number);
    expect(factors).toHaveLength(3);

    // PARTS-SUM-TO-WHOLE / independent re-derivation: the overestimate factor
    // for k additions is Lemma 1 to the k-th power over the measured fraction,
    // recomputed here from the rendered survivor counts.
    for (let i = 0; i < 3; i++) {
      const additions = i + 1;
      const measured = survivors[i] / totals[i];
      expect(factors[i]).toBeCloseTo(lemma1(8, 1) ** additions / measured, 3);
    }
    // One addition is not chained, so there is nothing to overestimate.
    expect(factors[0]).toBeCloseTo(1, 6);
    // The brief's bands, which the source papers' Lemma 2 fixes exactly.
    expect(factors[1]).toBeGreaterThan(1.6);
    expect(factors[1]).toBeLessThan(1.75);
    expect(factors[2]).toBeGreaterThan(3.8);
    expect(factors[2]).toBeLessThan(4.1);

    await expect(page.locator('#rot-chain-output [data-verdict="rot-chain-verdict"]')).toContainText(
      'EVERY EXHAUSTIVE COUNT EQUALS LEMMA 2 EXACTLY',
    );
    // The rendered verdict quotes the factors it computed.
    await expect(page.locator('#rot-chain-output [data-verdict="rot-chain-verdict"]')).toContainText(
      factors[1].toFixed(2),
    );
  });

  test('the survival fraction shown equals survivors over samples, as rendered', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page, 'dark');
    await openPanel(page, /Rotational Pairs/, '#panel-rotational');
    await page.fill('#rot-samples', String(1 << 19));
    await page.getByRole('button', { name: /Sample both key models/ }).click();
    const holder = page.locator('#rot-speck-output [data-claim="rot-speck"]');
    await expect(holder).toBeVisible({ timeout: 240_000 });

    const samples = Number(await holder.getAttribute('data-samples'));
    const roundFn = (await holder.getAttribute('data-roundfn-survivors'))!.split(',').map(Number);
    const real = (await holder.getAttribute('data-real-survivors'))!.split(',').map(Number);
    expect(samples).toBe(1 << 19);
    expect(roundFn).toHaveLength(6);
    expect(real).toHaveLength(6);

    // Every fraction PRINTED in the table must be survivors / samples.
    const rows = holder.locator('table.data tbody tr');
    await expect(rows).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const cells = rows.nth(i).locator('td');
      const shownSurvivors = Number((await cells.nth(0).innerText()).replace(/,/g, ''));
      const shownFraction = Number(await cells.nth(1).innerText());
      expect(shownSurvivors, `row ${i} survivors`).toBe(roundFn[i]);
      // The page prints the fraction to six significant figures, so the exact
      // comparison is against the same rounding rather than against a looser
      // tolerance that would also accept a different number.
      expect(shownFraction, `row ${i} fraction = survivors / samples`).toBe(
        Number((roundFn[i] / samples).toPrecision(6)),
      );
      // The predicted column is Lemma 1 to the round count, recomputed here.
      const shownPredicted = Number(await cells.nth(2).innerText());
      expect(shownPredicted).toBe(Number((lemma1(16, 1) ** (i + 1)).toPrecision(6)));
    }
  });

  test('the chart plots the numbers the table prints', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page, 'dark');
    await openPanel(page, /Rotational Pairs/, '#panel-rotational');
    await page.fill('#rot-samples', String(1 << 19));
    await page.getByRole('button', { name: /Sample both key models/ }).click();
    const holder = page.locator('#rot-speck-output [data-claim="rot-speck"]');
    await expect(holder).toBeVisible({ timeout: 240_000 });
    const samples = Number(await holder.getAttribute('data-samples'));
    const roundFn = (await holder.getAttribute('data-roundfn-survivors'))!.split(',').map(Number);

    // INDEPENDENT RE-DERIVATION of the chart's geometry. The axis runs from
    // log2 = 0 at y = padT to log2 = yMin at y = H - padB, with H = 320,
    // padT = 18, padB = 44 and yMin = min(-24, floor(log2(1/samples)) - 2).
    const H = 320;
    const padT = 18;
    const padB = 44;
    const yMin = Math.min(-24, Math.floor(Math.log2(1 / samples)) - 2);
    const yOf = (l: number) => padT + (l / yMin) * (H - padT - padB);

    const circles = holder.locator('figure svg circle');
    // Six round-function markers, plus however many real-schedule points had
    // a non-zero count (zeroes are drawn as crosses on the floor instead).
    const count = await circles.count();
    expect(count).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < 6; i++) {
      const cy = Number(await circles.nth(i).getAttribute('cy'));
      const want = yOf(Math.log2(Math.max(roundFn[i], 1) / samples));
      expect(cy, `marker ${i} must sit where its survivor count puts it`).toBeCloseTo(want, 3);
    }

    // The chart has a table alternative, and an accessible name that is not
    // just "chart".
    await expect(holder.locator('figure svg')).toHaveAttribute('role', 'img');
    const label = await holder.locator('figure svg').getAttribute('aria-label');
    expect(label).toContain('log base 2');
    expect(label).toContain('table below this chart');
    await expect(holder.locator('table.data')).toBeVisible();
  });

  test('the sample cap is stated with both the request and the cap', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page, 'dark');
    await openPanel(page, /Rotational Pairs/, '#panel-rotational');
    await page.fill('#rot-samples', '999999999');
    await page.getByRole('button', { name: /Sample both key models/ }).click();
    const capped = page.locator('#rot-speck-output [data-verdict="rot-sample-capped"]');
    await expect(capped).toContainText('SAMPLE COUNT CAPPED');
    await expect(capped).toContainText('999,999,999');
    await expect(capped).toContainText((1 << 24).toLocaleString());
    // The control is corrected to the cap, so what is on screen is what ran.
    await expect(page.locator('#rot-samples')).toHaveValue(String(1 << 24));
  });

  test('a rotation of 0 is refused as not a rotation', async ({ page }) => {
    await boot(page, 'dark');
    await openPanel(page, /Rotational Pairs/, '#panel-rotational');
    // The select offers only real rotations, which is itself the claim: the
    // identity is not on the menu.
    const values = await page.locator('#rot-amount option').evaluateAll((os) =>
      os.map((o) => (o as HTMLOptionElement).value),
    );
    expect(values).not.toContain('0');
    expect(values).not.toContain('16');
    for (const v of values) {
      expect(Number(v)).toBeGreaterThan(0);
      expect(Number(v)).toBeLessThan(16);
    }
  });
});

test.describe('exhibit 6 — the tweak claim', () => {
  test('the ciphertext distance shown is the distance between the two ciphertexts shown', async ({
    page,
  }) => {
    await boot(page, 'dark');
    await openPanel(page, /SKINNY Tweak/, '#panel-tweak');
    await page.getByRole('button', { name: /differ from A by one bit/ }).click();
    const holder = page.locator('#tweak-output [data-claim="tweak-pair"]');
    await expect(holder).toBeVisible();

    const ca = (await holder.getAttribute('data-cipher-a'))!;
    const cb = (await holder.getAttribute('data-cipher-b'))!;
    const ta = (await holder.getAttribute('data-tweak-a'))!;
    const tb = (await holder.getAttribute('data-tweak-b'))!;
    const shownCipherDistance = Number(await holder.getAttribute('data-cipher-distance'));
    const shownTweakDistance = Number(await holder.getAttribute('data-tweak-distance'));
    const blockBits = Number(await holder.getAttribute('data-block-bits'));

    // INDEPENDENT RE-DERIVATION by BigInt popcount, not the source's byte loop.
    expect(shownTweakDistance).toBe(hammingFromHex(ta, tb));
    expect(shownTweakDistance).toBe(1);
    expect(shownCipherDistance).toBe(hammingFromHex(ca, cb));
    expect(ca).not.toBe(cb);

    // And the verdict quotes the number it computed.
    const verdict = page.locator('#tweak-output [data-verdict="tweak-verdict"]');
    await expect(verdict).toContainText('SAME KEY, SAME PLAINTEXT, DIFFERENT CIPHERTEXT');
    await expect(verdict).toContainText(`${shownCipherDistance} of ${blockBits} bits`);
  });

  test('an oversized tweak is refused with the available room stated', async ({ page }) => {
    await boot(page, 'dark');
    await openPanel(page, /SKINNY Tweak/, '#panel-tweak');
    await page.getByRole('button', { name: /tweak that is too long/ }).click();
    const refusal = page.locator('#tweak-output [data-verdict="tweak-overlong"]');
    await expect(refusal).toContainText('REFUSED');
    await expect(refusal).toContainText('leaves room for only 8 bytes (64 bits)');
  });
});

test.describe('scoping and honesty', () => {
  test('the page says it is not production crypto, and what it does not measure', async ({ page }) => {
    await boot(page, 'dark');
    const scope = page.locator('.scope-card');
    await expect(scope).toContainText('Not production crypto');
    await expect(scope).toContainText('is constant-time');
    await expect(scope).toContainText('Not a hardware measurement');
    await expect(scope).toContainText('Not an attack');
    await expect(scope).toContainText('MANTIS');
    await expect(scope).toContainText('PRINCEv2');
  });

  test('THE [hidden] PROBE: a hidden panel must really not paint', async ({ page }) => {
    await boot(page, 'dark');
    // The cascade trap: a class rule that sets `display` outranks the UA's
    // `[hidden] { display: none }`, so a panel can paint while the code
    // believes it is hidden. Asking the DOM is the only way to know.
    const leaking = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('[hidden]'))) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (cs.display !== 'none' || r.width > 0 || r.height > 0 || el.checkVisibility?.()) {
          out.push(`${el.tagName.toLowerCase()}#${el.id} display=${cs.display} ${r.width}x${r.height}`);
        }
      }
      return out;
    });
    expect(leaking, 'every [hidden] element must compute to display:none and paint nothing').toEqual(
      [],
    );
    // And there really are hidden panels to probe, so this cannot pass vacuously.
    await expect(page.locator('.panel[hidden]')).toHaveCount(5);
  });

  test('the scripture footer is present, verbatim and exactly once', async ({ page }) => {
    await boot(page, 'dark');
    await expect(page.locator('.scripture-footer')).toHaveCount(1);
    await expect(page.locator('.scripture-footer')).toContainText(
      'So whether you eat or drink or whatever you do, do it all for the glory of God. — 1 Corinthians 10:31',
    );
  });
});

/**
 * §4.1d — THE NEGATIVE CLAIM.
 *
 * The claim, scoped to the run on this page: rotational pairs pass through
 * SPECK's round function with high probability, and that says nothing about
 * SPECK as specified, because with its real key schedule the same pairs do not
 * survive two rounds.
 *
 * The evidence fixture is exhibit 5's run 3 after BOTH columns have run. Three
 * assertions, as §4.1d specifies:
 *
 *   1. Reach the fixture through the UI.
 *   2. Everything the page renders in that state reports success — asserted
 *      against the rendered verdicts, not a flag the test sets.
 *   3. The limitation is on screen IN THAT STATE, visible rather than behind a
 *      disclosure.
 *
 * It bites two ways, and both are mutations in `scripts/mutations.mjs`:
 * deleting the negative-claim sentence fails assertion 3, and feeding the
 * real-schedule column rotated round keys by mistake makes survivors appear,
 * which fails assertion 2 and removes the verdict's second clause.
 */
test.describe('the negative claim', () => {
  test('the round function has the property AND the real cipher does not', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page, 'dark');
    await openPanel(page, /Rotational Pairs/, '#panel-rotational');

    // ── 1. Reach the fixture ────────────────────────────────────────────────
    await page.fill('#rot-samples', String(1 << 20));
    await page.getByRole('button', { name: /Sample both key models/ }).click();
    const holder = page.locator('#rot-speck-output [data-claim="rot-speck"]');
    await expect(holder).toBeVisible({ timeout: 240_000 });

    const samples = Number(await holder.getAttribute('data-samples'));
    const roundFn = (await holder.getAttribute('data-roundfn-survivors'))!.split(',').map(Number);
    const real = (await holder.getAttribute('data-real-survivors'))!.split(',').map(Number);

    // ── 2. Everything the page renders in this state reports success ───────
    // The round-function column tracked the prediction: that is the POSITIVE
    // half, and it is read off the rendered verdict rather than asserted of a
    // flag.
    const verdict = page.locator('#rot-speck-output [data-verdict="rot-speck-verdict"]');
    await expect(verdict).toContainText('ROUND FUNCTION PRESERVES ROTATION');
    // No verdict anywhere in this panel reports a failure. If one did, the
    // fixture would be demonstrating the mechanism breaking rather than its
    // limit, and §4.1d would be unsatisfied.
    await expect(page.locator('#panel-rotational [data-verdict-kind="bad"]')).toHaveCount(0);
    // And the positive half is a real measurement: within 5% of Lemma 1 to the
    // round count, for the first three rounds, recomputed here.
    for (let i = 0; i < 3; i++) {
      const measured = roundFn[i] / samples;
      const want = lemma1(16, 1) ** (i + 1);
      expect(Math.abs(measured - want) / want, `round ${i + 1} must track the prediction`).toBeLessThan(
        0.05,
      );
    }

    // ── 3. The limitation is on screen IN THAT STATE ───────────────────────
    // The verdict itself reads as a result and a limit at once.
    await expect(verdict).toContainText('ROUND FUNCTION PRESERVES ROTATION — AND THE REAL CIPHER DOES NOT');
    // The real-schedule column really did find nothing past one round, which is
    // what makes the second clause true rather than merely printed.
    for (let r = 2; r <= 6; r++) {
      expect(real[r - 1], `the real schedule must leave no survivors at ${r} rounds`).toBe(0);
    }
    // The negative claim is visible, not behind a disclosure.
    const claim = page.locator('#rot-speck-output [data-claim="negative-claim"]');
    await expect(claim).toBeVisible();
    await expect(claim).toContainText(
      'Rotational pairs pass through SPECK’s round function with high probability. ' +
        'That says nothing about SPECK as specified: with its real key schedule the same ' +
        'pairs do not survive two rounds.',
    );
    // It is not inside a <details>, which §4.1d forbids.
    expect(
      await claim.evaluate((el) => el.closest('details') !== null),
      'the negative claim must not be behind a disclosure',
    ).toBe(false);
    // Both sample sizes are visible in this state — the same figure, quoted for
    // each column, so a reader can see the second clause is not an artefact of
    // a smaller run.
    await expect(verdict).toContainText(`${samples.toLocaleString()} samples per point`);
    const verdictText = await verdict.innerText();
    expect(
      verdictText.split(samples.toLocaleString()).length - 1,
      'the sample size must be stated for BOTH columns',
    ).toBeGreaterThanOrEqual(2);
  });
});
