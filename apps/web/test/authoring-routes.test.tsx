import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceMember } from '@gisik-nokma/app-core';
import type { PublishedWorkflowDef } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { AuthoringReadRefused } from '../src/authoring/data-source-gateway.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * # The two `new` routes, and the role gate the coordination doc assigned here
 *
 * `TemplateGallery` takes no session and applies no role check — `props.onPick`
 * is unconditional. Inside `app-core` nothing can reach it but a list screen's
 * `onNew`, which is `canAuthor ? … : null`. The exposure is a ROUTE, recorded
 * against "Plan 8 Task 13" and closed in the same commit as the pages.
 *
 * Every case here comes in a PAIR: the thing that must be absent for a member,
 * and the SAME thing present for an admin in the same file. A `not.toBeInTheDocument()`
 * on its own passes just as well against a page that never had the element, or
 * against a typo — which is the check that cannot fail.
 *
 * `Providers` is the REAL one with stub services injected, so `useAppServices`,
 * `useSessionStatus` and `useBuilderWiring` are all under test rather than
 * replaced by the harness.
 */

const push = vi.fn();
const WORKSPACE = '01J9WORKSPACE0000000000000';
const WORKFLOW = '01J9WORKFLOW00000000000000';
const ME = '01J9USER000000000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  // `workflowId` is here for the history route, which reads it as well as the
  // workspace. The other pages under test read `workspaceId` only, so the extra
  // key changes nothing for them.
  useParams: () => ({ workspaceId: WORKSPACE, workflowId: WORKFLOW }),
  usePathname: () => `/w/${WORKSPACE}/settings/workflows/new`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ME, name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import NewWorkflowPage from '../app/w/[workspaceId]/settings/workflows/new/page.js';
import NewTicketTypePage from '../app/w/[workspaceId]/settings/ticket-types/new/page.js';
import WorkflowsPage from '../app/w/[workspaceId]/settings/workflows/page.js';
import WorkflowHistoryPage from '../app/w/[workspaceId]/settings/workflows/[workflowId]/history/page.js';

/** This file's own directory — no helper in it exports one. */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  push.mockClear();
});

/** The roster the wiring reads the caller's OWN role out of. */
function rosterWhereIAm(role: WorkspaceMember['role']): WorkspaceMember[] {
  return [
    { userId: ME, displayName: 'Anselma Marak', role },
    { userId: '01J9USER111111111111111111', displayName: 'Bikash Sangma', role: 'admin' },
  ];
}

const READ_ONLY_COPY =
  'You can look, not touch — only a workspace owner or admin can change workflows and ticket types.';

