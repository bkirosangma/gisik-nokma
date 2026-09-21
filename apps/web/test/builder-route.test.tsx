import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  buildPublishPayload,
  draftFromTemplate,
  WORKFLOW_TEMPLATES,
  type WorkspaceMember,
} from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 13.772 — THE BUILDER'S BREADCRUMB, WHICH THE PRODUCT'S OWN SOURCE ALREADY
 * CLAIMED TO HAVE.
 *
 * `apps/web/app/settings/page.tsx:94-96` gives the reason the workflow builder
 * is the one settings sub-screen NOT inlined into the `/settings` shell: *"it
 * carries its own breadcrumb back ('Settings › Workflows') instead."* That
 * sentence was true of the prototype and false of the product — the route
 * rendered `AppNav` and then the screen, and no crumb existed anywhere. The
 * `isBuilder` port is what built it; this file is what stops it quietly going
 * away again.
 *
 * WHY IT IS THE ROUTE'S ELEMENT AND NOT APP-CORE'S. Routing is the one thing
 * app-core cannot know — `.../workflows/page.tsx`'s docblock records the same
 * line for its own two jumps — and a plain `<a>` inside app-core would be a full
 * document load where every other link in this product is a client-side
 * navigation. So the crumb renders in `apps/web`, and this is the layer that can
 * assert its href.
 *
 * EVERY ARM IS COVERED, and that is the point rather than thoroughness for its
 * own sake: the page has four states (loading, missing, read-refused, loaded)
 * and the crumb is rendered above all of them, because "the way back" is exactly
 * what a person needs when the read failed. A test that only rendered the loaded
 * arm would pass against a build where a failed read trapped the user on the
 * page.
 */
const WORKSPACE = '01J9WORKSPACE0000000000000';
const WORKFLOW = '01J9WORKFLOW00000000000000';
const ME = '01J9USER000000000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: WORKSPACE, workflowId: WORKFLOW }),
  usePathname: () => `/w/${WORKSPACE}/settings/workflows/${WORKFLOW}`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ME, name: 'Anselma Marak' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import EditWorkflowPage from '../app/w/[workspaceId]/settings/workflows/[workflowId]/page.js';

/** This file's own directory — no helper here exports one. */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * THE REACT FLOW GLOBALS, SHIMMED HERE AND NOT IN `apps/web/test/setup.ts`.
 *
 * The builder's canvas is `@xyflow/react`, and jsdom has no layout engine. This
 * is the FIRST test in `apps/web` to mount it, so it is the first to hit the
 * gap: without these, the loaded arm throws `ReferenceError: ResizeObserver is
 * not defined` inside React Flow's own `<ZoomPane>` and React unmounts the whole
 * root — the container comes back EMPTY rather than reporting anything, which is
 * why the failure reads as "the page rendered nothing" and not as a missing
 * global. Measured 2026-09-18, not inferred from the sibling package.
 *
 * `packages/app-core/test/setup.ts:24-204` already carries the full recipe, with
 * the measurements each shim rests on. This is a deliberate SUBSET, local to the
 * one file that needs it, because the alternative was worse both ways: copying
 * that block into `apps/web/test/setup.ts` would put a second ~170-line copy in
 * the tree to keep in sync, and changing shared setup would alter jsdom for
 * every apps/web suite to serve one assertion. Only the globals needed to MOUNT
 * a canvas are here — none of app-core's pointer/`view`/`elementFromPoint`
 * gesture machinery, because nothing in this file drives a gesture.
 *
 * If a later apps/web suite needs the canvas too, the honest move is to promote
 * this block into `apps/web/test/setup.ts` rather than copy it a third time.
 *
 * **THE ISOLATION THIS RESTS ON IS A VITEST DEFAULT WITH NO CONFIG KEY.**
 * `apps/web/vitest.config.ts` sets `include`, `environment` and `setupFiles` and
 * declares no `isolate`, `pool`, `poolOptions` or `singleFork`, so the safety of
 * putting globals at module scope comes from vitest's `isolate: true`. Measured
 * by the reviewer both ways: with the default, a probe file run alongside this
 * one sees `ResizeObserver === undefined`; with `--no-isolate`, the two
 * `globalThis` assignments leak and the probe sees `function`. So a one-line
 * `isolate: false` — a common CI speedup — would republish canvas globals into
 * every apps/web suite, which is exactly the outcome this file's placement was
 * chosen to avoid. `getBBox` and `offsetWidth` do not leak (they are prototype
 * writes, not globals).
 */
