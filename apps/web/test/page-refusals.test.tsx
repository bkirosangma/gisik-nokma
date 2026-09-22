import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, LIST_TOO_LARGE_ABSENCE, ServingGapError } from '@gisik-nokma/app-core/online';
import { Providers } from '../src/providers.js';
import { EXPIRED_SESSION_COPY, isExpiredSession, signInWithNext } from '../src/expired-session.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * ## THE ADAPTATION THIS FILE EXISTS TO PROVE
 *
 * **⚠ CORRECTED 2026-09-20.** This read *"FOUR of the THIRTEEN `DataSourceQuery`
 * methods answer with a `ServingGapError` — six until ruling P25 clause 1 served
 * `getTickets`' and `getTicket`'s gaps — that ENUMERATES the facts the shipped
 * routes do not serve. Four of the six — `getMyWorkspaces`, `getMyWork`,
 * `getAttention`, `getTickets` — are called by pages in this shell…"*. **The
 * count is now ZERO** — 6 → 4 at ruling P25 clause 1 (`c86c4b5c`, 2026-09-06) → 3
 * at P32/P38 → 1 at P39/P40 → 0 when `search` was served on 2026-09-19 — so no
 * read refuses for a serving reason, and the list was already self-contradictory
 * when written (it named `getTickets` among the four in the same sentence that
 * said P25 had served it). **What this file PROVES is unchanged:** the refusals
 * its cases stub are now constructed rather than inherited, and the rendering path
 * they cover is the same one a served read still takes when it FAILS. The plan
 * text (written before those refusals existed) renders each read as
 * `data === null ? <p>Loading…</p> : …`, with
 * the attention strip as `items={attention.data ?? []}`. Both spellings put a
 * FALSE CLAIM on screen against the server that ships today:
 *
 * - a spinner that never resolves says the answer is on its way;
 * - `AttentionStrip` returns `null` for an empty list, so `?? []` renders a
 *   page with no strip — which reads as "nothing needs your attention".
 *
 * So every read in this shell checks `error` before it checks `data`. The
 * assertions in each case below come in PAIRS on purpose: the refusal's own
 * words present, AND the thing that would otherwise stand in its place absent.
 * Asserting only the first passes just as well against a page that renders
 * both, which is not the page anybody wants.
 *
 * `Providers` is the REAL one, with a stub `DataSource` injected — the DI seam
 * the coding standard asks for. Mocking `../src/providers.js` instead would
 * have made `useAppServices` itself untested by this file, and would have been
 * a harness supplying the very thing under test.
 */

const push = vi.fn();
/**
 * E5-32 — the redirect carries the destination. Built from the SAME
 * `signInWithNext` the hook uses, so this asserts the URL the product builds
 * rather than a re-typed paraphrase of it that would pass after a rename.
 */
const SIGN_IN_WITH_NEXT = signInWithNext('/w/01J9WORKSPACE0000000000000/p/01J9PROJECT000000000000000');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: '01J9WORKSPACE0000000000000', projectId: '01J9PROJECT000000000000000' }),
  // No case in this file asserts on nav content — every page here mounts
  // `AppNav` only incidentally, on the way to the refusal/redirect each case
  // is actually about — so one literal, not one per mounted page, is enough.
  usePathname: () => '/w/01J9WORKSPACE0000000000000/p/01J9PROJECT000000000000000',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: '01J9USER000000000000000000', name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import MyWorkPage from '../app/w/[workspaceId]/my-work/page.js';
import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';
import WorkspacesPage from '../app/workspaces/page.js';

afterEach(() => {
  push.mockClear();
});

/**
 * A board carrying a DONE card, for 12.387. The board read takes no filter, so
 * this card survives every narrowing — which is the whole point: the note must not
 * tell a user on this tab that done tickets are excluded while one is on screen.
 */
