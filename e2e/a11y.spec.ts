import { expect, test } from '@playwright/test';
import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
  watchPageErrors,
} from './gate';

/**
 * WCAG 2.1 A/AA regression gate.
 *
 * The lab is driven along everything it teaches. The arrival state, where
 * exhibit 1 has already run all 37 published vectors in the browser to decide
 * what to offer and the other five tabpanels are hidden and UNRENDERED; the
 * shared skip link focused; a block encrypted, decrypted, and then compared
 * against its designers' vectors with expected and computed side by side; a
 * non-hex key and a wrong-length key, each replacing the output with a named
 * refusal; a cipher changed under a live verdict so the RETIRED notice renders;
 * SKINNY's 4 x 4 row-major cell grid and PRINCE's five Appendix A vectors, two
 * renderings no other family produces. Then the five-column round tracer and
 * its own refusal; exhibit 3's attribution warning and three published figure
 * tables; PRINCE's reflection against its step-by-step inverse, the
 * thousand-block batch, and the negative control with one bit of alpha
 * flipped. Then exhibit 5: an exhaustive count beside Lemma 1, the chained
 * counts against the folklore product, the sample cap stated with every run
 * button disabled mid-job, and the state the negative claim lives in — both
 * key models sampled, the chart, the table, and the limitation on screen with
 * them. Then the tweak pair, a one-bit tweak, an oversized tweak refused, four
 * hover states, three focus rings and a focused scroll region.
 *
 * Every one of those states is scanned, at desktop and at phone width. Dark is
 * the only theme this lab has, so it is scanned once rather than twice — there
 * is no toggle and `boot` asserts there is no theme control at all.
 *
 * See `gate.ts` for why nothing is injected into the page (the retired gate's
 * `addStyleTag` motion kill bypassed the stylesheet's own reduced-motion
 * block, so the rendering reduced-motion readers get was never the one
 * scanned), why no panel is revealed from script (it stripped every `[hidden]`
 * and opened every `<details>` by JS before its only scan), why the lab's
 * defaults are asserted rather than assumed, and why `violations` is not the
 * whole oracle.
 */

const theme = 'dark' as const;

test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors = watchPageErrors(page);
  await boot(page, theme);
  await driveAllStates(page, theme);
  expect(errors, errors.join('\n')).toEqual([]);
  expectBaselineNotStale();
  reportCollected();
});

test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors = watchPageErrors(page);
  await page.setViewportSize(NARROW);
  await boot(page, theme);
  await driveAllStates(page, `${theme} @380px`);
  expect(errors, errors.join('\n')).toEqual([]);
  expectBaselineNotStale();
  reportCollected();
});