if (typeof HTMLElement !== 'undefined') {
  class LocalResizeObserver {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element): void {
      // React Flow's pan/zoom reads `contentRect.width/height` off the FIRST
      // callback to size its viewport; a bare `{ target }` throws inside it.
      const host = target as HTMLElement;
      const width = host.offsetWidth || 180;
      const height = host.offsetHeight || 40;
      this.callback(
        [
          {
            target,
            contentRect: {
              width,
              height,
              top: 0,
              left: 0,
              right: width,
              bottom: height,
              x: 0,
              y: 0,
              toJSON: () => ({}),
            },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  class LocalDOMMatrixReadOnly {
    readonly m22: number;
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
      this.m22 = scale === undefined ? 1 : Number.parseFloat(scale);
    }
  }
  globalThis.ResizeObserver ??= LocalResizeObserver as unknown as typeof ResizeObserver;
  (globalThis as Record<string, unknown>).DOMMatrixReadOnly ??= LocalDOMMatrixReadOnly;
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: { get(this: HTMLElement) { return Number.parseFloat(this.style.width) || 180; } },
    offsetHeight: { get(this: HTMLElement) { return Number.parseFloat(this.style.height) || 40; } },
  });
  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
}

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;
const PUBLISHED = buildPublishPayload(draftFromTemplate(kanban));

const LIST_HREF = `/w/${WORKSPACE}/settings/workflows`;
/** The prototype's own string, character for character (`:1015`). */
const CRUMB_TEXT = 'Settings › Workflows';

const ROSTER: WorkspaceMember[] = [
  { userId: ME, displayName: 'Anselma Marak', role: 'admin' },
];

type Authoring = {
  listMembers: () => Promise<WorkspaceMember[]>;
  listTicketTypes: () => Promise<never[]>;
  getWorkflow: () => Promise<unknown>;
};

function renderWithAuthoring(overrides: Partial<Authoring>) {
  return render(
    <Providers
      services={stubServices(
        {},
        {
          authoring: {
            listMembers: async () => ROSTER,
            listTicketTypes: async () => [],
            getWorkflow: async () => PUBLISHED,
            ...overrides,
          } as never,
        },
      )}
    >
      <EditWorkflowPage />
    </Providers>,
  );
}

/** The one assertion every arm makes, so none of them can drift from the others. */
function expectTheCrumb(): void {
  const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
  const link = nav.querySelector('a');
  expect(link).not.toBeNull();
  expect(link).toHaveAttribute('href', LIST_HREF);
  // The name is asserted as a STRING, not as a regex, because the accessible-name
  // sweep counts attributes and a `›` that silently became a `<span>` would still
  // match a loose pattern while rendering a different name.
  expect(screen.getByRole('link', { name: CRUMB_TEXT })).toBe(link);
}

describe('13.772 the breadcrumb is on every arm of the builder route', () => {
  it('while the workflow read is still in flight', async () => {
    // A promise that never settles is what HOLDS this arm: `useBuilderWiring`
    // resolves the caller's role first, so the page is on `WiringNotReady` for
    // a tick before it reaches its own loading branch — a synchronous
    // `getByText` here would assert against that earlier state.
    renderWithAuthoring({ getWorkflow: () => new Promise(() => {}) });
    expect(await screen.findByText('Loading this workflow…')).toBeInTheDocument();
    expectTheCrumb();
  });

  it('when the workflow does not exist — the arm where the way back matters most', async () => {
    renderWithAuthoring({ getWorkflow: async () => null });
    expect(
      await screen.findByText(/No published workflow has this id/),
    ).toBeInTheDocument();
    expectTheCrumb();
  });

  it('when the read is REFUSED — a different fact from "does not exist", same way back', async () => {
    renderWithAuthoring({
      getWorkflow: () => Promise.reject(new Error('HTTP 500 for /v1/workspaces/x/workflows/y')),
    });
    expect(await screen.findByText(/This workflow/)).toBeInTheDocument();
    expectTheCrumb();
  });

  it('when the workflow loaded — the arm the picture was drawn for', async () => {
    renderWithAuthoring({});
    expect(await screen.findByRole('textbox', { name: 'Workflow name' })).toBeInTheDocument();
    expectTheCrumb();
  });
});

/**
 * 13.773 — THE CRUMB IS ONE LINK, NOT TWO, AND IT GOES TO THE LIST.
 *
 * The prototype makes the whole crumb a single `goWorkflows` target
 * (`desktop.dc.html@6d7b67c0a52c:1015`). Rendering "Settings" and "Workflows" as
 * two links would be a design invented here — both would land in the same place —
 * so the count is pinned rather than left to a later tidy-up. The pair below is
 * the shape every other case in `authoring-routes.test.tsx` uses: the thing that
 * must be absent, and the same thing present in a form that proves the absence
 * was not "the nav failed to render".
 */
describe('13.773 the crumb is a single link to the workflow list', () => {
  it('carries exactly one anchor inside the labelled nav, and it is not the current page', async () => {
    renderWithAuthoring({});
    await screen.findByRole('textbox', { name: 'Workflow name' });

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const anchors = nav.querySelectorAll('a');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toHaveAttribute('href', LIST_HREF);
    // Not `aria-current`: the crumb points at the LIST, and this page is the
    // builder. A crumb marked as the current page would be the current page.
    expect(anchors[0]).not.toHaveAttribute('aria-current');
  });

  it('CONTROL — the same run finds the page it points at, so the absence above is not an empty page', async () => {
    renderWithAuthoring({});
    await screen.findByRole('textbox', { name: 'Workflow name' });
    // The screen really mounted: a builder with no canvas would satisfy "one
    // anchor" just as well.
    expect(screen.getByRole('button', { name: 'Add state' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });
});

/**
 * Case `13.1152` — E4-27, the Publish half. The Save half is in
 * `authoring-routes.test.tsx`, because the two controls render on two routes and
 * a single case cannot reach both.
 *
 * `.publish-controls__publish` was a hand-rolled `<button>` whose own rule
 * re-declared the accent fill, a 1px accent border, a 6px radius and
 * `0.35rem 0.9rem` padding — measured **146×36** beside a shared `Button` that is
 * 44px, border-less and control-radiused, on a screen whose prototype draws 44.
 * Swift to `@gisik-nokma/ui`'s `Button variant="primary"`; the page-local class
 * survives for `align-self: flex-start`, the one declaration the shared
 * component does not supply.
 *
 * **The page-local rule is asserted to carry NO paint**, in the same case: a
 * tree that swapped the component but left the old rule behind would still look
 * right in jsdom — `classList` would hold `gn-button--primary` either way — and
 * the duplicate declarations would go on competing in a browser.
 */
describe('13.1152 the builder\'s Publish is the shared Button, and the page rule keeps only layout', () => {
  it('13.1152 Publish carries the shared primary variant', async () => {
    renderWithAuthoring({});
    const publish = await screen.findByRole('button', { name: 'Publish' });
    expect(publish).toHaveClass('gn-button');
    expect(publish).toHaveClass('gn-button--primary');
    // The class that survives, for `align-self`, must survive — a later tidy
    // that deleted it would let a column flex parent stretch the control.
    expect(publish).toHaveClass('publish-controls__publish');
  });

  it('13.1152 the page-local rule declares no fill, border or padding', async () => {
    const css = readFileSync(resolve(TEST_DIR, '../../../packages/ui/src/ui.css'), 'utf8');
    const body = /\.publish-controls__publish\s*\{([^}]*)\}/.exec(css);
    expect(body, 'no rule for .publish-controls__publish').not.toBeNull();
    expect(body?.[1]).toContain('align-self: flex-start');
    for (const paint of [/background:/, /border/, /padding/, /border-radius/]) {
      expect(body?.[1], `.publish-controls__publish re-declared ${String(paint)}`).not.toMatch(paint);
    }
  });
});