describe('the template gallery is a route-level authoring entry point, and a member is not offered it', () => {
  /**
   * 10.65 — a MEMBER typing /settings/workflows/new gets the read-only sentence and neither half of the gallery.
   */
  it('a MEMBER typing /settings/workflows/new gets the read-only sentence and no gallery', async () => {
    render(
      <Providers
        services={stubServices({}, { authoring: { listMembers: async () => rosterWhereIAm('member') } })}
      >
        <NewWorkflowPage />
      </Providers>,
    );

    expect(await screen.findByText(READ_ONLY_COPY)).toBeInTheDocument();
    // Named in advance, both halves of the gallery: the template cards and the
    // blank-start button. Neither may be on screen.
    expect(screen.queryByRole('button', { name: /^Use the .+ template$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start blank' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the workflows' })).toBeInTheDocument();
  });

  /**
   * 10.66 — CONTROL for 10.65: an ADMIN gets exactly those buttons on the same page.
   */
  it('CONTROL — an ADMIN gets exactly those buttons on the same page', async () => {
    render(
      <Providers
        services={stubServices({}, { authoring: { listMembers: async () => rosterWhereIAm('admin') } })}
      >
        <NewWorkflowPage />
      </Providers>,
    );

    expect(await screen.findByRole('button', { name: 'Start blank' })).toBeInTheDocument();
    // Printed, not counted: a failure names the templates that went missing.
    const templates = screen
      .getAllByRole('button', { name: /^Use the .+ template$/ })
      .map((node) => node.getAttribute('aria-label'));
    expect(templates.length).toBeGreaterThan(0);
    expect(screen.queryByText(READ_ONLY_COPY)).not.toBeInTheDocument();
  });

  /**
   * 10.67 — a MEMBER typing /settings/ticket-types/new gets the sentence, no editor form and a link back.
   */
  it('a MEMBER typing /settings/ticket-types/new gets the sentence and no editor form', async () => {
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('member'),
              // Stubbed and never reached: the editor screen's mount effect
              // calls both, so leaving them un-stubbed would let a REJECTION
              // produce the same blank screen the gate produces, and the case
              // would pass for the wrong reason.
              listWorkflows: async () => [],
              listTicketTypes: async () => [],
            },
          },
        )}
      >
        <NewTicketTypePage />
      </Providers>,
    );

    expect(await screen.findByText(READ_ONLY_COPY)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Type name' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the ticket types' })).toBeInTheDocument();
  });

  /**
   * 10.68 — CONTROL for 10.67: an ADMIN gets the editor form on the same page.
   */
  it('CONTROL — an ADMIN gets the editor form on the same page', async () => {
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listWorkflows: async () => [],
              listTicketTypes: async () => [],
            },
          },
        )}
      >
        <NewTicketTypePage />
      </Providers>,
    );

    expect(await screen.findByRole('textbox', { name: 'Type name' })).toBeInTheDocument();
    expect(screen.queryByText(READ_ONLY_COPY)).not.toBeInTheDocument();
  });
});

/**
 * The wiring's third arm. A role that could not be READ is not a role, and the
 * tempting default — treat them as a member and show read-only — would put a
 * banner saying "you may not change this" in front of an owner on the strength
 * of a 500.
 */
describe('a role read that FAILS is a refusal on screen, never a quietly read-only page', () => {
  /**
   * 10.69 — a rejected roster read renders the refusal's own words and mounts no screen.
   */
  it('a rejected roster read renders the cause’s own words and mounts no screen', async () => {
    render(
      <Providers
        services={stubServices(
          {},
          { authoring: { listMembers: () => Promise.reject(new Error('HTTP 500 for /v1/workspaces/x/members')) } },
        )}
      >
        <WorkflowsPage />
      </Providers>,
    );

    // Awaited on the REFUSAL's own words, not on `role="status"`: the loading
    // arm is also a status, so `findByRole('status')` resolves on the spinner
    // and the case would assert against the wrong element.
    const refusal = await screen.findByText(/could not be loaded/);
    expect(refusal.closest('p')).toHaveTextContent('Your role in this workspace could not be loaded — reload to try again.');
    expect(refusal.closest('p')).toHaveTextContent('HTTP 500 for /v1/workspaces/x/members');
    // The pair: the screen that would otherwise stand in its place is absent.
    expect(screen.queryByRole('heading', { name: 'Workflows', level: 2 })).not.toBeInTheDocument();
  });

  /**
   * 10.70 — CONTROL for 10.69: the GUEST refusal shape is an answer, not a failure — mounts read-only.
   */
  it('CONTROL — the SAME refusal shape, but the one the door really sends, is a GUEST and not a failure', async () => {
    // `AuthoringReadRefused` is what the adapter throws for a 404, which is what
    // the no-guests door answers a guest. That one IS an answer: read-only.
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: () => Promise.reject(new AuthoringReadRefused('/v1/workspaces/x/members')),
              listWorkflows: async () => [],
            },
          },
        )}
      >
        <WorkflowsPage />
      </Providers>,
    );

    expect(await screen.findByText(READ_ONLY_COPY)).toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'New workflow' })).not.toBeInTheDocument();
    });
  });
});

