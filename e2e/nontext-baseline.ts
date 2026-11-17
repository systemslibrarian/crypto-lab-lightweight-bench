/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can
 * paint outside its host and the oracle measures it against the host's
 * backdrop, so that ratio is NOT trustworthy — hand-measure before acting on
 * it.
 *
 * IT IS EMPTY, AND THAT IS THE POINT — this is the terminal state of the
 * ratchet, not an unrun check. Every control on this page was given an
 * explicit edge in `src/styles.css` rather than listed here: `--border-strong`
 * on every input, select and secondary button, `--accent` on the primary
 * button and the selected tab (both of which then clear 3:1 on fill-vs-surround
 * because the accent is light against a dark panel), and `--border` on every
 * card, table cell and trace column. The shared top bar's `.cl-btn`, which
 * older labs in this fleet baselined at about 1.49:1, draws its edge from
 * `--cl-ink` in the copy used here and clears 3:1 — which is why the two
 * entries most of this fleet carries are absent too.
 *
 * A run with `NT_BASELINE_CAPTURE=1` set prints every finding through this
 * same path and asserts nothing, which is how this file is regenerated.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {};
