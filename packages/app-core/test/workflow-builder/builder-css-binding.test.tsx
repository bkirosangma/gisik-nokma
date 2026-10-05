import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { CONTRAST_PAIRS } from '@gisik-nokma/ui';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.js';
import { BuilderPanels } from '../../src/workflow-builder/ui/builder-panels.js';
import { WorkflowBuilderScreen } from '../../src/workflow-builder/ui/workflow-builder-screen.js';

/**
 * 13.767 — THE BUILDER SCREEN'S FOUR BEM FAMILIES AND THE RULES THAT STYLE THEM
 * ARE ONE FACT SPELLED IN TWO PACKAGES, AND NOTHING ELSE TIES THE SPELLINGS.
 *
 * This is the fourth file of this shape in the product — `timeline-view.test.tsx`
 * built the first, `inbox-css-binding.test.tsx` generalised it to a SET
 * EQUALITY, `saved-filters-css-binding.test.tsx` carried it across the
 * app-core/ui boundary, and this one applies it to `isBuilder`. The technique is
 * theirs, deliberately unchanged so the four read as one instrument: harvest the
 * classes the stylesheet names and the classes the component renders, and
 * compare the SETS.
 *
 * WHY THIS SCREEN NEEDED IT MOST. `workflow-builder-screen`,
 * `state-inspector`, `inspector-panel` and `transition-inspector` shipped with
 * ZERO CSS — every element under all four rendered with user-agent defaults
 * (measured 2026-09-18, `docs/design/prototype-delta-2026-09-18.md:666`, with a
 * control: the same sweep returns 7 rules for `.issues-panel`, 11 for
 * `.publish-controls`, 15 for `.gn-state-node` and 40 for `.ticket-type-editor`).
 * A rename on either side of the ui/app-core boundary is therefore invisible to
 * both packages' own gates, and the failure it produces is the quiet kind: a
 * screen that renders, and is unstyled.
 *
 * THE EXEMPTION IS A RULE, NOT A LIST. `.workflow-builder-screen__add-state`
 * carries no rule of its own and should not: it sits on the shared `<Button>`,
 * whose `.gn-button` block styles it. A typed list of "classes that are allowed
 * to be unstyled" would be a third spelling of each and would silently absorb
 * the next one; instead an element is exempt exactly when it ALSO carries a
 * class from the shared component layer. The rule cannot grow by accident, and
 * the test below proves it fires on the one element that qualifies today.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const CSS_PATH = join(REPO_ROOT, 'packages/ui/src/ui.css');
/** `.gn-page-title` lives in the WEB stylesheet, not `ui.css` — measured. */
const WEB_CSS_PATH = join(REPO_ROOT, 'apps/web/app/globals.css');

const PREFIXES = [
  'workflow-builder-screen',
  'state-inspector',
  'builder-panel',
  'builder-row',
  'transition-inspector',
];

/** The shared layer that styles an element in place of its own BEM hook. */
const SHARED_COMPONENT_PREFIXES = ['gn-button', 'gn-field', 'gn-select'];

function belongsTo(name: string, prefix: string): boolean {
  return name === prefix || name.startsWith(`${prefix}__`) || name.startsWith(`${prefix}--`);
}

function isOurs(name: string): boolean {
  return PREFIXES.some((prefix) => belongsTo(name, prefix));
}

/**
 * Comments stripped FIRST, for the reason `saved-filters-css-binding.test.tsx`
 * records: this block's docblock names other blocks' selectors and even the
 * prototype's `--tintDanger`, and a deleted rule must not stay styled out of the
 * prose that explains why it was never written.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Every class these four families are STYLED under, anywhere in the file.
 *
 * `[A-Za-z]`, NOT `[a-z]`, and the uppercase half is load-bearing rather than
 * tidy. `saved-filters-css-binding.test.tsx` uses `[A-Za-z0-9_-]*` and this
 * file first shipped without the capitals — which made the equality BLIND to a
 * rename that introduced one: `.workflow-builder-screen__canvas` renamed to
 * `…__canvasRenamed` matched only as far as `…__canvas`, so the old name kept
 * being harvested and the set never changed. Measured both ways below.
 */
function styledClasses(css: string): string[] {
  const hits = [...stripComments(css).matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].flatMap(
    (hit) => hit[1] ?? [],
  );
  return [...new Set(hits.filter(isOurs))].sort();
}

function renderedClasses(root: ParentNode): string[] {
  const hits = [...root.querySelectorAll<HTMLElement>('*')].flatMap((element) => [
    ...element.classList,
  ]);
  return [...new Set(hits.filter(isOurs))].sort();
}

function carriesSharedComponentClass(element: HTMLElement): boolean {
  return [...element.classList].some((name) =>
    SHARED_COMPONENT_PREFIXES.some((prefix) => belongsTo(name, prefix)),
  );
}