/** The two fixtures the history cases need: one workflow, two versions of it. */
const v1: PublishedWorkflowDef = {
  id: WORKFLOW,
  version: 1,
  name: 'Field ops',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'review', name: 'Review', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'review', rules: [] }],
};
const v2: PublishedWorkflowDef = {
  ...v1,
  version: 2,
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'done', rules: [] }],
};

/**
 * ## The history door and the history route, at the ROUTE layer (Task 3)
 *
 * Both cases exist because an independent review measured two mutations that
 * **survived the whole suite**: pointing `onHistory` at the BUILDER's path
 * instead of `/history` (548 `apps/web` tests stayed green — nothing turned the
 * id into a URL), and a history route rendered by no test at all. A door whose
 * destination is pinned nowhere is the affordance-with-no-door defect one layer
 * up: the button renders, the handler fires, and the person lands somewhere
 * else.
 */
describe('the second action reaches the history route, and that route renders the chain', () => {
  /**
   * 13.944 — the DESTINATION. The component case (13.938) proves `onHistory` is
   * called with the right id; this proves the id becomes the right URL.
   */
  it('13.944 the list card’s View history opens THAT workflow’s history URL', async () => {
    const user = userEvent.setup();
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listWorkflows: async () => [v2],
              getWorkflow: async () => v2,
            },
          },
        )}
      >
        <WorkflowsPage />
      </Providers>,
    );
    await user.click(await screen.findByRole('button', { name: 'View history of Field ops' }));
    expect(push).toHaveBeenCalledWith(`/w/${WORKSPACE}/settings/workflows/${WORKFLOW}/history`);
    // The control: it did NOT go to the builder, which is the mutation that
    // survived every other case in this app.
    expect(push).not.toHaveBeenCalledWith(`/w/${WORKSPACE}/settings/workflows/${WORKFLOW}`);
  });

  /**
   * 13.945 — **the route renders a real chain**, end to end through the page the
   * product ships: wiring, gateway and screen. Nothing rendered this route
   * before, so the seven-deep relative imports and the `useBuilderWiring` arm
   * were checked only by the compiler.
   */
  it('13.945 the history route renders both versions, the superseded one with its own content', async () => {
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              getWorkflow: async (_workspaceId, _workflowId, version) => (version === 1 ? v1 : v2),
            },
          },
        )}
      >
        <WorkflowHistoryPage />
      </Providers>,
    );
    expect(await screen.findByRole('heading', { name: 'Version history' })).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Superseded')).toBeInTheDocument();
    // v1's dropped state, rendered by the real page rather than by the screen in
    // isolation — the thing the door opens.
    expect(screen.getByText('Review')).toBeInTheDocument();
  });
});

/**
 * Case `13.1150` — E4-10 — the template gallery's four buttons are the shared
 * `Button`, not bare `<button>`s painting as raw user-agent chrome.
 *
 * They carried **no `className` at all**, so nothing in the product's three
 * stylesheets matched them: measured **143×29** ×3 and **95×29**, flagged by
 * the UA-chrome detector (`borderTopStyle === 'outset'` or the UA's
 * `rgb(239,239,239)` fill) on the route. **Round 1's `P1` population was "each
 * static `className` literal on a `<button|input|…>`", so a class-less button
 * was outside it by construction** — which is why this is its own finding and
 * not a P1 member, and why "P1 is clean" could never have meant this file.
 *
 * Asserted at the ROUTE rather than on the component, because the finding's
 * population is what the route renders; the case above already reads these four
 * by accessible name and this one reads their classes. **The single assertion
 * that can fail is the class**, and it is asserted as the exact pair the shared
 * component emits (`gn-button` + its variant) rather than as a substring, so a
 * hand-rolled `className="gn-button"` without the variant — which would render
 * unbordered and unfilled — reddens here.
 */
