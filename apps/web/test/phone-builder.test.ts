import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * The web app on phones, Plan Task 11 — the workflow editor (21.170, 21.171), the workflow list / history /
 * template doors (21.172) and the ticket types (21.173). 21.174 (open a workflow at 390: pan the canvas, open
 * Panels, expand a transition, add a rule, close) is a browser case and stays 🧪.
 *
 * Every phone rule sits inside the existing 40rem arm (FD1) and AFTER the base rule it overrides — equal
 * specificity, so source order decides, and a phone arm above its base paints nothing while passing every
 * value check. The order is asserted next to the values. The CLASS HOOKS the rules key on (the Panels button,
 * the sheet's `data-open`, the Done button, the scrim, `workflow-list__new` …) are asserted to be carried by the
 * components in `packages/app-core/test/workflow-builder/phone-builder-hooks.test.tsx`: a rule on a class the
 * component does not carry is a rule that paints nothing.
 */
const PHONE = '@media (max-width: 40rem)';
const ui = readUiCss();
const globals = readGlobalsCss();

/** Index of the (single) rule in the stylesheet, so source order can be compared. */
function position(css: string, selectors: string[], atRule: string | null): number {
  const index = parseRules(css).findIndex(
    (rule) =>
      rule.atRule === atRule &&
      rule.selectors.length === selectors.length &&
      rule.selectors.every((selector, i) => selector === selectors[i]),
  );
  if (index === -1) throw new Error(`no rule ${selectors.join(', ')} under ${atRule ?? 'top level'}`);
  return index;
}

/**
 * Index of the LAST top-level rule whose selector list names every one of `selectors` (a base rule may be split
 * across the file; the FIRST one is not the check — a later top-level rule that undoes the arm must be seen).
 */
function lastBaseIndex(css: string, selectors: string[]): number {
  let found = -1;
  parseRules(css).forEach((rule, i) => {
    if (rule.atRule === null && selectors.every((selector) => rule.selectors.includes(selector))) found = i;
  });
  if (found === -1) throw new Error(`no top-level rule names ${selectors.join(', ')}`);
  return found;
}

/** An at-rule that applies at a 40rem-wide window: no at-rule at all, or a `(max-width: N)` arm with N ≥ 40rem. */
function appliesAtPhone(atRule: string | null): boolean {
  if (atRule === null) return true;
  const hit = /^@media \(max-width: ([0-9.]+)rem\)$/.exec(atRule);
  return hit !== null && Number(hit[1]) >= 40;
}

/** The property names a rule body declares. */
function declaredProperties(body: string): string[] {
  return [...body.matchAll(/(?:^|[;{\s])([a-z-]+)\s*:/g)].map((hit) => hit[1] ?? '');
}

/**
 * The phone rule for `selectors` comes after BOTH:
 *  (a) the explicit `bases` (default: its own selector list) — each compared against the LAST top-level rule naming it,
 *      and a base that does not exist is an error (a typo'd base must not pass); and
 *  (b) the LAST other rule that names ANY of its own selectors and applies at ≤40rem — top level, or a
 *      `(max-width: N)` arm with N ≥ 40rem. This needs no base to exist (`.workflow-list__new` has no top-level
 *      rule), and it is what sees a later `@media (max-width: 64rem)` arm or a later top-level rule undoing the arm.
 *      A later rule in the phone arm itself counts only when it writes a property the phone rule writes.
 */
function after(css: string, selectors: string[], bases: string[][] = [selectors]): void {
  const own = position(css, selectors, PHONE);
  for (const base of bases) {
    expect(own, `${selectors.join(', ')}: the phone arm must follow the LAST top-level rule naming ${base.join(', ')}`).toBeGreaterThan(
      lastBaseIndex(css, base),
    );
  }
  const rules = parseRules(css);
  const ownProperties = declaredProperties(rules[own]?.body ?? '');
  let latest = -1;
  rules.forEach((rule, i) => {
    if (i === own || !appliesAtPhone(rule.atRule) || !selectors.some((selector) => rule.selectors.includes(selector))) return;
    // Another rule in the SAME phone arm after this one is a companion (e.g. `__panels { display }` after the shared
    // `__add-state, __panels` sizing) unless it writes a property this rule writes; every outer rule counts as it stands.
    if (rule.atRule === PHONE && !declaredProperties(rule.body).some((property) => ownProperties.includes(property))) return;
    latest = i;
  });
  expect(own, `${selectors.join(', ')}: the phone arm must follow the LAST rule naming it that applies at ≤40rem`).toBeGreaterThan(latest);
}

/** No top-level rule names `selector` with a paint — the phone arm is the only place it is drawn. */
function notPaintedAbove(css: string, selectors: string[]): void {
  expect(valueOf(ruleExactly(css, selectors), 'display')).toBe('none');
}

describe('21.170 the workflow editor: the canvas fills the screen and pans; the panels are a bottom sheet from a Panels button', () => {
  it('21.170 the screen is bounded to the window minus the chrome AND the bottom bar; the canvas is the capped scroller; the layout takes what the header leaves', () => {
    const screen = ruleExactly(ui, '.workflow-builder-screen', PHONE);
    const height = valueOf(screen, 'height') ?? '';
    for (const term of ['100dvh', 'var(--app-nav-offset, 0px)', 'var(--gn-builder-crumb-gap, 0px)', 'var(--gn-builder-crumb-line, 0px)']) {
      expect(height, `the phone height reads ${term}`).toContain(term);
    }
    // Case 10.164: the builder height must include the bottom bar — the shell pads by calc(bar + inset) + 2rem here.
    expect(height).toContain('var(--gn-phone-bar-height) + env(safe-area-inset-bottom)');
    expect(height).toContain('2rem');
    expect(valueOf(screen, 'min-height')).toBe('28rem');
    const layout = ruleExactly(ui, '.workflow-builder-screen__layout', PHONE);
    expect(valueOf(layout, 'flex')).toBe('1 1 auto');
    expect(valueOf(layout, 'min-height')).toBe('0');
    expect(valueOf(layout, 'grid-template-rows')).toBe('minmax(0, 1fr)');
    expect(valueOf(ruleExactly(ui, '.workflow-builder-screen__canvas', PHONE), 'max-height')).toBe('100%');
    after(ui, ['.workflow-builder-screen']);
    after(ui, ['.workflow-builder-screen__layout']);
    after(ui, ['.workflow-builder-screen__canvas']);

    // CONTROL — the canvas is still the deliberate `overflow: auto` card, and above 64.0625rem the screen height is
    // the wide arm's own (the phone arm is not it).
    expect(valueOf(ruleExactly(ui, '.workflow-builder-screen__canvas'), 'overflow')).toBe('auto');
    expect(valueOf(ruleExactly(ui, '.workflow-builder-screen', '@media (min-width: 64.0625rem)'), 'height')).toContain('var(--gn-shell-pad-bottom, 0px)');
  });

  it('21.170 the left column is hidden on a phone until opened, then a fixed bottom sheet above the scrim and the bottom bar; above 64rem it is the side column with its own scroll', () => {
    const closed = ruleExactly(ui, '.workflow-builder-screen__left', PHONE);
    expect(valueOf(closed, 'display')).toBe('none');
    const open = ruleExactly(ui, ".workflow-builder-screen__left[data-open='true']", PHONE);
    expect(valueOf(open, 'display')).toBe('flex');
    expect(valueOf(open, 'position')).toBe('fixed');
    expect(valueOf(open, 'left')).toBe('0');
    expect(valueOf(open, 'right')).toBe('0');
    expect(valueOf(open, 'bottom')).toBe('0');
    expect(valueOf(open, 'z-index')).toBe('41');
    expect(valueOf(open, 'max-height')).toBe('85dvh');
    expect(valueOf(open, 'overflow-y')).toBe('auto');
    expect(valueOf(open, 'overscroll-behavior')).toBe('contain');
    expect(valueOf(open, 'border-radius')).toBe('var(--gn-radius-track) var(--gn-radius-track) 0 0');
    expect(valueOf(open, 'padding')).toBe('0.75rem 1rem max(1rem, env(safe-area-inset-bottom))');
    expect(valueOf(open, 'background')).toBe('var(--gn-surface)');
    expect(valueOf(open, 'box-shadow')).toBe('var(--gn-shadow-overlay)');
    const scrim = ruleExactly(ui, '.workflow-builder-screen__scrim', PHONE);
    expect(valueOf(scrim, 'display')).toBe('block');
    expect(valueOf(scrim, 'position')).toBe('fixed');
    expect(valueOf(scrim, 'inset')).toBe('0');
    expect(valueOf(scrim, 'z-index')).toBe('40');
    expect(valueOf(scrim, 'background')).toBe('var(--gn-surface-overlay)');
    // The sheet sits above the scrim, which sits above the bottom bar (z-index 30).
    expect(Number(valueOf(open, 'z-index'))).toBeGreaterThan(Number(valueOf(scrim, 'z-index')));
    expect(Number(valueOf(scrim, 'z-index'))).toBeGreaterThan(30);
    expect(valueOf(ruleExactly(globals, '.gn-bottom-bar', PHONE), 'z-index')).toBe('30');
    after(ui, ['.workflow-builder-screen__left']);
    after(ui, [".workflow-builder-screen__left[data-open='true']"], [['.workflow-builder-screen__left']]);

    // CONTROL — above 64.0625rem the column is still the stretched side column with its own scroll, and the phone
    // rules above are not it: the base column is not `position: fixed`.
    const wide = ruleExactly(ui, '.workflow-builder-screen__left', '@media (min-width: 64.0625rem)');
    expect(valueOf(wide, 'align-self')).toBe('stretch');
    expect(valueOf(wide, 'overflow-y')).toBe('auto');
    const base = ruleExactly(ui, '.workflow-builder-screen__left');
    expect(valueOf(base, 'position')).toBeNull();
    expect(valueOf(base, 'display')).toBe('flex');
  });

  it('21.170 the Panels button and the sheet’s Done button are phone-only and ≥44px; above 40rem neither is painted, nor is the scrim', () => {
    const hidden = ['.workflow-builder-screen__panels', '.workflow-builder-screen__panels-done', '.workflow-builder-screen__scrim'];
    notPaintedAbove(ui, hidden);
    const panels = ruleExactly(ui, '.workflow-builder-screen__panels', PHONE);
    expect(valueOf(panels, 'display')).toBe('inline-flex');
    const share = ruleExactly(ui, ['.workflow-builder-screen__add-state', '.workflow-builder-screen__panels'], PHONE);
    expect(valueOf(share, 'min-height')).toBe('2.75rem');
    expect(valueOf(share, 'flex')).toBe('1 1 0');
    const done = ruleExactly(ui, '.workflow-builder-screen__panels-done', PHONE);
    expect(valueOf(done, 'display')).toBe('inline-flex');
    expect(valueOf(done, 'min-height')).toBe('2.75rem');
    expect(valueOf(done, 'align-self')).toBe('flex-end');
    // The base `display: none` precedes every phone rule that paints these, so the arm wins on source order.
    for (const selector of hidden) {
      expect(position(ui, hidden, null)).toBeLessThan(position(ui, [selector], PHONE));
    }
    after(ui, ['.workflow-builder-screen__add-state', '.workflow-builder-screen__panels'], [['.workflow-builder-screen__header']]);
  });
});

describe('21.171 the builder header wraps and Publish stays the one primary', () => {
  it('21.171 the title row stacks (name on its own row, ≥44px, smaller), the actions fill the width, and Publish — the one primary — is full width', () => {
    const row = ruleExactly(ui, '.workflow-builder-screen__title-row', PHONE);
    expect(valueOf(row, 'flex-direction')).toBe('column');
    expect(valueOf(row, 'align-items')).toBe('stretch');
    const name = ruleExactly(ui, '.workflow-builder-screen__name', PHONE);
    expect(valueOf(name, 'min-height')).toBe('2.75rem');
    expect(valueOf(name, 'font-size')).toBe('1.5rem');
    expect(valueOf(name, 'line-height')).toBe('2rem');
    expect(valueOf(ruleExactly(ui, '.workflow-builder-screen__actions', PHONE), 'width')).toBe('100%');
    expect(valueOf(ruleExactly(ui, '.publish-controls', PHONE), 'flex')).toBe('1 1 100%');
    expect(valueOf(ruleExactly(ui, '.publish-controls__publish', PHONE), 'align-self')).toBe('stretch');
    for (const selector of ['.workflow-builder-screen__title-row', '.workflow-builder-screen__name', '.workflow-builder-screen__actions', '.publish-controls', '.publish-controls__publish']) {
      after(ui, [selector]);
    }

    // CONTROL — the desktop header is unchanged: a wrapping row spread to the ends, a 2.125rem name, Publish at its
    // own width at the start.
    const base = ruleExactly(ui, '.workflow-builder-screen__title-row');
    expect(valueOf(base, 'flex-wrap')).toBe('wrap');
    expect(valueOf(base, 'justify-content')).toBe('space-between');
    expect(valueOf(base, 'flex-direction')).toBeNull();
    expect(valueOf(ruleExactly(ui, '.workflow-builder-screen__name'), 'font-size')).toBe('2.125rem');
    expect(valueOf(ruleExactly(ui, '.publish-controls__publish'), 'align-self')).toBe('flex-start');
    expect(valueOf(ruleExactly(ui, '.workflow-builder-screen__actions'), 'flex-wrap')).toBe('wrap');
  });
});

describe('21.172 workflow list / history / new: one column; the template doors stack', () => {
  it('21.172 the template doors are one column and the workflow cards are one column; above 40rem both stay auto-fit grids', () => {
    const doors = ruleExactly(ui, '.template-gallery__cards', PHONE);
    expect(valueOf(doors, 'grid-template-columns')).toBe('minmax(0, 1fr)');
    const cards = ruleExactly(ui, '.workflow-list__cards', PHONE);
    expect(valueOf(cards, 'grid-template-columns')).toBe('minmax(0, 1fr)');
    after(ui, ['.template-gallery__cards']);
    after(ui, ['.workflow-list__cards']);

    // CONTROL — the desktop grids are unchanged: the auto-fit tracks with their floors.
    expect(valueOf(ruleExactly(ui, '.template-gallery__cards'), 'grid-template-columns')).toBe('repeat(auto-fit, minmax(15rem, 1fr))');
    expect(valueOf(ruleExactly(ui, '.workflow-list__cards'), 'grid-template-columns')).toBe('repeat(auto-fit, minmax(20rem, 1fr))');
    // The door itself stays a ≥44px control and a block of its own.
    expect(valueOf(ruleExactly(ui, '.template-gallery__door'), 'min-height')).toBe('2.75rem');
  });

  it('21.172 New workflow is the card list’s one primary on its own full row, and Open / History share the card’s width; history stays a single column', () => {
    expect(valueOf(ruleExactly(ui, '.workflow-list__new', PHONE), 'flex')).toBe('1 1 100%');
    expect(valueOf(ruleExactly(ui, ['.workflow-list__open', '.workflow-list__history'], PHONE), 'flex')).toBe('1 1 0');
    after(ui, ['.workflow-list__new'], [['.workflow-list__header']]);
    after(ui, ['.workflow-list__open', '.workflow-list__history'], [['.workflow-list__actions']]);

    // CONTROL — the history is a single column at every width (no phone arm needed), its header wraps, and the list
    // header row is the desktop one.
    const versions = ruleExactly(ui, '.workflow-history__versions');
    expect(valueOf(versions, 'display')).toBe('flex');
    expect(valueOf(versions, 'flex-direction')).toBe('column');
    expect(valueOf(ruleExactly(ui, '.workflow-history__header'), 'flex-wrap')).toBe('wrap');
    expect(valueOf(ruleExactly(ui, '.workflow-list__header'), 'flex-wrap')).toBe('wrap');
    expect(valueOf(ruleExactly(ui, '.workflow-list__actions'), 'flex-wrap')).toBe('wrap');
  });
});

describe('21.173 ticket types: form fields full width; the reorder targets stay ≥44px', () => {
  it('21.173 the field rows put the name and type on a full row each, Add field fills the width, and Save takes its own row; the editor stacks', () => {
    const fields = ruleExactly(ui, ['.fields-editor__name', '.fields-editor__type'], PHONE);
    expect(valueOf(fields, 'flex')).toBe('1 1 100%');
    expect(valueOf(fields, 'min-width')).toBe('0');
    expect(valueOf(ruleExactly(ui, '.fields-editor__add', PHONE), 'align-self')).toBe('stretch');
    expect(valueOf(ruleExactly(ui, '.ticket-type-editor__save', PHONE), 'flex')).toBe('1 1 100%');
    expect(valueOf(ruleExactly(globals, '.gn-type-editor-header__actions', PHONE), 'flex')).toBe('1 1 100%');
    expect(valueOf(ruleExactly(ui, '.ticket-type-list__new', PHONE), 'flex')).toBe('1 1 100%');
    after(ui, ['.fields-editor__name', '.fields-editor__type'], [['.fields-editor__name'], ['.fields-editor__type']]);
    after(ui, ['.fields-editor__add']);
    after(ui, ['.ticket-type-editor__save']);
    after(ui, ['.ticket-type-list__new'], [['.ticket-type-list__header']]);
    after(globals, ['.gn-type-editor-header__actions']);
    // The two-column editor stacks at the phone width (it did before this task; pinned so it stays so).
    expect(valueOf(ruleExactly(ui, '.ticket-type-editor__layout', PHONE), 'grid-template-columns')).toBe('minmax(0, 1fr)');
    after(ui, ['.ticket-type-editor__layout']);

    // CONTROL — desktop is unchanged: the field row floors, Add field at its own width, Save at the start.
    expect(valueOf(ruleExactly(ui, '.fields-editor__name'), 'flex')).toBe('1 1 10rem');
    expect(valueOf(ruleExactly(ui, '.fields-editor__type'), 'flex')).toBe('0 1 9rem');
    expect(valueOf(ruleExactly(ui, '.fields-editor__add'), 'align-self')).toBe('flex-start');
    expect(valueOf(ruleExactly(ui, '.ticket-type-editor__save'), 'align-self')).toBe('flex-start');
    expect(valueOf(ruleExactly(ui, '.ticket-type-editor__layout'), 'grid-template-columns')).toBe('minmax(0, 1fr) minmax(0, 18rem)');
  });

  it('21.173 the ↑/↓ reorder buttons are ≥44px square at every width: the base is 2.75rem both ways and no phone rule narrows it', () => {
    const move = ruleExactly(ui, '.ticket-type-list__move');
    expect(valueOf(move, 'min-height')).toBe('2.75rem');
    expect(valueOf(move, 'min-width')).toBe('2.75rem');
    // No phone arm redeclares the size (a narrower phone override would be the regression).
    const narrowing = parseRules(ui).filter(
      (rule) => rule.atRule !== null && rule.selectors.includes('.ticket-type-list__move') && /min-(height|width)/.test(rule.body),
    );
    expect(narrowing).toEqual([]);
    // CONTROL — the reorder pair keeps its gap, so the two targets are not touching (≥8px between).
    expect(valueOf(ruleExactly(ui, '.ticket-type-list__reorder'), 'gap')).toBe('0.5rem');
  });
});

describe('21.177 the builder\u2019s "Settings \u203a Workflows" crumb has a 44px hit box without moving a pixel of the drawn page', () => {
  /**
   * Found by the T13 browser pass (2026-10-01): 126x15 at every phone width and every style x theme, and `elementFromPoint`
   * at 44px landed on the page, not the link. `.gn-breadcrumb a` got its hit-slop in 20.616; this crumb is a different class
   * (`.gn-builder-crumb`), so the rule never reached it. HIT-SLOP and not padding, because the builder's height calc subtracts
   * the crumb's gap and line (`--gn-builder-crumb-gap` / `--gn-builder-crumb-line`) and padding would push the canvas off the screen.
   */
  it('21.177 the link is the positioning context; a centred, empty, 2.75rem-tall ::before reaches 44px and paints nothing', () => {
    expect(valueOf(ruleExactly(globals, '.gn-builder-crumb a'), 'position')).toBe('relative');
    const slop = ruleExactly(globals, '.gn-builder-crumb a::before');
    expect(valueOf(slop, 'content')).toBe("''");
    expect(valueOf(slop, 'position')).toBe('absolute');
    expect(valueOf(slop, 'top')).toBe('50%');
    expect(valueOf(slop, 'height')).toBe('2.75rem');
    expect(valueOf(slop, 'margin-top')).toBe('-1.375rem');
    expect(valueOf(slop, 'left')).toBe('-0.25rem');
    expect(valueOf(slop, 'right')).toBe('-0.25rem');
    for (const property of ['background', 'background-color', 'border', 'box-shadow', 'outline', 'color', 'opacity']) {
      expect(valueOf(slop, property), `::before ${property}`).toBeNull();
    }
  });

  it('21.177 CONTROL \u2014 the drawn crumb is as it was: the link adds no padding / margin / display / min-height, and the crumb keeps the gap and line the builder\u2019s height calc subtracts', () => {
    const link = ruleExactly(globals, '.gn-builder-crumb a');
    for (const property of ['padding', 'margin', 'display', 'min-height']) expect(valueOf(link, property), `.gn-builder-crumb a ${property}`).toBeNull();
    expect(valueOf(link, 'font-size')).toBe('0.8125rem');
    expect(valueOf(link, 'line-height')).toBe('1.125rem');
    const crumb = ruleExactly(globals, '.gn-builder-crumb');
    expect(valueOf(crumb, 'margin')).toBe('var(--gn-builder-crumb-gap) 0 0');
    expect(valueOf(crumb, 'line-height')).toBe('var(--gn-builder-crumb-line)');
  });
});