/** The rendered classes that are exempt because a shared block styles them. */
function exemptClasses(root: ParentNode): string[] {
  const hits = [...root.querySelectorAll<HTMLElement>('*')]
    .filter(carriesSharedComponentClass)
    .flatMap((element) => [...element.classList].filter(isOurs));
  return [...new Set(hits)].sort();
}

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

function renderedFocusableClasses(root: ParentNode): string[] {
  const hits = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].flatMap((element) => [
    ...element.classList,
  ]);
  return [...new Set(hits.filter(isOurs))].sort();
}

function renderedExemptFocusableClasses(root: ParentNode): string[] {
  const hits = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter(carriesSharedComponentClass)
    .flatMap((element) => [...element.classList].filter(isOurs));
  return [...new Set(hits)].sort();
}

/**
 * The declarations of the rule whose selector LIST contains `selector` exactly.
 *
 * Not anchored to the start of a line, because four of this block's rules share
 * a selector list across two lines (`.state-inspector,\n.transition-inspector {`),
 * and not `^…$`-anchored for the same reason `saved-filters-css-binding.test.tsx`
 * gives: an anchored read finds the rule only when it happens to be spelled
 * alone, which is a property of the file's layout rather than of the rule.
 */
function declarationsFor(css: string, selector: string): string | null {
  const hit = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((rule) =>
    (rule[1] ?? '')
      .split(',')
      .map((part) => part.trim())
      .includes(selector),
  );
  return hit?.[2] ?? null;
}