describe('13.1150 the template gallery uses the shared Button', () => {
  it('13.1150 Start blank carries the shared component\'s classes and the three templates are doors', async () => {
    render(
      <Providers
        services={stubServices({}, { authoring: { listMembers: async () => rosterWhereIAm('admin') } })}
      >
        <NewWorkflowPage />
      </Providers>,
    );

    const blank = await screen.findByRole('button', { name: 'Start blank' });
    const templates = screen.getAllByRole('button', { name: /^Use the .+ template$/ });
    expect(templates.length, 'the gallery rendered no template doors').toBeGreaterThan(0);

    // Touch-doors (2026-09-30): the three template cards are DOORS, not shared Buttons —
    // the whole card is the one control (`template-gallery__door`, P-LIFT). What this
    // case guards is unchanged: no control is left CLASS-LESS (a bare `<button>` paints
    // as UA chrome). Start blank is still the shared Button, with its variant.
    expect(blank, 'Start blank is not the shared Button').toHaveClass('gn-button');
    expect([...blank.classList].some((name) => name.startsWith('gn-button--')), 'Start blank carries gn-button with no variant').toBe(true);
    for (const control of templates) {
      const label = control.getAttribute('aria-label');
      expect(control, `${String(label)} is not a door`).toHaveClass('template-gallery__door');
      expect(control, `${String(label)} is a Button, not a door`).not.toHaveClass('gn-button');
    }
    for (const control of [blank, ...templates]) {
      const label = control.getAttribute('aria-label') ?? control.textContent;
      expect(control.className, `${String(label)} is back to a bare <button>`).not.toBe('');
    }
  });
});

/**
 * Case `13.1152` — E4-27 — the type editor's Save and the builder's Publish are
 * the shared `Button`, not page-local copies of it.
 *
 * Both were hand-rolled `<button>`s whose own rules re-declared the accent fill,
 * a 1px accent border, a 6px radius and `0.35rem 0.9rem` padding: measured
 * **146×36**, beside a shared `Button` that is 44px, border-less and
 * control-radiused, on a screen whose prototype draws 44. Two rules were a
 * second copy of the shared component, free to drift from it.
 *
 * **Asserted at the ROUTE for the same reason `13.1150` is:** that is where the
 * controls render, and it is the population the finding named. The two rules
 * survive as LAYOUT ONLY (`align-self: flex-start`, the one declaration the
 * shared component does not supply) — so the case asserts both halves: the
 * control carries the shared classes, AND the page rule no longer carries the
 * paint. A tree that swapped the component but left the old paint behind would
 * pass the first and fail the second.
 */
