import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditControlNames, formatControlNameFailures } from './control-names';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';
import { assertThisLab } from './identity';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Five rules govern everything here, and each one corrects a way the retired
 * fleet gate reported coverage it did not have:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. The old spec pushed
 *     `animation:none!important; transition:none!important` through
 *     `addStyleTag`. That BYPASSES this lab's own
 *     `@media (prefers-reduced-motion: reduce)` block instead of exercising
 *     it, so the rendering a reduced-motion reader actually gets was never the
 *     rendering that got scanned. This gate sets the preference through
 *     `emulateMedia`, asserts from inside the page that it took effect
 *     (`test.use({ reducedMotion })` silently does nothing on Playwright
 *     1.61.x), and injects nothing.
 *
 *  2. IT FORCED EVERY PANEL VISIBLE FROM SCRIPT. The old drive stripped every
 *     `[hidden]` attribute and set every `<details>.open` by JS before its only
 *     scan. Stripping `hidden` puts all six tabpanels on screen AT ONCE — a
 *     rendering no reader can reach and axe then scans instead of the real one
 *     — and script-opening the disclosures means the SHUT state, which is what
 *     every reader arrives at, was never scanned at all. This gate switches
 *     tabs by clicking them and opens each disclosure through its `<summary>`,
 *     which is the route a reader has, and scans before and after.
 *
 *  3. IT DROVE BLIND AND THEN THREW THE STATES AWAY. The old drive clicked
 *     every button whose label matched a regex, swallowed every failure with
 *     `.catch(() => {})`, waited a fixed 120ms per tab, and scanned ONCE at the
 *     end. In a lab like this one that would have destroyed almost everything
 *     worth scanning: every refusal state is overwritten by the next
 *     successful run, and exhibit 5's three results each replace the last. This
 *     drive names every control it touches, asserts a real completion signal
 *     after each, and scans after every step, at 1280 and at 380.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`. This lab's own verdict
 *     surfaces are flat hex washes precisely so axe CAN judge them, but the
 *     shared top bar's ink and border are `color-mix()` and axe files both
 *     under `incomplete` rather than judging — as it does an `aria-label` on a
 *     role-less element, and `aria-required-children` on a `role="list"`.
 *     Everything in that bucket is asserted here.
 *
 *  5. IT HAD NO REFLOW, NON-TEXT-CONTRAST OR GENERATED-CONTENT ORACLE. The old
 *     spec hand-rolled one luminance check over two input selectors, reading
 *     the DECLARED `border-top-color` and `background-color` — blind to
 *     `color-mix()`, to composited backdrops, to every `.btn` and `.tab-btn`,
 *     and to all states past first paint. `nontext.ts` replaces it with a
 *     measured oracle over every control at every driven state, and
 *     `expectNoHorizontalOverflow` adds the 1.4.10 check axe has no rule for —
 *     which on this page is the live one, because it renders six tables of hex
 *     and a 680px-wide SVG chart.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Two rAFs are not enough. A transition sampled mid-flight has a colour that
 * exists in no state of the page, and axe will happily report it: elsewhere in
 * this fleet that produced a phantom 2.00:1 failure on a button whose settled
 * ratio is 9:1. Transitions also drain in waves rather than in one batch, so a
 * poll for "nothing running right now" can exit through a gap between waves —
 * hence six consecutive quiet frames rather than one.
 *
 * Bounded three ways, because a gate that can hang is a gate nobody runs:
 * animations that never finish (`iterations: Infinity`) are excluded from the
 * quiescence test rather than waited on, a wall-clock budget inside the page
 * gives up and proceeds, and Playwright's own timeout is the backstop.
 *
 * Under the reduced motion this gate asserts, `styles.css`'s reduced-motion
 * block cancels every transition on the page, so `getAnimations()` is normally
 * empty and this returns on the sixth frame. It stays because the shared top
 * bar's `.cl-btn` transitions are declared OUTSIDE that block — the lab's
 * `*, *::before, *::after` rule wins today, but that is a property of the
 * current stylesheet, not of the page.
 */
export async function settle(page: Page, budgetMs = 4000): Promise<void> {
  await page.waitForFunction(
    (budget: number) => {
      const w = window as unknown as { __quietFrames?: number; __settleStart?: number };
      if (w.__settleStart === undefined) w.__settleStart = performance.now();
      const done = (): boolean => {
        w.__quietFrames = 0;
        w.__settleStart = undefined;
        return true;
      };
      const running = document.getAnimations().filter((a) => {
        if (a.playState !== 'running') return false;
        const timing = a.effect?.getComputedTiming?.();
        // An infinite decorative animation never drains; waiting on it hangs.
        return timing?.iterations !== Infinity;
      });
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      if (w.__quietFrames >= 6) return done();
      if (performance.now() - (w.__settleStart ?? 0) > budget) return done();
      return false;
    },
    budgetMs,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set. This lab
 * declares no `@keyframes` at all and parks nothing at `opacity: 0`, so the
 * shape is absent today. The assertion runs at every state anyway, because
 * "absent today" is a reading of the stylesheet and this is a measurement of
 * the page — and because a reveal animation is the single most likely thing to
 * be added to an exhibit that computes something.
 *
 * `aria-hidden` subtrees are excluded; what this lab hides is the verdict
 * glyphs beside their own words — see `contrast.ts`.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from the moment the page
 * is created. Every panel here renders synchronously at first activation, so a
 * renderer that throws leaves that tabpanel EMPTY — and an empty region is
 * exactly what a scan reports as perfectly accessible. Attach before `boot`,
 * assert after the drive.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark.
 *
 * The shared `.cl-topbar` carries an explicit `role="banner"`. This lab's own
 * hero is a `<div class="cl-hero">`, not a `<header>`, so nothing here implies
 * a second banner today — but the shared bar's `dedupeBanner()` exists because
 * other labs in this fleet DID ship one, and the hero markup is the part of
 * this page most likely to be re-templated from a lab that uses `<header>`.
 * Asserting the OUTCOME rather than the markup is what catches that edit.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false; // explicit non-banner role wins
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * List semantics survive their styling.
 *
 * This lab styles two lists `list-style: none` — exhibit 1's `.vector-list`
 * and exhibit 3's quote list — which is exactly the declaration that makes
 * Safari and VoiceOver DROP a list's implicit role. `dom.ts`'s `list()` helper
 * compensates the documented way, with an explicit `role="list"` on the `<ul>`
 * and `role="listitem"` on every `<li>`, so here an explicit role on a list is
 * the fix rather than the defect. What is asserted is therefore the SHAPE of
 * that fix: any explicit role on a `ul`/`ol` must be `list` (any other value
 * orphans every `<li>` under it), and a `role="list"` must never sit on an
 * EMPTY element, because axe applies `aria-required-children` to the explicit
 * role and would fail it the day a cipher is offered with no vectors to list.
 * Roles are assigned inside that helper, so ask the DOM rather than grepping
 * the source.
 */
export async function assertListSemantics(page: Page): Promise<void> {
  const broken = await page.$$eval('ul[role], ol[role]', (els) =>
    els
      .filter((e) => e.getAttribute('role') !== 'list' || e.children.length === 0)
      .map(
        (e) =>
          `${e.tagName.toLowerCase()}[role=${e.getAttribute('role')}] with ${e.children.length} children`
      )
  );
  expect(
    broken,
    'an explicit non-list role on a list deletes its semantics; an empty role="list" fails aria-required-children'
  ).toEqual([]);
}

/**
 * Load the page in the only theme it has, with reduced motion actually in
 * effect, and assert the content every scan relies on is really on the page.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1, so
 * the emulation is applied imperatively BEFORE the navigation and then
 * *asserted* from inside the page. Nothing in this lab's JS branches on
 * `matchMedia`, but `styles.css`'s reduced-motion block is the only thing
 * standing between a scan and a mid-flight transition colour, so the assertion
 * is the difference between scanning the reduced-motion rendering and merely
 * believing we did.
 *
 * Dark is the only theme and there is no toggle, so the theme is not seeded or
 * switched: `index.html` pins `data-theme="dark"` on the element AND writes
 * `localStorage.theme`, and this asserts the outcome of both.
 */
/**
 * Shared setup. Runs before EVERY test that imports it, so an assertion here
 * fails all of them at once, under whatever name those tests carry.
 *
 * SO THIS FUNCTION ASSERTS STRUCTURE AND NEVER PRODUCT COPY. On 2026-09-26
 * crypto-lab-mceliece-gate changed one textarea's default string; its gate.ts
 * still asserted the old sentence, boot() threw, both axe runs failed, the
 * build job failed, the deploy was skipped, and deploy-sync reported the lab
 * stale. The step that went red was called "Accessibility gate", and four of
 * its six a11y tests had passed. For three days the live site served security
 * claims that main had already corrected, and the one red thing in sight named
 * the wrong subject.
 *
 * Structure: the control exists, the arrival panel is the one that ships,
 * counts, [hidden]/toBeEmpty on lazily-rendered panels, a default matching a
 * SHAPE (/^[0-9a-f]{16}$/ for a 64-bit block). Copy: what a string SAYS — that
 * belongs in e2e/claims.spec.ts, where a failure names copy as the subject.
 * In particular the availability verdict's WORDING and the vector counts it
 * quotes are claims; what is asserted here is only that it is present and that
 * it reports the OK tone, because every other state of this page depends on
 * ciphers actually being offered.
 */
export async function boot(page: Page, theme: 'dark'): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the
  // whole test timeout and reports nothing useful. 30s turns that silent hang
  // into a named failure naming the locator — generous here because exhibit 5's
  // worker jobs are real computation, not a spinner.
  page.setDefaultTimeout(30_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  /* Not page.goto: a suite that navigates and starts asserting cannot
   * tell this lab's server from anyone else's. See e2e/identity.ts. */
  await assertThisLab(page, '.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  // The anti-flash script also writes the key, and `theme-sync` judges the
  // literal; asserting the stored value catches the day the script is reindented
  // into uselessness under a CSP, which this lab does not ship but might.
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
  await assertSingleBanner(page);
  await assertListSemantics(page);

  // ── The page really rendered ────────────────────────────────────────────
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('.tab-btn')).toHaveCount(6);

  // The shared skip link points at an id that exists. axe's skip-link rule is
  // best-practice, not WCAG-tagged, so `withTags` never runs it — a skip link
  // aimed at a missing element is exactly the kind of thing a green axe run
  // says nothing about.
  await expect(page.locator('a.cl-skip-link')).toHaveAttribute('href', '#app');
  await expect(page.locator('#app')).toHaveCount(1);

  // Dark is the only theme, so the page must carry no theme control at all —
  // not the shared bar's, which was removed, and not a lab-local one. The
  // shared CSS hides any lab toggle with `display:none !important`, which would
  // leave a dead-but-known element; asserting the count at zero catches the day
  // one is added without going through that list.
  await expect(
    page.locator('#theme-toggle, #themeToggle, .theme-toggle, .theme-toggle-btn, [data-theme-toggle]')
  ).toHaveCount(0);
  await expect(page.locator('#cl-theme-toggle')).toHaveCount(0);

  // ── The arrival state: exhibit 1 active, five panels unrendered ─────────
  // `renderBench` runs every cipher's published vectors at module load and
  // builds its menus from the survivors (invariant 1), so first paint carries
  // an availability verdict and a populated pair of selects. The other five
  // panels are lazily rendered: hidden AND EMPTY until their tab is first
  // activated — asserted, because "empty" is this lab's tell that a renderer
  // threw (see `watchPageErrors`).
  await expect(page.getByRole('tab', { name: /Five Ciphers/ })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('#panel-bench [data-verdict="bench-availability"]')).toBeVisible();
  // STRUCTURE, not copy: the tone. If this is not `ok` then some cipher failed
  // its designers' vectors in the browser, every later state is driving a
  // reduced menu, and the whole drive is measuring the wrong page.
  await expect(page.locator('#panel-bench [data-verdict="bench-availability"]')).toHaveAttribute(
    'data-verdict-kind',
    'ok'
  );
  for (const id of ['rounds', 'goals', 'reflection', 'rotational', 'tweak']) {
    await expect(page.locator(`#panel-${id}`)).toBeHidden();
    await expect(page.locator(`#panel-${id}`)).toBeEmpty();
  }

  // ── Every shipped control default, as a SHAPE ───────────────────────────
  // The defaults are the first published vector of the arrival cipher, so they
  // are hex of exactly the right length — structural, where the particular
  // vector chosen is a claim claims.spec.ts owns.
  await expect(page.locator('#bench-family')).toHaveValue(/^[A-Z]+$/);
  await expect(page.locator('#bench-size')).toHaveValue(/^[a-z]+-\d+-\d+$/);
  await expect(page.locator('#bench-key')).toHaveValue(/^[0-9a-f]+$/);
  await expect(page.locator('#bench-block')).toHaveValue(/^[0-9a-f]+$/);
  // Both selects are populated rather than empty husks.
  expect(await page.locator('#bench-family option').count()).toBe(5);
  expect(await page.locator('#bench-size option').count()).toBeGreaterThan(1);
  // Nothing has been computed yet: the output region ships empty.
  await expect(page.locator('#bench-output')).toBeEmpty();
  await expect(page.locator('#bench-vectors')).toBeEmpty();

  // ── Disclosures ship shut ───────────────────────────────────────────────
  await expect(page.locator('details[open]')).toHaveCount(0);

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all, and on this page
 * it is the live check rather than a formality: a 128-bit key is 32 hex digits,
 * a SKINNY-128-384 tweakey is 96, exhibit 2 renders five columns side by side,
 * exhibit 3 renders three wide figure tables, and exhibit 5 renders a 680px
 * SVG. The strategy is `overflow-wrap: anywhere` on every value (`.kv dd`,
 * `.trace-state`, `.wrap-any`), `overflow-x: auto` wrappers for the tables and
 * the state grids, `max-width: 100%` on the chart, and grids that collapse with
 * `repeat(auto-fit, minmax(...))`. So the shapes at risk are a new unwrapped
 * value, a table that escapes its `.scroll-x`, or a grid item whose automatic
 * minimum size is the min-content of a 96-digit line. At 380px that is
 * precisely what this check exists to catch.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide box inside an `overflow: auto` wrapper has a huge bounding rect but
    // is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll.
 *
 * This lab is FULL of scrollers by design: every wide table and every state
 * grid is wrapped by `dom.ts`'s `scrollX()`, which is the single place the
 * `tabindex="0"`, the `role="region"` and the `aria-label` are applied. So this
 * assertion is not vacuous here — it is the check that the helper is actually
 * the route every scroller took. A table dropped straight into a panel with
 * `overflow-x: auto` in its own class would be invisible to axe and caught
 * only here.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY);
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * Nothing may be focusable while it paints nothing (WCAG 2.4.3 / 2.4.7).
 *
 * `opacity: 0` with `pointer-events: none` is NOT hiding: the element keeps
 * `tabIndex: 0`, so a keyboard reader tabs to a control that is not on screen
 * and the focus ring lands nowhere. `display: none` and `visibility: hidden`
 * DO remove an element from the tab order, so those are skipped rather than
 * flagged — the failure is specifically the invisible-but-tabbable pair. The
 * `hidden` tabpanels here take the `display: none` route, which is why five
 * panels' worth of buttons are legitimately absent from the tab order.
 *
 * Off-screen-but-focusable is the WCAG-sanctioned skip-link idiom and is
 * deliberately not flagged: the shared skip link parks at `top:-3rem` with
 * full opacity and slides in on focus. The drive scans it focused.
 */