/** Every class these families ring with a `:focus-visible` rule. */
function focusVisibleClasses(css: string): string[] {
  const hits = [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((rule) =>
    [...(rule[1] ?? '').matchAll(/\.([A-Za-z][A-Za-z0-9_-]*):focus-visible/g)].flatMap(
      (hit) => hit[1] ?? [],
    ),
  );
  return [...new Set(hits.filter(isOurs))].sort();
}

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;
const session = { userId: newUlid(), role: 'admin' as const };

function environmentFor(): BuilderEnvironment {
  return {
    workspaceId: newUlid(),
    session,
    gateway: createFakeGateway(),
    members: [],
    ticketTypes: [],
    canAuthor: true,
  };
}

function renderPanel(store: DraftStore) {
  return render(
    <BuilderProvider store={store} env={environmentFor()}>
      <BuilderPanels />
    </BuilderProvider>,
  );
}

function screenWith(gateway: ReturnType<typeof createFakeGateway>) {
  return render(
    <WorkflowBuilderScreen
      workspaceId={newUlid()}
      session={session}
      gateway={gateway}
      initialDraft={draftFromTemplate(kanban)}
    />,
  );
}

/**
 * EVERY ARM OF EVERY CONDITIONAL, in one union — the maximal-fixture discipline
 * `saved-filters-css-binding.test.tsx` records. A fixture that rendered only the
 * loaded screen would leave `__loading` and `__load-error` styled and
 * unrendered, and the tempting repair is to weaken the equality to a subset,
 * which throws away half the finding. Render the missing arms instead.
 *
 * Six arms: loading, loaded, load-refused, and the inspector's three selections
 * (none, a state, a transition with a rule). The transition arm needs a rule
 * because `__rule` and `__rule-summary` only render for one — the same
 * `addRule(2, …)` `inspectors.test.tsx:166` uses.
 */
async function collectClasses(): Promise<{ rendered: string[]; exempt: string[]; focusable: string[]; focusableExempt: string[] }> {
  const rendered = new Set<string>();
  const exempt = new Set<string>();
  const focusable = new Set<string>();
  const focusableExempt = new Set<string>();
  const absorb = (container: HTMLElement): void => {
    for (const name of renderedClasses(container)) rendered.add(name);
    for (const name of exemptClasses(container)) exempt.add(name);
    for (const name of renderedFocusableClasses(container)) focusable.add(name);
    for (const name of renderedExemptFocusableClasses(container)) focusableExempt.add(name);
  };

  const withFake = async (
    gateway: ReturnType<typeof createFakeGateway>,
    settled: () => Promise<unknown>,
  ): Promise<void> => {
    const { container } = screenWith(gateway);
    await settled();
    absorb(container);
    cleanup();
  };

  // 1 — the loading arm. `render` is wrapped in `act`, which flushes the mount
  // effect AND its microtasks, so a gateway that resolves is already past this
  // arm by the time `render` returns. A promise that never settles is the only
  // way to hold the screen in it — harvesting synchronously would be a race the
  // first `await` anywhere in this file could lose.
  await withFake(
    { ...createFakeGateway(), listTicketTypes: () => new Promise(() => {}) },
    async () => {},
  );

  // 2 — the loaded arm.
  await withFake(createFakeGateway(), () =>
    screen.findByRole('textbox', { name: 'Workflow name' }),
  );

  // 2b — the loaded arm with the phone Panels sheet OPEN: the scrim renders only then (21.170).
  await withFake(createFakeGateway(), async () => {
    await screen.findByRole('textbox', { name: 'Workflow name' });
    fireEvent.click(screen.getByRole('button', { name: 'Panels' }));
  });

  // 3 — the load-refused arm. Only `listTicketTypes` is fatal to this screen
  // (a member's roster refusal is an empty roster, not a failure), so that is
  // the read made to reject.
  await withFake(
    {
      ...createFakeGateway(),
      listTicketTypes: () => Promise.reject(new Error('HTTP 500 for /v1/workspaces/x/ticket-types')),
    },
    () => screen.findByText('Could not load workspace people and types. Reload to try again.'),
  );

  // 4, 5, 6 — the panels' three selections.
  absorb(renderPanel(createDraftStore(draftFromTemplate(kanban))).container);
  cleanup();

  // 6b (W1, 2026-09-30) — the empty arm: no states and no transitions, so `builder-panel__empty` renders.
  const emptyDraft = draftFromTemplate(kanban);
  absorb(renderPanel(createDraftStore({ ...emptyDraft, def: { ...emptyDraft.def, states: [], transitions: [] } })).container);
  cleanup();

  const stateStore = createDraftStore(draftFromTemplate(kanban));
  stateStore.actions.select({ kind: 'state', stateId: 'doing' });
  absorb(renderPanel(stateStore).container);
  cleanup();

  const transitionStore = createDraftStore(draftFromTemplate(kanban));
  transitionStore.actions.addRule(2, { kind: 'require-evidence' });
  transitionStore.actions.select({ kind: 'transition', index: 2 });
  absorb(renderPanel(transitionStore).container);
  cleanup();

  return {
    rendered: [...rendered].sort(),
    exempt: [...exempt].sort(),
    focusable: [...focusable].sort(),
    focusableExempt: [...focusableExempt].sort(),
  };
}

describe('13.767 the builder screen is styled, and the scanners are proven before they are trusted', () => {
  it('reads classes out of selectors, ignores commented-out ones, and is not fooled by a prefix', () => {
    const planted = [
      '/* .workflow-builder-screen__ghost { color: red; } — a rule that was DELETED */',
      '.workflow-builder-screen { background: var(--gn-surface); }',
      '.state-inspector .state-inspector__title { color: var(--gn-text); }',
      '.gn-state-node { color: inherit; }',
      '.workflow-builder-screenie { color: inherit; }',
    ].join('\n');
    expect(styledClasses(planted)).toEqual([
      'state-inspector',
      'state-inspector__title',
      'workflow-builder-screen',
    ]);
  });

  it('catches a rename that introduces an UPPERCASE letter — the hole this file first shipped with', () => {
    // `[a-z][a-z0-9_-]*` stops at the first capital, so `…__canvasRenamed`
    // harvested as `…__canvas` and a rename that deleted a rule's whole body
    // stayed invisible. Both spellings, so the fix cannot regress to either
    // half, and `declarationsFor`' own selector walk is checked against the
    // same pair below.
    expect(styledClasses('.workflow-builder-screen__canvasRenamed { box-shadow: x; }')).toEqual([
      'workflow-builder-screen__canvasRenamed',
    ]);
    expect(styledClasses('.workflow-builder-screen__canvasrenamed { box-shadow: x; }')).toEqual([
      'workflow-builder-screen__canvasrenamed',
    ]);
    expect(declarationsFor('.workflow-builder-screen__canvasRenamed { x: y; }', '.workflow-builder-screen__canvasRenamed')).toBe(' x: y; ');
    expect(declarationsFor('.workflow-builder-screen__canvasRenamed { x: y; }', '.workflow-builder-screen__canvas')).toBeNull();
  });

  it('reads classes off a rendered tree and ignores classes from other blocks', () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<div class="workflow-builder-screen"><span class="state-inspector__title gn-state-node"></span></div>';
    expect(renderedClasses(host)).toEqual(['state-inspector__title', 'workflow-builder-screen']);
  });

  it('the exemption is a RULE — it fires on a shared-component element and on nothing else', () => {
    const host = document.createElement('div');
    host.innerHTML = [
      '<button class="gn-button gn-button--ghost workflow-builder-screen__add-state"></button>',
      '<input class="gn-field__input state-inspector__bare" />',
      '<div class="workflow-builder-screen__layout"></div>',
    ].join('');
    expect(exemptClasses(host)).toEqual([
      'state-inspector__bare',
      'workflow-builder-screen__add-state',
    ]);
  });
});