const PROVENANCE_387 = {
  actorId: '01J9USER000000000000000000',
  actorName: 'Anselma Marak',
  clientTime: '2026-08-20T08:59:00.000Z',
  serverTime: '2026-08-20T09:00:00.000Z',
};
const BOARD_WITH_DONE = {
  projectId: '01J9PROJECT000000000000000',
  groups: [
    {
      workflowId: 'wf-errands',
      workflowVersion: 1,
      workflowName: 'Errand',
      columns: [
        {
          stateId: 'done',
          name: 'Done',
          category: 'terminal' as const,
          blocked: false,
          cards: [
            {
              ticketId: '01J9TICKET00000000000000DN',
              title: 'Old sign taken down',
              typeId: 'task',
              assignee: null,
              stateProvenance: PROVENANCE_387,
              // Ruling E5-2 made this REQUIRED on `BoardCard`; `null` is "this
              // ticket claims no date", the same default `boardCardSeed` uses.
              dueDate: null,
              // REQUIRED since spec 2026-09-22 (see the same member on the
              // local `row(...)` helper below).
              priority: { value: 'P2' as const, claim: PROVENANCE_387 },
              cause: null,
              rollup: null,
              // Spec 2026-09-22: `null` is "the ledger holds no prefix".
              key: null,
              pending: false,
            },
          ],
        },
      ],
    },
  ],
};

/**
 * One attention item, in the shape `mapAttention` builds and with the reason
 * `apps/server/src/routes/attention.ts` composes verbatim — the raw claimed day
 * `2026-08-30`, never `30 Aug 2026`. Taken as the server's own spelling for the
 * same reason `attention-strip.test.tsx`'s fixture is: "render the server's
 * reason verbatim" is only testable against the server's actual wording.
 */
const ATTENTION_ITEM = {
  kind: 'due-soon' as const,
  ticketId: '01J9TICKET00000000000000AT',
  projectId: '01J9PROJECT000000000000000',
  title: 'File the GST return',
  reason: 'Needed by 2026-08-30 — due within 7 days.',
  claim: PROVENANCE_387,
};

