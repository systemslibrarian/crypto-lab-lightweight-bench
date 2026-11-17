/**
 * Entry point: the tab controller and the six exhibits.
 *
 * The arrival panel (exhibit 1) renders synchronously at startup, so the page
 * is never scanned or screenshotted mid-build. Every other panel is rendered
 * the first time its tab is selected and then left in the DOM.
 *
 * `[hidden]` is the only mechanism hiding an inactive panel, and no CSS rule in
 * this lab sets `display` on `.panel`. That matters: a class rule setting
 * `display` outranks the user-agent `[hidden]` rule, so a panel can paint while
 * the code believes it is hidden — the gate probes for exactly that.
 */

import './styles.css';
import { renderBench } from './ui/bench';
import { renderRounds } from './ui/rounds';
import { renderGoals } from './ui/goals';
import { renderReflection } from './ui/reflection';
import { renderRotational } from './ui/rotational';
import { renderTweak } from './ui/tweak';

type PanelName = 'bench' | 'rounds' | 'goals' | 'reflection' | 'rotational' | 'tweak';

const RENDERERS: Record<PanelName, (root: HTMLElement) => void> = {
  bench: renderBench,
  rounds: renderRounds,
  goals: renderGoals,
  reflection: renderReflection,
  rotational: renderRotational,
  tweak: renderTweak,
};

const rendered = new Set<PanelName>();

function panelEl(name: PanelName): HTMLElement {
  const el = document.getElementById(`panel-${name}`);
  if (!el) throw new Error(`no panel element for ${name}`);
  return el;
}

function tabEl(name: PanelName): HTMLButtonElement {
  const el = document.getElementById(`tab-${name}`);
  if (!(el instanceof HTMLButtonElement)) throw new Error(`no tab button for ${name}`);
  return el;
}

function ensureRendered(name: PanelName): void {
  if (rendered.has(name)) return;
  RENDERERS[name](panelEl(name));
  rendered.add(name);
}

function select(name: PanelName, { focus = false } = {}): void {
  for (const other of Object.keys(RENDERERS) as PanelName[]) {
    const tab = tabEl(other);
    const panel = panelEl(other);
    const active = other === name;
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
  }
  ensureRendered(name);
  if (focus) tabEl(name).focus();
}

function init(): void {
  const names = Object.keys(RENDERERS) as PanelName[];

  // Render the arrival panel before anything can observe the page.
  ensureRendered('bench');

  names.forEach((name, index) => {
    const tab = tabEl(name);
    tab.addEventListener('click', () => select(name));
    tab.addEventListener('keydown', (event) => {
      // Roving tabindex, per the WAI-ARIA tabs pattern.
      let next: number | null = null;
      if (event.key === 'ArrowRight') next = (index + 1) % names.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + names.length) % names.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = names.length - 1;
      if (next === null) return;
      event.preventDefault();
      select(names[next], { focus: true });
    });
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