describe('13.767 every class the builder screen renders is a class ui.css styles, and the reverse', () => {
  const css = readFileSync(CSS_PATH, 'utf8');

  it('the two sets are EQUAL once the shared-component exemptions are removed', async () => {
    const { rendered, exempt } = await collectClasses();
    const unexempted = rendered.filter((name) => !exempt.includes(name));
    // The shared-component elements are styled in place by the shared layer, so the equality leaves them out of
    // BOTH sides: the phone arm (21.170) also gives three of them a rule of their own, which is not a reason
    // to demand the other half of the pair render them as plain classes.
    const styled = styledClasses(css).filter((name) => !exempt.includes(name));

    // FLOORS, not counts — the reason `saved-filters-css-binding.test.tsx`
    // records: two empty walks are equal, and an equality of two empty lists
    // must not pass for agreement. Raise them when the block grows; never type
    // the names, because a typed list would be a THIRD spelling of every class.
    expect(rendered.length).toBeGreaterThanOrEqual(16);
    expect(styled.length).toBeGreaterThanOrEqual(16);

    expect(unexempted).toEqual(styled);
  });

  it('the exemption set is exactly the shared-component elements, and it is not silently empty', async () => {
    // Stated separately from the equality above so a build where the rule broke
    // and matched nothing cannot pass by making the two lists agree for the
    // wrong reason: with an empty exemption the equality would fail on
    // `__add-state`, and with the rule working it must name exactly that class.
    const { rendered, exempt } = await collectClasses();
    // `__panels` and `__panels-done` are the phone Panels sheet's two `Button`s (21.170) — shared-component elements too.
    // AMENDED 2026-10-05 (G-9 T5, 25.545): so is the header's "Full screen" `Button`, `__fullscreen`.
    expect(exempt).toEqual([
      'workflow-builder-screen__add-state',
      'workflow-builder-screen__fullscreen',
      'workflow-builder-screen__panels',
      'workflow-builder-screen__panels-done',
    ]);
    expect(rendered).toContain('workflow-builder-screen__add-state');
    // The scrim renders only while the sheet is open — the open arm above is what puts it in the set.
    expect(rendered).toContain('workflow-builder-screen__scrim');
  });

  it('every control a person can tab to is in the focus-ring rule, and the reverse', async () => {
    const { focusable, focusableExempt } = await collectClasses();
    const unexempted = focusable.filter((name) => !focusableExempt.includes(name));
    const ringed = focusVisibleClasses(css);

    expect(unexempted.length).toBeGreaterThanOrEqual(1);
    expect(ringed).toEqual(unexempted);
  });

  /**
   * 13.771 — THE DECLARATIONS, WHICH THE NAME EQUALITY ABOVE CANNOT SEE.
   *
   * The equality compares CLASS NAMES, and a rule can lose its body while its
   * selector keeps being named somewhere else in the file. This is not
   * hypothetical and it is not inherited: it was MEASURED against this file.
   * Renaming `.workflow-builder-screen__canvas` to `…__canvasRenamed` — which
   * deletes the card treatment and leaves the class rendering unstyled — left
   * every test above GREEN.
   *
   * **THE CAUSE RECORDED HERE WAS WRONG ONCE, AND THE CORRECTION IS THE POINT.**
   * It first said the survival was because the `@media (max-width: 64rem)` rule
   * below still names `__canvas` in `{ order: -1 }`. That is not the mechanism.
   * The mechanism is the HARVEST REGEX: `[a-z][a-z0-9_-]*` stops at the first
   * uppercase letter, so `…__canvasRenamed` matched only as far as `…__canvas`
   * and the OLD name kept entering the set from the renamed rule itself. The
   * media-query mention was a second, redundant source of the same name. The
   * two are distinguishable and were separated: `…__canvasrenamed`, all
   * lowercase, DOES redden the equality (nothing truncates), while
   * `…__canvasRenamed` reddens only this table. Both are asserted below.
   *
   * That distinction is why the regexes in this file now carry `[A-Za-z]`, and
   * why the first case in this describe block is a planted measurement of it: a
   * recorded mechanism that a one-line probe refutes is worse than no mechanism,
   * because the next author writes against the wrong hazard.
   *
   * The table names one load-bearing declaration per top-level rule of the
   * block — the ones whose loss would be visible on screen — rather than
   * restating every declaration, which would be a copy of the stylesheet that
   * has to be updated twice.
   */
  it('13.771 every rule in the block still carries the declaration that makes it do something', () => {
    // EVERY selector the block styles, not a sample: the first version of this
    // table named fourteen and left `__load-error`, `__rules`, `__rule-summary`
    // and the two inspector titles unpinned, so emptying any of their bodies
    // removed its treatment with all thirteen tests green — the same class of
    // hole this case exists to close, at a smaller radius.
    const expected: [selector: string, declaration: string][] = [
      ['.workflow-builder-screen', 'display: flex'],
      ['.workflow-builder-screen__load-error', 'color: var(--gn-text)'],
      ['.workflow-builder-screen__header', 'flex-direction: column'],
      ['.workflow-builder-screen__title-row', 'justify-content: space-between'],
      ['.workflow-builder-screen__actions', 'flex-wrap: wrap'],
      ['.workflow-builder-screen__name', 'font-size: var(--gn-title-page)'], // 34px (AMENDED 2026-10-02, UX fixes Task 5, case 23.070)
      ['.workflow-builder-screen__name:focus-visible', 'var(--gn-focus-ring)'],
      ['.workflow-builder-screen__name:disabled', 'var(--gn-surface-sunken)'],
      [
        '.workflow-builder-screen__layout',
        // Amended 2026-09-30 (W1): two columns — the right rail is gone; its inspectors expand in the left lists.
        'grid-template-columns: minmax(0, 22rem) minmax(0, 1fr)',
      ],
      ['.workflow-builder-screen__left', 'flex-direction: column'],
      // Amended 2026-09-29 by 20.351 (styling refresh Plan B): the canvas is a P-RAISED panel now, lifted by `shadow-lift` (was `shadow-raised`).
      ['.workflow-builder-screen__canvas', 'box-shadow: var(--gn-shadow-lift)'],
      ['.state-inspector', 'border-radius: var(--gn-radius-card)'],
      ['.state-inspector__title', 'font-size: 0.9rem'],
      ['.state-inspector__actions', 'flex-wrap: wrap'],
      ['.transition-inspector', 'border-radius: var(--gn-radius-card)'],
      ['.transition-inspector__title', 'font-size: 0.9rem'],
      ['.transition-inspector__rules', 'flex-direction: column'],
      ['.transition-inspector__rule', 'border-left: 2px solid var(--gn-border)'],
      ['.transition-inspector__rule-summary', 'font-size: 0.85rem'],
      ['.transition-inspector__actions', 'flex-wrap: wrap'],
      // W1 (2026-09-30, case 10.154): the States / Transitions panels (replace the retired `.inspector-panel__hint`).
      ['.builder-panel', 'background: var(--gn-surface-raised)'],
      ['.builder-panel__list', 'flex-direction: column'],
      ['.builder-row__head', 'min-height: 2.75rem'],
      ['.builder-row__head:hover', 'var(--gn-fill-quaternary)'],
      ['.builder-row__head:focus-visible', 'var(--gn-focus-ring)'],
      ['.builder-row__body', 'background: var(--gn-surface-well)'],
    ];
    for (const [selector, declaration] of expected) {
      expect(
        declarationsFor(ALL_ROLES_IN_UI_CSS, selector),
        `${selector} lost "${declaration}"`,
      ).toContain(declaration);
    }
    // And the neo override, which is a rule of its own and not reachable by the
    // loop above (its selector is a compound starting with an attribute).
    const neo =
      /\[data-style="neo"\] \.workflow-builder-screen__name\s*\{([^}]*)\}/.exec(ALL_ROLES_IN_UI_CSS)?.[1] ?? '';
    // amended 2026-10-02 by N10 (case 24.040): the rim-less neo field reads the `field` shadow, not `sunken`.
    expect(neo).toContain('box-shadow: var(--gn-shadow-field)');
  });

  /**
   * 13.774 — THE SHARED CLASS THE INSPECTOR'S INPUT MUST CARRY, WHICH NOTHING
   * ELSE IN THIS FILE CAN SEE.
   *
   * The equality above is scoped to the four builder families, so it is
   * structurally blind to `.gn-field__input` — a class from the shared layer,
   * outside every prefix it harvests. Measured by an independent reviewer:
   * deleting `className="gn-field__input"` from
   * `state-inspector.tsx:53`'s `<input>` survives all thirteen cases above AND
   * the whole app-core package (1473 passing), while silently reverting the
   * field to a bare `<input>` with user-agent defaults — the exact defect this
   * change exists to fix — and the docblock there claims it "inherits the
   * measured contrast pair and the `[data-style=\"neo\"]` sunken override for
   * free".
   *
   * Rendered and read off the DOM, not grepped from the source: a source read
   * would pass against the class sitting on the wrong element.
   */
  it('13.774 the inspector name field carries the shared gn-field classes it claims to inherit', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'state', stateId: 'doing' });
    const { container } = renderPanel(store);

    const field = container.querySelector('.state-inspector .gn-field');
    expect(field).not.toBeNull();
    expect(field?.querySelector('.gn-field__label')).not.toBeNull();
    const input = container.querySelector<HTMLInputElement>('.state-inspector input');
    expect(input).not.toBeNull();
    expect([...(input?.classList ?? [])]).toContain('gn-field__input');
    // CONTROL: the same render really produced the inspector, so a null above
    // cannot be mistaken for "the field is correct".
    expect(container.querySelector('.state-inspector__title')).not.toBeNull();
    cleanup();
  });

  /**
   * 13.775 — THE INSPECTORS' ACTIONS ARE THE SHARED BUTTON, AND THE DESTRUCTIVE
   * TWO ARE THE SHARED QUIET DANGER VARIANT.
   *
   * Same structural blindness as 13.774: `.gn-button` and `.gn-button--danger`
   * are outside every harvested prefix, so the four controls that moved off bare
   * `<button>`s onto the component could revert to user-agent defaults with
   * every other test in this repo green. The variant is `danger-quiet` (UX fixes
   * T2, case 23.022), the one `fields-editor.tsx:151` wears; the filled `danger`
   * is the confirm dialog's and none of these wear it.
   */
  it('13.775 the inspector actions are the shared Button, danger-styled where they destroy', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'state', stateId: 'doing' });
    const { container } = renderPanel(store);

    const buttonClasses = [...container.querySelectorAll('.state-inspector button')].map((node) => [
      ...node.classList,
    ]);
    expect(buttonClasses.length).toBe(2);
    for (const classes of buttonClasses) expect(classes).toContain('gn-button');
    // Exactly one is danger, and it is the one that deletes; it is the OUTLINED variant, never the filled one.
    const danger = [...container.querySelectorAll('.state-inspector .gn-button--danger-quiet')];
    expect(danger).toHaveLength(1);
    expect(danger[0]?.textContent).toBe('Delete state');
    expect(container.querySelectorAll('.state-inspector .gn-button--danger')).toHaveLength(0);
    cleanup();

    const transitionStore = createDraftStore(draftFromTemplate(kanban));
    transitionStore.actions.addRule(2, { kind: 'require-evidence' });
    transitionStore.actions.select({ kind: 'transition', index: 2 });
    const second = renderPanel(transitionStore).container;
    // Remove rule, Delete transition — both destructive, both the quiet danger variant (never the filled one).
    expect([...second.querySelectorAll('.transition-inspector .gn-button--danger-quiet')]).toHaveLength(2);
    expect(second.querySelectorAll('.transition-inspector .gn-button--danger')).toHaveLength(0);
    cleanup();
  });
});