describe('a refused read is rendered as the refusal, never as a spinner or an empty list', () => {
  it('My Work: both reads refuse, and both refusals are on the page instead of "Loading…"', async () => {
    // **The two refusals are CONSTRUCTED here now, and that is a change.** This
    // case used to take them from `stubServices({})`, which read them off
    // `SERVING_GAPS` — correct while `getMyWork` and `getAttention` refused,
    // and impossible once rulings P39 and P40 served both. The property under
    // test is the PAGE's: a refused read reaches the screen as the refusal's
    // own words, never as a spinner and never as an empty strip. That is true
    // of any `ServingGapError` and does not need these two methods to still
    // make one — the same move `reopen-flow.test.tsx`'s T13.4h-control made
    // when P25 clause 1 served `getTicket`.
    //
    // The absences below are shaped like the ones that really stood here, so
    // the assertions further down still read against realistic text.
    const gap = (method: string, field: string, wireRoute: string) =>
      () =>
        Promise.reject(
          new ServingGapError(method, [
            {
              field,
              wireKey: 'title',
              wireRoute,
              because: 'a hand-built absence standing in for a refusal this method no longer makes',
              owner: 'this test',
            },
          ]),
        );
    render(
      <Providers
        services={stubServices({
          getMyWork: gap('getMyWork', 'WorkItem.stateName', '/v1/me/work'),
          getAttention: gap(
            'getAttention',
            "AttentionItem kind 'contested' — its title",
            '/v1/contests',
          ),
        })}
      >
        <MyWorkPage />
      </Providers>,
    );

    // The authority's own words, carried without paraphrase: each message names
    // the field, why the route does not serve it, and who closes the gap. Both
    // refusals are compared as a LIST — printed, not counted — so a failure
    // says which one went missing and what stood in its place.
    const texts = (await screen.findAllByRole('status')).map((node) => node.textContent ?? '');
    expect(texts).toEqual([
      expect.stringContaining('What needs your attention could not be loaded — reload to try again.'),
      expect.stringContaining('My Work could not be loaded — reload to try again.'),
    ]);
    expect(texts[0]).toContain("AttentionItem kind 'contested' — its title");
    // `WorkItem.stateName`. It named `WorkItem.projectName` until P32/P38, then
    // this, and now neither field is unserved at all — which is why the
    // absences are constructed above rather than read from the register. The
    // case's PROPERTY has survived every one of those moves unchanged: whatever
    // a read refuses over, the refusal reaches the page as words a person can
    // act on, and the spinner and the empty strip do not.
    expect(texts[1]).toContain('WorkItem.stateName');

    // The half that makes the two above a test: neither falsehood is also here.
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Needs your attention' })).not.toBeInTheDocument();
  });

  it('Workspaces: the list refuses, and the page does not claim there are none', async () => {
    render(
      <Providers services={stubServices({})}>
        <WorkspacesPage />
      </Providers>,
    );

    expect(await screen.findByText(/Your workspaces could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No workspaces yet. Ask an admin for an invite link.'),
    ).not.toBeInTheDocument();
  });

  it('13.1160 Workspaces: a 401 is NOT a refusal — it sends the viewer to sign in, remembering where they were', async () => {
    render(
      <Providers
        services={stubServices({
          // The REAL failure object the real transport throws. This fixture used
          // to be `new Error('GET /v1/me/workspaces failed: 401')` — a message
          // shape NOTHING in this repo produces (grep it): the only producer of
          // a 401 here is `HttpError`, whose message is `HTTP 401 for <path>`.
          // So the one page that had the rule was proven against a sentence the
          // server can never send, and the predicate could have been anything.
          getMyWorkspaces: () => Promise.reject(new HttpError(401, '/v1/me/workspaces')),
        })}
      >
        <WorkspacesPage />
      </Providers>,
    );
    // E5-32: `/workspaces` is the page this rule was FIRST written for, and it
    // kept the destination all along — the assertion now pins that, so a future
    // edit cannot quietly drop it back to a bare `/sign-in`.
    await waitFor(() => expect(push).toHaveBeenCalledWith(SIGN_IN_WITH_NEXT));
    expect(screen.queryByText(/cannot be shown yet/)).not.toBeInTheDocument();
    // SPECIFIC to this page's own refusal panel, not the bare phrase (E5-30,
    // 2026-09-21): the copy change made "could not be loaded" a phrase OTHER
    // components also use — `/workspaces` renders "Your invitations could not be
    // loaded:" for an unstubbed invitations read — so the generic matcher now
    // reddens on a sentence this case is not about.
    expect(screen.queryByText(/Your workspaces could not be loaded/)).not.toBeInTheDocument();
    expect(await screen.findByText(EXPIRED_SESSION_COPY)).toBeInTheDocument();
    // Not a spinner either. With the refusal suppressed the page falls through
    // to `workspaces === null`, which without the notice is `Loading…` over a
    // read that has already failed.
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  /**
   * 13.881 — the attention strip is GONE from the project page, and the read
   * behind it is not merely unrendered: it is NEVER MADE.
   *
   * Owner, 2026-09-18, verbatim: *"the attention section should not be there in
   * the project page. its already there in the my work page."* The strip stays a
   * component and stays mounted on `/my-work`; this is a removal from ONE route,
   * so the case is a PAIR and the second half is the load-bearing one. A page
   * that still called `useAttention` and discarded the answer would render no
   * strip and pass an absence-only assertion, while still paying the read and
   * still arming the expired-session rule on a 401 for a surface that no longer
   * exists.
   *
   * The board refusal below is the CONTROL, not the subject: this case's
   * assertions are absences, and an absence passes just as well against a page
   * that threw before it rendered anything.
   *
   * This block replaces "Project page: the attention strip refuses out loud
   * rather than rendering nothing". That property has not been dropped — the
   * refusals case above asserts the identical sentence on `/my-work`, which is
   * now the only page that mounts the strip.
   */
  it('Project page: no attention strip, and the attention read is never made', async () => {
    const getAttention = vi.fn(async () => [ATTENTION_ITEM]);
    render(
      <Providers
        services={stubServices({
          getBoard: () => Promise.reject(new Error('GET /v1/projects/p1/board failed: 404')),
          getAttention,
        })}
      >
        <ProjectPage />
      </Providers>,
    );

    // CONTROL — the project page rendered, and rendered its board arm.
    expect(await screen.findByText(/The board could not be loaded/)).toBeInTheDocument();

    // The strip is absent...
    expect(screen.queryByRole('complementary', { name: 'Needs your attention' })).not.toBeInTheDocument();
    // ...and so is the read behind it. This is the half an absence cannot reach:
    // `getAttention` is stubbed to ANSWER here, so a page that still called it
    // would draw a strip and fail the line above as well as this one.
    expect(getAttention).not.toHaveBeenCalled();
  });

  /**
   * 13.882 — and the removal is a PROJECT-PAGE change and nothing wider.
   *
   * 13.881's assertions are both absences; on their own they are satisfied by
   * deleting the strip everywhere. This is the paired positive, on the route the
   * owner named as the one that keeps it: the same read, the same component,
   * rendered.
   */
  it('My Work: the same read still renders the strip', async () => {
    const getAttention = vi.fn(async () => [ATTENTION_ITEM]);
    render(
      <Providers services={stubServices({ getAttention })}>
        <MyWorkPage />
      </Providers>,
    );

    const strip = await screen.findByRole('complementary', { name: 'Needs your attention' });
    expect(within(strip).getByText('File the GST return')).toBeInTheDocument();
    expect(
      within(strip).getByText('Needed by 2026-08-30 — due within 7 days.'),
    ).toBeInTheDocument();
    expect(getAttention).toHaveBeenCalled();
  });

  /**
   * 12.382 — case 12.258 asserted the CAP REFUSAL and recorded, with an owner, that
   * *"what the WEB SHELL renders when `getTickets` throws past the cap is not exercised
   * anywhere … a refusal nobody renders is a blank screen with a good conscience."*
   * This renders it, with the REAL `LIST_TOO_LARGE_ABSENCE` rather than a hand-made
   * error, so the case pins the string a user actually meets and reddens if that prose
   * changes.
   *
   * **It measured more than 12.322 records, and the measurement has since been acted
   * on.** That row says a project past the cap *"loses three of four tabs"*. One
   * `useTicketList` read fed all four consumers on this page — the create region,
   * Calendar, Timeline and List — so `New ticket` was not offered either, and a user
   * whose project grew past the bound could not create a ticket in it on any tab. The
   * create region no longer gates on that read (project-root creation never needed a
   * parent), so what remains here is the LIST half, on the tabs that show a list.
   */
  it('Project page: past the list cap, the refusal renders in the absence’s own words', async () => {
    render(
      <Providers
        services={stubServices({
          getTickets: () =>
            Promise.reject(new ServingGapError('getTickets', [LIST_TOO_LARGE_ABSENCE])),
          // Types are stubbed so ONLY the list refuses, keeping the page in the state
          // this case names. **It is not load-bearing for any assertion here** —
          // deleting it leaves all ten cases green, measured — because nothing below
          // reads `New ticket`; the creation half is 3.142's, in its own harness. Kept
          // so the fixture describes one refusing read rather than two, and said
          // plainly rather than claimed to protect an assertion it does not.
          getTicketTypes: async () => [
            { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errands', fields: [] },
          ],
        })}
      >
        <ProjectPage />
      </Providers>,
    );

    // The creation half of this measurement is asserted by 3.142 in
    // `project-create-gate.test.tsx`, which drives the dialog open and reads the parent
    // field. It is NOT re-asserted here: that case owns the dialog's contents and this
    // one owns the refusal, and splitting them keeps each failure naming one thing.

    // **The tab click is load-bearing, and this is the behaviour change it pins.**
    // `view` starts at `'board'`, and past the cap the BOARD tab now carries no list
    // refusal at all: the only renderers of `list.error` are the List, Calendar and
    // Timeline arms. It used to be tab-independent, because `createRegion` — which sits
    // inside the tablist and renders on every tab — refused there. Decoupling creation
    // from the list read removed that renderer, deliberately: its `what` read *"The
    // tickets that could be a parent, so New ticket is not offered"*, and that sentence
    // is now FALSE — `New ticket` IS offered, at project root. A refusal cannot be left
    // standing on a tab to say something untrue.
    //
    // Nothing false replaces it on the board: the board tab draws the BOARD read, which
    // is a different query, and no spinner and no empty table stand in the list's place
    // there. The user learns of the cap on the three tabs that show the list, and in the
    // create dialog's parent field, which names the unavailability (3.142). Recorded as
    // a design call the owner can reverse in a sentence, not as an accident.
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'List' }));

    // The refusal carries the absence's OWN words, not a paraphrase. Taken FROM the
    // absence rather than a re-imported constant: `LIST_ROW_CAP` is not exported through
    // this entrypoint, and importing it anyway yielded `undefined`, which made the
    // matcher `/undefined/` and failed for a reason unrelated to the page.
    // Read off the refusal ELEMENT rather than by text match: `ShellRefusal` renders
    // `what` and `message` as separate nodes, so a text matcher spans a boundary and
    // reports "broken up by multiple elements" — a harness failure that looks exactly
    // like an absent refusal.
    //
    // And the matched node must be the LIST's refusal, not merely SOME refusal carrying
    // the cap's prose. **Two** `role="status"` nodes stand at each assertion point, not
    // three — attention plus whichever tab arm is mounted, since the board arm unmounts
    // when the tab changes. (This comment said three until it was measured; the count
    // was inferred from the stubs rather than read off the page, which is the habit the
    // rest of this file exists to refuse.) The compound matcher is load-bearing
    // regardless of the number: a bare `.some(includes(ownWords))` would pass if the cap
    // text ever leaked into another read's message, which is the sort of pass that
    // survives the defect it was written to catch.
    const ownWords = LIST_TOO_LARGE_ABSENCE.because.slice(0, 40);
    await waitFor(() => {
      const statuses = screen.getAllByRole('status').map((node) => node.textContent ?? '');
      expect(
        statuses.some(
          (text) => text.includes('The ticket list could not be loaded — reload to try again.') && text.includes(ownWords),
        ),
      ).toBe(true);
    });

    // Paired, as every case in this file is: the refusal present AND what would
    // otherwise stand in its place absent. `Loading…` alone would NOT be that pair —
    // it is absent on the board tab too, under these stubs, so keeping only it would
    // let the case pass without ever depending on the click above. `TicketList`'s own
    // summary is the thing the List arm renders when the read answers, so its absence
    // is what says the refusal took the arm rather than sitting beside a drawn list.
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-summary')).not.toBeInTheDocument();
  });

  /**
   * 12.385 — THE WAY OUT OF THE CLIFF IS REACHABLE FROM INSIDE IT.
   *
   * 12.382 above proves the refusal renders. This proves the user who meets it can do
   * something about it, which is the half that makes the refusal survivable rather
   * than merely honest.
   *
   * **The placement is the property, not the markup.** Every renderer of the list —
   * the List, Calendar and Timeline arms — lives inside `list.error === null`. A
   * narrowing control put among them is reachable by everyone EXCEPT the person past
   * the cap, because for that person those arms render a refusal instead. It is the
   * same mistake `createRegion` made until #270 and it fails the same way: the
   * affordance exists, is tested, and is unreachable in the one state it was built
   * for.
   *
   * So this case asserts it from the state that matters — `getTickets` refusing with
   * the real `LIST_TOO_LARGE_ABSENCE` — and pairs the control's presence with the
   * refusal's, because a control on a page with no refusal would prove nothing about
   * this state, and a refusal with no control is the cliff as it stood.
   */
  it('12.385 past the cap, the narrowing control is on the page beside the refusal', async () => {
    const user = userEvent.setup();
    render(
      <Providers
        services={stubServices({
          getTickets: () =>
            Promise.reject(new ServingGapError('getTickets', [LIST_TOO_LARGE_ABSENCE])),
          getTicketTypes: async () => [
            { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errands', fields: [] },
          ],
        })}
      >
        <ProjectPage />
      </Providers>,
    );

    // Present in the refusing state, and reached WITHOUT first going to a tab that
    // renders a list — there is none to go to.
    const narrow = await screen.findByRole('checkbox', { name: 'Only tickets in progress' });
    expect(narrow).toBeInTheDocument();

    // Paired with the thing that makes the state real. Without this the case would
    // pass on a page whose list answered, where the control is not the point.
    const ownWords = LIST_TOO_LARGE_ABSENCE.because.slice(0, 40);
    await user.click(await screen.findByRole('tab', { name: 'List' }));
    await waitFor(() => {
      const statuses = screen.getAllByRole('status').map((node) => node.textContent ?? '');
      expect(statuses.some((text) => text.includes(ownWords))).toBe(true);
    });

    // And it is operable, not merely rendered: ticking it states the narrowing on the
    // page itself. Past the cap there is no list, so the list's own summary cannot be
    // the only place the question's state is visible.
    await user.click(narrow);
    expect(await screen.findByTestId('list-filter-note')).toHaveTextContent(
      'asking only for tickets in progress',
    );
  });

  /**
   * 12.389 — A NARROWING MUST NOT TURN A SECTION HEADING INTO A ULID.
   *
   * `epicTitle` resolves an epic by searching `list.rows`, with `?? epicId` as the
   * fallback. That was safe while `list.rows` was always the COMPLETE set: any epic a
   * surviving child pointed at was necessarily in it. A narrowing breaks the invariant
   * — an `open` or `terminal` epic is filtered out while its `active` children survive
   * and are correctly rooted by `nestRows` — so the lookup misses and a 26-character
   * ULID appears where a section title belongs.
   *
   * Named rather than printed raw, and ONLY when a narrowing can explain it: with no
   * narrowing in force a missing epic means something else (visibility), and saying
   * "outside this narrowing" there would be inventing a reason. The control below is
   * that half.
   */
  it('12.389 an epic filtered out of the rows is named, not rendered as its id', async () => {
    const user = userEvent.setup();
    const EPIC = '01J9TICKET00000000000000EP';
    const CHILD = '01J9TICKET00000000000000CH';
    const row = (id: string, title: string, category: 'active' | 'terminal', epicId: string | null) => ({
      ticketId: id,
      title,
      // REQUIRED on the row since 2026-09-22 (the List's Key column).
      key: 'CCSO-7',
      typeId: epicId === null ? 'epic' : 'task',
      typeRank: epicId === null ? 1 : 3,
      parentId: epicId,
      epicId,
      stateId: category === 'active' ? 'doing' : 'done',
      stateName: category === 'active' ? 'Doing' : 'Done',
      stateCategory: category,
      stateProvenance: PROVENANCE_387,
      assignee: null,
      assignedProvenance: null,
      dueDate: null,
      // REQUIRED since spec 2026-09-22 and never nullable; the birth default,
      // attributed to the same seeded claimant `PROVENANCE_387` names.
      priority: { value: 'P2' as const, claim: PROVENANCE_387 },
      fields: {},
      rollup: null,
      hasRestrictedParent: false,
      pending: false,
      closed: null,
      rank: null,
    });
    render(
      <Providers
        services={stubServices({
          getBoard: async () => BOARD_WITH_DONE,
          // The narrowed answer drops the epic and keeps its child — exactly what the
          // server does, since the epic is terminal and the child is not.
          getTickets: async (_p: string, filter: { stateCategories?: string[] }) => ({
            projectId: '01J9PROJECT000000000000000',
            rows:
              filter.stateCategories === undefined
                ? [row(EPIC, 'Rewire the shop sign', 'terminal', null), row(CHILD, 'Chase the vendor', 'active', EPIC)]
                : [row(CHILD, 'Chase the vendor', 'active', EPIC)],
          }),
          getTicketTypes: async () => [
            { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errands', fields: [] },
          ],
          getPreferences: async () => ({
            version: 1 as const,
            projects: {
              '01J9PROJECT000000000000000': {
                columns: { origin: 'default' as const },
                grouping: { origin: 'stored' as const, value: 'epic' as const },
              },
            },
            savedFilters: [],
          }),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await user.click(await screen.findByRole('tab', { name: 'List' }));

    // CONTROL first: unnarrowed, the real title is the heading. Without this the case
    // would pass against a page that never renders a title at all.
    expect(await screen.findByRole('region', { name: 'Rewire the shop sign' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Only tickets in progress' }));

    // The child survives and is still on screen — the heading is the only thing at issue.
    expect(await screen.findByText('Chase the vendor')).toBeInTheDocument();
    // And no ULID is standing in for a title.
    expect(screen.queryByRole('region', { name: EPIC })).not.toBeInTheDocument();
    expect(
      await screen.findByRole('region', { name: 'An epic outside this narrowing' }),
    ).toBeInTheDocument();
  });

  /**
   * 12.387 — THE NOTE MAY NOT CLAIM A SURFACE IT DOES NOT NARROW.
   *
   * The control renders on every tab, which 12.385 requires. But it narrows only the
   * reads that TAKE a filter, and `useBoard` takes none — so an unscoped *"done are
   * excluded"* sits on the DEFAULT tab directly above a Done column holding a done
   * card. That is an unnarrowed set claiming to be narrowed: the same class of lie as
   * a narrowed one claiming to be whole, and the reason this control exists at all.
   */
  it('12.387 the narrowing note names the surfaces it narrows, and exempts the board', async () => {
    const user = userEvent.setup();
    render(
      <Providers
        services={stubServices({
          getBoard: async () => BOARD_WITH_DONE,
          getTickets: async () => ({ projectId: '01J9PROJECT000000000000000', rows: [] }),
          getTicketTypes: async () => [
            { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errands', fields: [] },
          ],
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await user.click(await screen.findByRole('checkbox', { name: 'Only tickets in progress' }));

    // The board is the DEFAULT tab, so this is what a user sees first.
    expect(await screen.findByRole('tab', { name: 'Board' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // The done card really is still on the board — without this the note could be
    // exempting the board from a narrowing that had no visible effect there anyway.
    expect(await screen.findByText('Old sign taken down')).toBeInTheDocument();
    expect(screen.getByTestId('list-filter-note')).toHaveTextContent('The board is not narrowed');
    // The tabs it NAMES moved with E5-40 (2026-09-21): the note said "the list,
    // calendar and timeline" over three tabs of five, leaving the Backlog out —
    // and the Backlog is the one the toggle empties rather than narrows. The
    // assertion names all four now, because the note's whole job is to name the
    // surfaces, and a surface it forgets is one this test would not catch.
    expect(screen.getByTestId('list-filter-note')).toHaveTextContent(
      'the list, calendar, timeline and backlog are asking only for tickets in progress',
    );
    expect(screen.getByTestId('list-filter-note')).toHaveTextContent('the backlog is emptied');
  });

  it('Project page: the board tab shows the board read’s own failure, not "Loading…"', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: () => Promise.reject(new Error('GET /v1/projects/p1/board failed: 404')),
        })}
      >
        <ProjectPage />
      </Providers>,
    );

    expect(await screen.findByText(/The board could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText(/GET \/v1\/projects\/p1\/board failed: 404/)).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });
});

/**
 * ## 3.141 — THE RULE WAS DOCUMENTED FOR THREE PAGES AND BUILT ON ONE
 *
 * `Features.md` and case 3.86 both stated, unconditionally, that *"a 401 is
 * deliberately NOT a refusal … it redirects to `/sign-in`"*. Enumerated:
 * `app/workspaces/page.tsx:25` did it and the other two data-reading pages did
 * not, so an expired session on `/w/<id>/my-work` or `/w/<id>/p/<id>` rendered
 * *"My Work could not be loaded — HTTP 401 for /v1/me/work"* — a refusal panel
 * naming a serving gap that was not the cause, with nothing the viewer could act
 * on. It survived because the ONLY 401 case in this file was on the page that
 * already worked, so no mutation to the other two could go red.
 *
 * A case per page, therefore. Each asserts three things, because any one of them
 * passes for the wrong page's reason: the push happened, the notice is on
 * screen, and NO refusal panel is. The control at the end is what makes the
 * predicate a measurement rather than a redirect that fires on everything.
 */
describe('3.141 an expired session sends the viewer to sign in — on ALL THREE data-reading pages', () => {
  const expired = (path: string) => () => Promise.reject(new HttpError(401, path));

  it('13.1160 My Work: both reads 401, and the page says so instead of refusing', async () => {
    render(
      <Providers
        services={stubServices({
          getMyWork: expired('/v1/me/work'),
          getAttention: expired('/v1/workspaces/w1/attention'),
        })}
      >
        <MyWorkPage />
      </Providers>,
    );
    // E5-32: the destination is CARRIED, not dropped — the manual promises the
    // person is put back on the page they were trying to reach.
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/sign-in?next=${encodeURIComponent('/w/01J9WORKSPACE0000000000000/p/01J9PROJECT000000000000000')}`,
      ),
    );
    expect(await screen.findByText(EXPIRED_SESSION_COPY)).toBeInTheDocument();
    // The half that makes it a test: the sentence this page used to show —
    // named specifically, per the same reasoning as the Workspaces case above.
    expect(screen.queryByText(/My Work could not be loaded/)).not.toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('13.1160 Project page: every read this page makes 401s, and one notice stands in for all of them', async () => {
    // **The stub set was FIVE reads and the page makes THREE, and that gap is
    // the reason this case was renamed rather than left alone.** It read "every
    // read 401s, and one notice stands in for all four" — a count that was true
    // when `useAttention` was one of this page's reads. The attention strip left
    // the project page on 2026-09-18 (case 13.881), so `getAttention` below
    // became a stub for a read this page does not make, and the count of reads
    // the hook actually receives is now three. `getPreferences` was ALREADY
    // dead before that: `usePreferences` appears on this page only inside a
    // prose comment (`page.tsx:317` records why persisting is a separate
    // change), and `stubServices`'s own default for it ANSWERS rather than
    // rejecting, so the override could never have been load-bearing. Both are
    // removed below — an override for a read a page never makes is a fixture
    // telling the next reader that it does.
    render(
      <Providers
        services={stubServices({
          getBoard: expired('/v1/projects/p1/board'),
          getTickets: expired('/v1/projects/p1/tickets'),
          getTicketTypes: expired('/v1/workspaces/w1/ticket-types'),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith(SIGN_IN_WITH_NEXT));
    // ONE, printed as a list: three reads failed together and they are one event.
    const texts = (await screen.findAllByRole('status')).map((node) => node.textContent ?? '');
    expect(texts).toEqual([EXPIRED_SESSION_COPY]);
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
  });

  it('the predicate is ANCHORED, so a refusal that merely mentions 401 does not redirect', async () => {
    // The status is a number the transport still has — `HttpError.status` — and
    // `LiveQueryResult.error` is a `string`, so this shell recovers it from the
    // message. `startsWith`, not `includes`: `HttpError`'s message is
    // `HTTP ${status} for ${path}`, one line, that constructor, and it is the
    // only producer. The rows are PRINTED rather than counted so a failure says
    // which message was read the wrong way.
    const verdicts = [
      'HTTP 401 for /v1/me/work',
      'HTTP 404 for /v1/me/preferences',
      // The shape the loose `message.includes('401')` this shell used to carry
      // would have swallowed: a refusal whose prose happens to contain the
      // digits. `ServingGapError` messages concatenate every absence's `because`
      // and `owner`, and those name routes, fields and issue numbers.
      'response mapping failed at getMyWork: expected facts the shipped route does not serve — see ticket 401',
      null,
    ].map((message) => [message, isExpiredSession(message)]);
    expect(verdicts).toEqual([
      ['HTTP 401 for /v1/me/work', true],
      ['HTTP 404 for /v1/me/preferences', false],
      [
        'response mapping failed at getMyWork: expected facts the shipped route does not serve — see ticket 401',
        false,
      ],
      [null, false],
    ]);
  });

  it('CONTROL: a ServingGapError is NOT a 401, and nothing redirects', async () => {
    // Without this, `useSignInOnExpiredSession` could push on every failure and
    // all three cases above would still be green — and the shell would send a
    // member with a perfectly good session to sign in again over a serving gap.
    // `stubServices({})` is the shipped server's own state: four refusals whose
    // messages carry route names, field names and owners.
    render(
      <Providers services={stubServices({})}>
        <MyWorkPage />
      </Providers>,
    );
    expect(await screen.findByText(/My Work could not be loaded/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText(EXPIRED_SESSION_COPY)).not.toBeInTheDocument();
  });
});

describe('17.070 the shared refusal panel says what to DO (E5-30)', () => {
  /**
   * 17.070 — E5-30. The panel on every refusing read rendered
   * `"{what} could not be loaded — reload to try again."` followed by the transport's raw string —
   * `LiveQueryResult.error`, which is the stringified cause. So a 500 read *"Your
   * inbox cannot be shown yet. HTTP 500 for /v1/me/notifications"*: a sentence
   * that says the read failed, never that a RELOAD is the way out, and which
   * appends a status code to a person who cannot act on one.
   *
   * The two halves are one change and are asserted together: the sentence says
   * what to do, and the wire string is still PRESENT — carried rather than
   * dropped, because the panel exists to show the authority's own words and a
   * paraphrase would be the shell making a claim about someone else's code.
   */
  it('17.070 names the action, and still carries the transport’s own words', async () => {
    render(
      <Providers
        services={stubServices({
          getMyWork: () => Promise.reject(new Error('HTTP 500 for /v1/me/work')),
        })}
      >
        <MyWorkPage />
      </Providers>,
    );

    // Scoped to the panel's own class rather than `role="status"`: the page
    // carries other status roles (the attention strip's arm among them), so the
    // role query is ambiguous and reddens for a reason that is not this case's.
    await screen.findByText(/My Work could not be loaded/);
    // The page carries TWO refusal panels (My Work's own and the attention
    // strip's), so this picks the one this case is about rather than the first
    // in document order — a bare `querySelector` found the strip's.
    const panel = Array.from(document.querySelectorAll('.gn-shell__refusal')).find((node) =>
      (node.textContent ?? '').includes('My Work could not be loaded'),
    ) as HTMLElement;
    expect(panel).not.toBeUndefined();
    expect(panel).toHaveTextContent('My Work could not be loaded — reload to try again.');
    // The wire string is kept, on its OWN line rather than spliced into the
    // sentence — the two are different kinds of statement.
    const wire = panel.querySelector('.gn-shell__refusal-wire');
    expect(wire).not.toBeNull();
    expect(wire?.textContent).toContain('HTTP 500 for /v1/me/work');
    // And the old wording is gone rather than sitting beside the new one.
    expect(panel.textContent ?? '').not.toContain('cannot be shown yet');
  });
});