describe('13.1152 the type editor and the builder use the shared Button', () => {
  it('13.1152 the rendered Save is the shared primary variant', async () => {
    // THE SAVE HALF ONLY, and the first version of this case is why: it looped
    // over `[/^Publish$/, /^Use the .+ template$/]` on THIS route, and the
    // population assertion added to stop the loop passing vacuously immediately
    // failed — this route renders no Publish at all. The loop had been passing
    // for the wrong reason. Publish renders on the builder route and is asserted
    // in `builder-route.test.tsx` under the same case id.
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              // The editor screen's mount effect calls BOTH of these. Leaving
              // them un-stubbed makes `stubServices` reject by name, and the
              // rejection surfaces as an UNHANDLED ERROR rather than a red
              // assertion — which is how the first cut of this case reported
              // "2 passed, 1 error" and would have read as green in a summary
              // that only counted tests.
              listWorkflows: async () => [],
              listTicketTypes: async () => [],
            },
          },
        )}
      >
        <NewTicketTypePage />
      </Providers>,
    );

    const saves = await screen.findAllByRole('button', { name: 'Save ticket type' });
    expect(saves.length, 'no Save ticket type on the type editor route').toBeGreaterThan(0);
    for (const save of saves) {
      expect(save).toHaveClass('gn-button');
      expect(save).toHaveClass('gn-button--primary');
      // The class that survives, for `align-self`, must survive.
      expect(save).toHaveClass('ticket-type-editor__save');
    }
  });

  it('13.1152 the two page-local rules kept ONLY the layout they own', () => {
    // The rules are still named (the components pass the class for
    // `align-self`), so deleting them outright would be wrong — what must not
    // return is the PAINT. Asserted by reading their bodies out of ui.css.
    const css = readFileSync(resolve(TEST_DIR, '../../../packages/ui/src/ui.css'), 'utf8');
    for (const selector of ['.publish-controls__publish', '.ticket-type-editor__save']) {
      const body = new RegExp(`${selector.replace(/[.\\-_]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
      expect(body, `no rule for ${selector}`).not.toBeNull();
      expect(body?.[1], `${selector} re-declared the paint`).toContain('align-self: flex-start');
      expect(body?.[1], `${selector} re-declared a fill`).not.toMatch(/background:/);
      expect(body?.[1], `${selector} re-declared a border`).not.toMatch(/border/);
      expect(body?.[1], `${selector} re-declared a padding`).not.toMatch(/padding/);
    }
  });
});

/**
 * Case `T-P36` — P36 — the two dedicated settings routes stop painting the
 * same word as the page's `h1` and, 6.4px under it, as the screen's `h2`.
 *
 * `/w/<id>/settings/workflows` rendered `<h1 class="gn-page-title">Workflows</h1>`
 * and then mounted `WorkflowListScreen`, whose header is
 * `<h2 class="workflow-list__title">Workflows</h2>`; `/settings/ticket-types` did
 * the same with `Ticket types`. Measured: `H1 "Workflows"` (34px), `H2
 * "Workflows"` (16px), the h2's top 6.4px below the h1's bottom — and the a11y
 * tree lists `heading "Workflows"` twice in a row with nothing between them to
 * say what changed.
 *
 * **The screens are RIGHT and the routes were the duplicate, and that is what
 * this case pins.** Both screens mount in TWO places —
 * `apps/web/app/settings/page.tsx:351,373` and the two dedicated routes — and in
 * the `/settings` shell the h1 is already `Settings` with the screen's h2 naming
 * the section. So the export's own shape is `Settings` over the section title,
 * the shell has always drawn it, and the fix is the two route headings rather
 * than a screen that would then be wrong in the shell.
 */
describe('T-P36 the dedicated settings routes name the page, not the section', () => {
  it('T-P36 neither route paints the section word as its h1', () => {
    for (const [route, sectionWord] of [
      ['workflows', 'Workflows'],
      ['ticket-types', 'Ticket types'],
    ] as const) {
      const source = readFileSync(
        resolve(TEST_DIR, `../app/w/[workspaceId]/settings/${route}/page.tsx`),
        'utf8',
      );
      const h1 = /<h1 className="gn-page-title">([^<]*)<\/h1>/.exec(source);
      expect(h1, `${route}/page.tsx has no gn-page-title h1`).not.toBeNull();
      expect(h1?.[1], `${route}: the h1 repeats the screen's own section heading`).not.toBe(
        sectionWord,
      );
      expect(h1?.[1]).toBe('Settings');
    }
  });

  it('T-P36 the screens still carry their own h2 — the fix is not their removal', () => {
    // The other direction, and the tempting wrong fix: deleting the screen's h2
    // would satisfy the assertion above and leave the `/settings` shell with a
    // section that has no heading at all.
    const css = readFileSync(resolve(TEST_DIR, '../../../packages/ui/src/ui.css'), 'utf8');
    expect(css).toMatch(/\.workflow-list__title/);
    expect(css).toMatch(/\.ticket-type-list__title/);
    const screen = readFileSync(
      resolve(TEST_DIR, '../../../packages/app-core/src/workflow-builder/ui/workflow-list-screen.tsx'),
      'utf8',
    );
    expect(screen).toMatch(/<h2 className="workflow-list__title">Workflows<\/h2>/);
  });
});