export async function expectNoInvisibleFocusTargets(page: Page, label: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
      if (el.tabIndex < 0) continue;
      // display:none / visibility:hidden already remove it from the tab order.
      if (!el.checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        effective *= parseFloat(getComputedStyle(n).opacity);
      }
      const r = el.getBoundingClientRect();
      if (effective !== 0 && r.width > 0 && r.height > 0) continue;
      // Confirm it really is reachable rather than inferring it.
      const before = document.activeElement;
      el.focus();
      const took = document.activeElement === el;
      (before as HTMLElement | null)?.focus?.();
      if (took) {
        out.push(
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(el.getAttribute('class') ?? '').trim()}` +
            ` (opacity ${effective}, ${Math.round(r.width)}x${Math.round(r.height)})`
        );
      }
    }
    return Array.from(new Set(out));
  });
  expect(bad, `focusable elements that paint nothing in state: ${label}`).toEqual([]);
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. The collection pass turns that into a single run.
 * It is a debugging aid only: `A11Y_COLLECT` is never set in CI, and a run
 * with it set prints every finding as it happens and then fails at the end, so
 * a green collection run cannot be mistaken for a green gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens, not only at the end: a hard assertion later in the
  // drive would otherwise abort the test before anything collected so far was
  // ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything. Without this a
 * collection run would end green, and a green collection run is
 * indistinguishable from a green gate — which is the exact confusion the whole
 * exercise exists to remove.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function soft(fn: () => Promise<void>): Promise<void> {
  if (!COLLECTING) return fn();
  try {
    await fn();
  } catch (e) {
    // Generous, not 900: a truncated oracle dump is how a second and third
    // finding in the same state get missed on a collection pass.
    record(String(e).slice(0, 6000));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no
 * text node.
 *
 * IT IS CALLED FROM `scan()`, deliberately and not by accident. Fleet-wide
 * this oracle had been called from inside a soft wrapper AFTER its
 * `if (!COLLECTING) return` guard — so in a strict run, which is every run in
 * CI and every run anyone reads as a pass, the guard returned first and
 * `nontext.ts` never executed at all. Thirteen repos certified themselves
 * clean on an oracle that had never looked. Calling it here means it runs at
 * every driven state, including `:hover`, and this repo's baseline was
 * captured by that live path.
 *
 * A check that merely logs is not a gate, so it ratchets: anything NOT in the
 * baseline fails, anything in the baseline that got WORSE fails, and anything
 * in the baseline that has been FIXED fails until its entry is deleted. That
 * last rule is what stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(`WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`);
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the
 * point — or the drive stopped reaching the state that shows it, which is a
 * coverage regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Nine assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those
 *    ratios arithmetically. On this page the `color-mix()` axe cannot resolve
 *    is the shared top bar's ink and border, not the lab's own verdicts, which
 *    take flat hex washes for exactly this reason. Everything else in that
 *    bucket is a real result axe simply could not finish — including
 *    `aria-prohibited-attr`, which is where an `aria-label` on a role-less
 *    element hides, and `aria-required-children`, which is where an empty
 *    `role="list"` hides. This page leans on both: every scroll region is a
 *    `<div role="region" aria-label="...">` and every styled list carries an
 *    explicit `role="list"`. Drop the role and the label is silently
 *    discarded; render the list empty and the role fails.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - the same walk over `aria-hidden` content with the exemption lifted —
 *    SC 1.4.3 is about what a reader SEES; see `contrast.ts` for what this
 *    lab hides and why it is measured anyway.
 *  - non-text contrast and generated content — SC 1.4.11, ratcheted; see
 *    `expectNoNewNonTextFailures`. This is the only oracle that judges a
 *    control's boundary against the surface OUTSIDE it.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - no focusable element that paints nothing — WCAG 2.4.3/2.4.7.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `AxeBuilder.withTags()` and `AxeBuilder.withRules()` both write the same
  // `options.runOnly` field, so the second call SILENTLY REPLACES the first —
  // the axe-core/playwright source says so in as many words on `withRules`
  // ("Cannot be used with AxeBuilder#withTags"). Chained as
  // `.withTags(TAGS).withRules([...4 landmark rules])`, axe runs those FOUR
  // best-practice rules and NOT ONE WCAG RULE, while a green result reads
  // exactly like a full A/AA pass. For scale, `withTags(TAGS)` selects 69 of
  // axe-core 4.12's 105 rule definitions; the chained form executes 4.
  //
  // The landmark four are still wanted because they are best-practice rather
  // than WCAG-tagged, so `withTags` alone does not reach them — and this page
  // has the shape they catch: a sticky `<header role="banner">` above a
  // `<div id="app">` holding an `<aside class="cl-hero-why">`, two `<nav>`s
  // (the shared actions and the tablist wrapper), one `<main>` and a footer.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze();
  const results = {
    violations: [...wcag.violations, ...landmarks.violations],
    incomplete: [...wcag.incomplete, ...landmarks.incomplete],
  };

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  // The `incomplete` bucket is asserted, not skimmed. `aria-prohibited-attr`
  // and `aria-required-children` appear ONLY here — never in `violations` — so
  // a gate that ignores this bucket cannot see either. Only `color-contrast`
  // is allowed to remain, and only because the arithmetic walk below judges
  // those ratios for real; no other rule is filtered out.
  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  // axe's `label` rule accepts a bare `placeholder` as an accessible name, so a
  // deleted label can leave this gate green. See `control-names.ts`.
  const unnamed = formatControlNameFailures(await auditControlNames(page));
  softExpect(unnamed, `form controls named only by placeholder/title in state: ${label}`, []);

  // The aria-hidden walk, exemption lifted — axe skips this text entirely and
  // the default walk honours the same boundary, so this second call is the
  // ONLY thing that ever measures it. See `contrast.ts` for the inventory.
  const hiddenContrast = Array.from(
    new Set(
      formatContrastFailures(
        await auditContrast(page, '[aria-hidden="true"], [aria-hidden="true"] *', true)
      )
    )
  );
  softExpect(hiddenContrast, `measured aria-hidden contrast failures in state: ${label}`, []);

  await soft(() => expectNoNewNonTextFailures(page, label));
  await soft(() => expectScrollersReachable(page, label));
  await soft(() => expectNoInvisibleFocusTargets(page, label));
  await soft(() => expectNoHorizontalOverflow(page, label));
}

// ── The drive ───────────────────────────────────────────────────────────────

/** Switch to a tab by clicking it, and prove the switch happened. */
async function openTab(page: Page, name: RegExp, panelId: string): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(panelId)).toBeVisible();
  await expect(page.locator(panelId)).not.toBeEmpty();
}

/**
 * Exhibit 5's sample count, for the gate only.
 *
 * The page defaults to 2^22 samples per point and the shipped cap is 2^26.
 * Neither is wanted twelve times over inside an accessibility drive, so the
 * gate sets 2^18 — large enough that the rotated-round-key column still tracks
 * 0.375011^r inside the 5% the verdict requires (at 2^18 the three-round point
 * carries about 13,800 survivors, so the sampling error is under 1%) and that
 * the real-schedule column still finds nothing past one round. That matters,
 * because the state the negative claim lives in is only reachable when BOTH of
 * those hold, and this drive has to reach it.
 */
const GATE_SAMPLES = String(1 << 18);

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * Five things shape this drive:
 *
 *  - THE ARRIVAL STATE IS SCANNED FIRST, exactly as a reader gets it: exhibit
 *    1 active with its availability verdict and its menus built from the
 *    ciphers that passed their vectors, five panels hidden and unrendered,
 *    every disclosure shut, nothing yet computed.
 *
 *  - EVERY PANEL IS RENDERED LAZILY, so a tab that is never clicked is a panel
 *    that is never even IN the DOM. Each of the six is activated through its
 *    real tab button and scanned in its own driven states.
 *
 *  - EVERY REFUSAL STATE. This lab's fail-closed paths are all reachable only
 *    by typing something wrong on purpose: a non-hex key, a key of the wrong
 *    length for the chosen size, a tweak longer than the tweakey leaves room
 *    for. Each paints a REFUSED verdict that no other state shows, and each is
 *    driven and scanned here.
 *
 *  - THE BUSY STATE IS A STATE. Exhibit 5 disables its four run buttons while
 *    a worker job is in flight, and `.btn:disabled` repaints both fill and
 *    border toward the panel — the one place this page relies on a disabled
 *    control's appearance. It is scanned mid-run rather than assumed.
 *
 *  - HOVER PERSISTS AFTER A CLICK. `:hover` stays on the element under the
 *    pointer after `page.click()` resolves, so it is the state a reader
 *    occupies the instant after pressing a button — and `.tab-btn:hover`,
 *    `.btn:hover` and `.cl-btn:hover` all repaint their fill. Scanned
 *    explicitly.
 *
 *  - NO FIXED TIMEOUTS. Every wait is on a real DOM completion signal: a
 *    verdict appearing, a `data-` attribute landing, `aria-selected`, a button
 *    re-enabling after its worker finishes.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${theme} / ${s}`);

  await scanAt('arrival: exhibit 1 active, five panels unrendered, nothing computed');

  // ── The shared skip link, focused ───────────────────────────────────────
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('the shared skip link focused, slid in from top:-3rem');

  // ── Exhibit 1: the bench ────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
  await expect(page.locator('#bench-output [data-claim="bench-ciphertext"]')).toBeVisible();
  await scanAt('bench: a block encrypted — the key/value readout and the state grid');

  await page.getByRole('button', { name: /Decrypt the result/ }).click();
  await expect(page.locator('#bench-output [data-verdict="bench-roundtrip"]')).toBeVisible();
  await scanAt('bench: decrypted back to the plaintext — the round-trip verdict');

  await page.getByRole('button', { name: /Check the designers/ }).click();
  await expect(page.locator('#bench-vectors [data-verdict="bench-vector-summary"]')).toBeVisible();
  // Ten rows for a SIMON/SPECK size, and every one of them matched.
  await expect(page.locator('#bench-vectors [data-verdict="vector-match"]')).toHaveCount(1);
  await scanAt('bench: the designers’ vectors compared live, expected beside computed');

  // A non-hex key. The refusal replaces the output entirely.
  await page.fill('#bench-key', 'zz18111009080100');
  await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
  await expect(page.locator('#bench-output [data-verdict="bench-refused"]')).toBeVisible();
  await scanAt('bench: non-hex key REFUSED — the message names the offending character');

  // A key of the wrong length for the chosen size: a different refusal.
  await page.fill('#bench-key', 'abcd');
  await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
  await expect(page.locator('#bench-output [data-verdict="bench-refused"]')).toBeVisible();
  await scanAt('bench: key of the wrong length REFUSED — the message names the expected length');

  // Changing the cipher retires whatever verdict is on screen.
  await page.selectOption('#bench-family', 'SKINNY');
  await expect(page.locator('#bench-output [data-verdict="bench-retired"]')).toBeVisible();
  await scanAt('bench: cipher changed under a stale verdict — the RETIRED notice');

  // SKINNY renders the 4x4 row-major cell grid, which no other family does.
  await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
  await expect(page.locator('#bench-output table.state-grid')).toBeVisible();
  await scanAt('bench: SKINNY — the 4 × 4 state grid with row and column headers');

  // PRINCE renders the 16-nibble strip, and has five vectors rather than one.
  await page.selectOption('#bench-family', 'PRINCE');
  await page.getByRole('button', { name: /Check the designers/ }).click();
  await expect(page.locator('#bench-vectors [data-verdict="vector-match"]')).toHaveCount(5);
  await scanAt('bench: PRINCE — all five Appendix A vectors compared');

  // ── Exhibit 2: the round tracer ─────────────────────────────────────────
  await openTab(page, /Round Functions/, '#panel-rounds');
  await expect(page.locator('#panel-rounds [data-trace-column]')).toHaveCount(5);
  await scanAt('rounds: five families traced on one block, side by side');

  await page.locator('#panel-rounds details > summary').click();
  await expect(page.locator('#panel-rounds details[open]')).toHaveCount(1);
  await scanAt('rounds: the what-to-look-for disclosure open');

  await page.fill('#rounds-block', 'nothex');
  await page.getByRole('button', { name: /Trace one round/ }).click();
  await expect(page.locator('#rounds-output [data-verdict="rounds-refused"]')).toBeVisible();
  await scanAt('rounds: malformed block REFUSED');

  await page.fill('#rounds-block', '0123456789abcdef');
  await page.getByRole('button', { name: /Trace one round/ }).click();
  await expect(page.locator('#panel-rounds [data-trace-column]')).toHaveCount(5);

  // ── Exhibit 3: the goals tables ─────────────────────────────────────────
  await openTab(page, /Three Goals/, '#panel-goals');
  await expect(page.locator('#panel-goals [data-verdict="goals-attribution"]')).toBeVisible();
  await expect(page.locator('#panel-goals [data-figure-table]')).toHaveCount(3);
  await scanAt('goals: the attribution warning and all three published figure tables');

  await page.locator('#panel-goals details > summary').click();
  await expect(page.locator('#panel-goals details[open]')).toHaveCount(1);
  await scanAt('goals: the no-league-table caveat open');

  // ── Exhibit 4: PRINCE reflection ────────────────────────────────────────
  await openTab(page, /PRINCE Backwards/, '#panel-reflection');
  await page.getByRole('button', { name: /Encrypt, then decrypt both ways/ }).click();
  await expect(page.locator('#reflect-output [data-verdict="reflect-verdict"]')).toBeVisible();
  await scanAt('reflection: both decryption routes compared, plus the RC pair table');

  await page.getByRole('button', { name: /Compare on 1,000 random blocks/ }).click();
  await expect(page.locator('#reflect-output [data-verdict="reflect-batch-verdict"]')).toBeVisible();
  await scanAt('reflection: the 1,000-block agreement verdict');

  await page.getByRole('button', { name: /Negative control/ }).click();
  await expect(page.locator('#reflect-output [data-verdict="reflect-control-verdict"]')).toBeVisible();
  await scanAt('reflection: the negative control — alpha with one bit flipped');

  await page.locator('#panel-reflection details > summary').click();
  await expect(page.locator('#panel-reflection details[open]')).toHaveCount(1);
  await scanAt('reflection: the what-reflection-costs disclosure open');

  await page.fill('#reflect-block', 'zz');
  await page.getByRole('button', { name: /Encrypt, then decrypt both ways/ }).click();
  await expect(page.locator('#reflect-output [data-verdict="reflect-refused"]')).toBeVisible();
  await scanAt('reflection: malformed block REFUSED');

  // ── Exhibit 5: rotational pairs ─────────────────────────────────────────
  await openTab(page, /Rotational Pairs/, '#panel-rotational');
  await scanAt('rotational: arrival, nothing counted yet');

  // The instant 8-bit exhaustive count. The 16-bit one is 2^32 iterations and
  // about eight seconds; the claims suite runs that one, and this drive uses
  // the small one so the a11y pass stays proportionate.
  await page.getByRole('button', { name: /Count all 2\^16 pairs/ }).click();
  await expect(page.locator('#rot-one-output [data-verdict="rot-one-verdict"]')).toBeVisible();
  await scanAt('rotational: run 1 — an exhaustive count beside Lemma 1');

  await page.getByRole('button', { name: /Count every 8-bit tuple/ }).click();
  await expect(page.locator('#rot-chain-output [data-verdict="rot-chain-verdict"]')).toBeVisible({
    timeout: 90_000,
  });
  await scanAt('rotational: run 2 — chained additions against the folklore product');

  // The sample cap, which is a reachable refusal-shaped state of its own.
  await page.fill('#rot-samples', '999999999');
  await page.getByRole('button', { name: /Sample both key models/ }).click();
  await expect(page.locator('#rot-speck-output [data-verdict="rot-sample-capped"]')).toBeVisible();
  // While that capped run is in flight every run button is disabled, which is
  // the only place this page depends on a disabled control's appearance.
  await expect(page.getByRole('button', { name: /Sample both key models/ })).toBeDisabled();
  await scanAt('rotational: the sample cap stated, run buttons disabled mid-job');
  await expect(page.getByRole('button', { name: /Sample both key models/ })).toBeEnabled({
    timeout: 600_000,
  });

  // The negative-claim fixture: both columns run, at a sample count the gate
  // can afford, in the state where the verdict reads as a result AND a limit.
  await page.fill('#rot-samples', GATE_SAMPLES);
  await page.getByRole('button', { name: /Sample both key models/ }).click();
  await expect(page.locator('#rot-speck-output [data-verdict="rot-speck-verdict"]')).toBeVisible({
    timeout: 300_000,
  });
  await expect(page.locator('#rot-speck-output [data-claim="negative-claim"]')).toBeVisible();
  await expect(page.locator('#rot-speck-output figure[data-chart="rot-survival"]')).toBeVisible();
  await scanAt(
    'rotational: run 3 — the chart, the table, and the negative claim on screen with it'
  );

  // Changing the rotation amount retires the counts under it.
  await page.selectOption('#rot-amount', '3');
  await expect(page.locator('#rot-speck-output [data-verdict="rot-retired"]')).toBeVisible();
  await scanAt('rotational: rotation amount changed — the counts RETIRED');

  // ── Exhibit 6: the tweak ────────────────────────────────────────────────
  await openTab(page, /SKINNY Tweak/, '#panel-tweak');
  await page.getByRole('button', { name: /Encrypt under both tweaks/ }).click();
  await expect(page.locator('#tweak-output [data-verdict="tweak-verdict"]')).toBeVisible();
  await scanAt('tweak: same key and plaintext, two tweaks, unrelated ciphertexts');

  await page.getByRole('button', { name: /differ from A by one bit/ }).click();
  await expect(page.locator('#tweak-output [data-claim="tweak-pair"]')).toHaveAttribute(
    'data-tweak-distance',
    '1'
  );
  await scanAt('tweak: a one-bit tweak difference');

  await page.getByRole('button', { name: /tweak that is too long/ }).click();
  await expect(page.locator('#tweak-output [data-verdict="tweak-overlong"]')).toBeVisible();
  await scanAt('tweak: an oversized tweak REFUSED, with the available room stated');

  await page.fill('#tweak-a', 'zz');
  await page.getByRole('button', { name: /Encrypt under both tweaks/ }).click();
  await expect(page.locator('#tweak-output [data-verdict="tweak-refused"]')).toBeVisible();
  await scanAt('tweak: non-hex tweak REFUSED');

  // ── Hover, which persists after a click ─────────────────────────────────
  await page.getByRole('button', { name: /Encrypt under both tweaks/ }).hover();
  await scanAt('a primary button hovered');

  await page.getByRole('button', { name: /differ from A by one bit/ }).hover();
  await scanAt('a secondary button hovered — its accent wash fill repainted');

  await page.getByRole('tab', { name: /Five Ciphers/ }).hover();
  await scanAt('an inactive tab hovered');

  await page.locator('.cl-topbar .cl-btn').first().hover();
  await scanAt('a shared top bar control hovered');

  // ── Focus rings on the controls that take them ──────────────────────────
  await page.locator('#tweak-key').focus();
  await expect(page.locator('#tweak-key')).toBeFocused();
  await scanAt('a text input focused, showing its focus-visible outline');

  await page.locator('#tweak-a').focus();
  await scanAt('a second input focused');

  await page.getByRole('tab', { name: /SKINNY Tweak/ }).focus();
  await scanAt('the active tab focused');

  // A scroll region focused: every wide table on this page sits in one, and a
  // focusable scroller is the fix for WCAG 2.1.1 that the oracle above checks
  // for existence — this scans the ring it draws when it is actually used.
  await page.locator('#panel-tweak').click({ position: { x: 5, y: 5 } });
  await openTab(page, /Three Goals/, '#panel-goals');
  await page.locator('#panel-goals .scroll-x').first().focus();
  await scanAt('a scrollable table region focused');
}
