import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.js';
import { InspectorPanel } from '../../src/workflow-builder/ui/inspector-panel.js';
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
  'inspector-panel',
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

/** Every class these four families are STYLED under, anywhere in the file. */
function styledClasses(css: string): string[] {
  const hits = [...stripComments(css).matchAll(/\.([a-z][a-z0-9_-]*)/g)].flatMap(
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
    [...(rule[1] ?? '').matchAll(/\.([a-z][a-z0-9_-]*):focus-visible/g)].flatMap(
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
      <InspectorPanel />
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

  // 3 — the load-refused arm. Only `listTicketTypes` is fatal to this screen
  // (a member's roster refusal is an empty roster, not a failure), so that is
  // the read made to reject.
  await withFake(
    {
      ...createFakeGateway(),
      listTicketTypes: () => Promise.reject(new Error('HTTP 500 for /v1/workspaces/x/ticket-types')),
    },
    () => screen.findByText('Could not load workspace people and types — reload to try again.'),
  );

  // 4, 5, 6 — the inspector's three selections.
  absorb(renderPanel(createDraftStore(draftFromTemplate(kanban))).container);
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
    const styled = styledClasses(css);

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
    expect(exempt).toEqual(['workflow-builder-screen__add-state']);
    expect(rendered).toContain('workflow-builder-screen__add-state');
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
   * every test above GREEN, because the `@media (max-width: 64rem)` rule below
   * still names `__canvas` in `{ order: -1 }`, so `styledClasses` went on
   * harvesting the name. The same shape is why `saved-filters`' 11.119 exists.
   *
   * The table names one load-bearing declaration per top-level rule of the
   * block — the ones whose loss would be visible on screen — rather than
   * restating every declaration, which would be a copy of the stylesheet that
   * has to be updated twice.
   */
  it('13.771 every top-level rule still carries the declaration that makes it do something', () => {
    const expected: [selector: string, declaration: string][] = [
      ['.workflow-builder-screen', 'display: flex'],
      ['.workflow-builder-screen__header', 'flex-direction: column'],
      ['.workflow-builder-screen__title-row', 'justify-content: space-between'],
      ['.workflow-builder-screen__actions', 'flex-wrap: wrap'],
      ['.workflow-builder-screen__name', 'font-size: 2.125rem'],
      [
        '.workflow-builder-screen__layout',
        'grid-template-columns: minmax(0, 18rem) minmax(0, 1fr) minmax(0, 20rem)',
      ],
      ['.workflow-builder-screen__canvas', 'box-shadow: var(--gn-shadow-raised)'],
      ['.workflow-builder-screen__left', 'flex-direction: column'],
      ['.workflow-builder-screen__right', 'flex-direction: column'],
      ['.state-inspector', 'border-radius: var(--gn-radius-card)'],
      ['.state-inspector__actions', 'flex-wrap: wrap'],
      ['.transition-inspector', 'border-radius: var(--gn-radius-card)'],
      ['.transition-inspector__rule', 'border-left: 2px solid var(--gn-border)'],
      ['.inspector-panel__hint', 'background: var(--gn-surface-raised)'],
    ];
    for (const [selector, declaration] of expected) {
      expect(
        declarationsFor(ALL_ROLES_IN_UI_CSS, selector),
        `${selector} lost "${declaration}"`,
      ).toContain(declaration);
    }
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
      [...selector.matchAll(/\.([a-z][a-z0-9_-]*)/g)].some((hit) => isOurs(hit[1] ?? ''));
    const block = rules
      .filter((rule) => ruleNamesOurs(rule[1] ?? ''))
      .map((rule) => rule[2] ?? '')
      .join('\n');
    const outside = rules
      .filter((rule) => !ruleNamesOurs(rule[1] ?? ''))
      .map((rule) => rule[2] ?? '')
      .join('\n');

    expect(block.length).toBeGreaterThan(0);
    const used = [
      ...new Set([...block.matchAll(/var\((--gn-[a-z-]+)\)/g)].flatMap((hit) => hit[1] ?? [])),
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
 * `<input>` rather than a heading with a copy of the same string beside it —
 * two elements carrying one name would also make `getByText(name)` ambiguous
 * for every later test. The metrics asserted here are `.gn-page-title`'s, the
 * rule that already carries the prototype's `34px/41px/700/-0.4px` conversion;
 * a second derivation of the same four numbers is how two titles drift apart.
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
      'font-size: 2.125rem',
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
    expect(neo).toContain('box-shadow: var(--gn-shadow-sunken)');
  });
});