const ALL_ROLES_IN_UI_CSS = stripComments(readFileSync(CSS_PATH, 'utf8'));
const WEB_CSS = stripComments(readFileSync(WEB_CSS_PATH, 'utf8'));

describe('13.768 the new block names no colour of its own and adds no role', () => {
  it('every custom property it uses is one the stylesheet already draws with', () => {
    // `packages/ui/test/token-discipline.test.ts` already refuses a hex
    // anywhere in client source; what it cannot say is that this block reuses
    // EXISTING roles rather than inventing `--gn-builder-ink`. Harvested by
    // SELECTOR, not by slicing from some offset to EOF — the positional read
    // `saved-filters-css-binding.test.tsx` had to replace, because a block that
    // happens to be last works until the next task appends CSS after it.
    const rules = [...ALL_ROLES_IN_UI_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const ruleNamesOurs = (selector: string): boolean =>
      [...selector.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].some((hit) => isOurs(hit[1] ?? ''));
    const block = rules
      .filter((rule) => ruleNamesOurs(rule[1] ?? ''))
      .map((rule) => rule[2] ?? '')
      .join('\n');
    // The web app's own stylesheet counts as "the stylesheet already draws with": the phone arm reads
    // `--gn-phone-bar-height`, which globals.css declares and draws with (21.003, 10.164).
    const outside = [...rules, ...WEB_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((rule) => !ruleNamesOurs(rule[1] ?? ''))
      .map((rule) => rule[2] ?? '')
      .join('\n');

    expect(block.length).toBeGreaterThan(0);
    // `[a-z0-9-]`, NOT `[a-z-]`: no role this product ships contains a digit
    // today, so the digit-free class is exactly blind to the case the check
    // exists to refuse — a FUTURE role spelled `--gn-fill-2`. Measured: with
    // `[a-z-]`, planting `color: var(--gn-ink-2)` inside the block stays GREEN
    // while the identical `var(--gn-ink)` reddens.
    const used = [
      ...new Set([...block.matchAll(/var\((--gn-[a-z0-9-]+)\)/g)].flatMap((hit) => hit[1] ?? [])),
    ];
    // The floor is the count this block actually uses today (eleven distinct
    // roles), so a rule that silently stopped contributing declarations cannot
    // pass as "no new roles".
    expect(used.length).toBeGreaterThanOrEqual(11);
    for (const role of used) {
      expect(outside, `${role} is a NEW role, not one the stylesheet already draws with`).toContain(
        `var(${role})`,
      );
    }
  });
});

/**
 * 13.769 — WHAT THE PROTOTYPE DRAWS HERE THAT THE PRODUCT CANNOT BACK, AND WHAT
 * IT DRAWS THAT THE PRODUCT BACKS SOMEWHERE ELSE.
 *
 * The owner's instruction was "if the backend is already built, then make the
 * design just fit for it" — a constraint in two halves, and this is the second
 * one: a drawing is not a requirement. Every case below is an ABSENCE the port
 * refuses, paired with the control that the surface it refuses to invent is
 * still reachable where the product actually keeps it. Read the pairs, not the
 * assertions: a bare `not.toBeInTheDocument()` passes just as well against a
 * screen that never had the element, which is the check that cannot fail.
 */
describe('13.769 the prototype’s unbacked controls are absent, and the real ones keep their homes', () => {
  const DRAFT = draftFromTemplate(kanban);

  it('the header carries no "last saved" status line and no Cancel — neither has any backing state', async () => {
    screenWith(createFakeGateway());
    await screen.findByRole('textbox', { name: 'Workflow name' });
    // `wfStatus`, `lastSaved` and `last saved` are 0 hits repo-wide
    // (`docs/design/prototype-delta-2026-09-18.md:667`), so there is nothing to
    // render and nothing to compute one from.
    expect(screen.queryByText(/last saved/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Draft/)).not.toBeInTheDocument();
    // The Cancel button's warrant is DIFFERENT and is not the 0-hit measurement
    // above, which does not cover it. The prototype's `isBuilder` block draws no
    // Cancel at all (`:1013-1093` — breadcrumb, h1, `wfStatus`, Add state,
    // Publish); the Cancel the first draft of this comment inherited comes from
    // `docs/hig-reconciliation-audit.md:705`, which describes a header the
    // drawing does not show. So this asserts the absence of something the
    // reference itself does not have, which is worth pinning for a different
    // reason: it is the control that the header really mounted.
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    // CONTROL: the header is present and carries the two actions that ARE real,
    // so the absences above are not "the header failed to render".
    expect(screen.getByRole('button', { name: 'Add state' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('the inspector draws no Category select, no Blocked toggle and no Initial-state switch — and the node still does', async () => {
    const store = createDraftStore(DRAFT);
    store.actions.select({ kind: 'state', stateId: 'doing' });
    const { container } = renderPanel(store);
    const inspector = within(container);

    // The prototype's consolidated card (`desktop.dc.html@6d7b67c0a52c:1080-1090`)
    // puts these three in the right rail; `docs/hig-reconciliation-audit.md:703-708`
    // ruled that card "SHOWN BUT DOES NOT EXIST. Do not build". Moving them here
    // would be a product change to a tested layout, not a design fit.
    //
    // Queried as `button` with the regex `canvas.test.tsx:77` and
    // `access.test.tsx:305` already use, not as `combobox` with an exact name:
    // the shared `Select` renders its trigger as a `<button>` whose accessible
    // name is not exactly the `aria-label` it was handed.
    expect(inspector.queryByRole('button', { name: /Category/ })).not.toBeInTheDocument();
    expect(inspector.queryByRole('checkbox', { name: 'Blocked' })).not.toBeInTheDocument();
    expect(inspector.queryByRole('switch')).not.toBeInTheDocument();
    // CONTROL, in the same run: the state inspector really did mount, with the
    // two controls it does own.
    expect(inspector.getByRole('textbox', { name: 'State name' })).toBeInTheDocument();
    expect(inspector.getByRole('button', { name: 'Set as start' })).toBeInTheDocument();
    cleanup();

    // The same two controls, refused in the rail, are still where the product
    // puts them. This needs the WHOLE screen, because the canvas is what renders
    // them — a control that only checked the rail would pass just as well
    // against a product that had deleted them outright.
    const node = screenWith(createFakeGateway());
    // `findAllByRole`, not `findByRole`: there is one Category picker PER canvas
    // state node (`access.test.tsx:305` counts five on this template), which is
    // the shape "the control lives on the node" actually has.
    const canvas = await node.findAllByRole('button', { name: /Category/ });
    expect(canvas.length).toBeGreaterThan(0);
    expect(screen.getAllByRole('checkbox', { name: 'Blocked' }).length).toBeGreaterThan(0);
  });
});

/**
 * 13.770 — THE TITLE IS A CONTROL, AND THE PROTOTYPE'S IS NOT.
 *
 * `isBuilder` draws an `h1` carrying the workflow name (`:1016`). The product's
 * name IS editable, so the design fit is the prototype's TYPOGRAPHY on an
 * `<input>` rather than an `<h1>` beside it. The metrics asserted here are
 * `.gn-page-title`'s, the rule that already carries the prototype's
 * `34px/41px/700/-0.4px` conversion; a second derivation of the same four
 * numbers is how two titles drift apart.
 *
 * **THE FIRST RECORDED REASON FOR REFUSING THE `h1` WAS FALSE, and it is
 * corrected rather than deleted.** It read: a heading carrying the same string
 * "would make `getByText(name)` ambiguous for every later test". An independent
 * reviewer probed it and refuted it — `getByText` matches TEXT CONTENT, and an
 * input's `value` is not text content, so `<h1>Field ops v2</h1>` beside
 * `<input value="Field ops v2">` matches exactly one node, the heading. The
 * real reason is simpler and visual: the name is ALREADY on screen, inside the
 * field the person edits, so an `<h1>` would print the same words twice in the
 * same header. The probe is the reason this paragraph exists in this form — a
 * refused design with a fabricated obstacle beside it is how a later author
 * inherits a reason that is not true.
 *
 * **The heading gap this leaves is REAL and PRE-EXISTING, not created here.**
 * This route renders no `<h1>` and its headings begin at `<h3>`; the base page
 * had no `<h1>` either. Recorded with an owner rather than fixed inside a
 * design port.
 */
describe('13.770 the workflow name is the title and stays a control', () => {
  it('renders as a labelled text field, not as a heading', async () => {
    screenWith(createFakeGateway());
    const nameField = await screen.findByRole('textbox', { name: 'Workflow name' });
    expect(nameField).toBeInTheDocument();
    expect(nameField.tagName).toBe('INPUT');
    // The absence half, and the reason the fit is a fit: no heading repeats the
    // name. The screen owns no `h1` at all — flagged in the PR body rather than
    // papered over with a duplicate string.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('the title metrics are the page-title rule’s own four, not a second reading of the prototype', () => {
    // Two files, deliberately: `.gn-page-title` is a WEB rule
    // (`apps/web/app/globals.css:127`) and the name field is a UI-package rule,
    // so this is another cross-package read rather than an accident of layout.
    const pageTitle = /^\.gn-page-title\s*\{([^}]*)\}/m.exec(WEB_CSS)?.[1] ?? '';
    const nameField = /^\.workflow-builder-screen__name\s*\{([^}]*)\}/m.exec(ALL_ROLES_IN_UI_CSS)?.[1] ?? '';
    expect(pageTitle.length).toBeGreaterThan(0);
    expect(nameField.length).toBeGreaterThan(0);
    for (const declaration of [
      'font-size: var(--gn-title-page)', // AMENDED 2026-10-02 (UX fixes Task 5, case 23.070): both rules read the page-title token
      'line-height: 2.5625rem',
      'font-weight: 700',
      'letter-spacing: -0.0118em',
    ]) {
      expect(pageTitle).toContain(declaration);
      expect(nameField, `${declaration} drifted from .gn-page-title`).toContain(declaration);
    }
  });

  it('it keeps a field boundary, so a control does not masquerade as static text', () => {
    const nameField =
      /^\.workflow-builder-screen__name\s*\{([^}]*)\}/m.exec(ALL_ROLES_IN_UI_CSS)?.[1] ?? '';
    expect(nameField).toContain('border: 1px solid var(--gn-border)');
    expect(nameField).toContain('border-radius: var(--gn-radius-control)');
    // And the same neo override `.gn-field__input` carries, for the same reason.
    const neo = /\[data-style="neo"\] \.workflow-builder-screen__name\s*\{([^}]*)\}/.exec(
      ALL_ROLES_IN_UI_CSS,
    )?.[1];
    // amended 2026-10-02 by N10 (case 24.040): the rim-less neo field reads the `field` shadow, not `sunken`.
    expect(neo).toContain('box-shadow: var(--gn-shadow-field)');
  });
});

/**
 * E4-16 — React Flow's own vendor stylesheet paints its required attribution
 * link at 10px with a fixed grey, measured (painted, builder route) at
 * 1.10:1 contrast against this canvas's dark-mode backdrop and 2.61:1 in
 * light — both below the 4.5 body text needs. Not re-painted here (no
 * browser in this suite); instead the repo override this fixes with is
 * checked at the CSS-rule level, and its colour pair is proven by the same
 * `CONTRAST_PAIRS` loop `packages/ui/test/tokens.test.ts` already runs on
 * every style and theme — reusing a declared pair rather than adding a new,
 * unchecked one.
 */
describe('13.1207 E4-16 the React Flow attribution link is overridden to a declared contrast pair', () => {
  const css = readFileSync(CSS_PATH, 'utf8');

  it('is floored at 12px and coloured with a role this file already declares', () => {
    const block = declarationsFor(stripComments(css), '.react-flow__attribution');
    expect(block, '.react-flow__attribution lost its override').toContain('font-size: 0.75rem');
    expect(block).toContain('background: var(--gn-surface-raised)');
    const link = declarationsFor(stripComments(css), '.react-flow__attribution a');
    expect(link, '.react-flow__attribution a lost its override').toContain(
      'color: var(--gn-text-muted)',
    );
  });

  it('the textMuted/surfaceRaised pair this override relies on is a declared, checked minimum', () => {
    // Not a new guarantee: this pair is already in CONTRAST_PAIRS and already
    // measured passing in every style/theme by tokens.test.ts's own loop — the
    // override above composes onto a contrast promise that test already keeps.
    expect(CONTRAST_PAIRS).toContainEqual({ fg: 'textMuted', bg: 'surfaceRaised', minimum: 4.5 });
  });
});
