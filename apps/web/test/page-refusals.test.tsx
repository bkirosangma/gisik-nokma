import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, LIST_TOO_LARGE_ABSENCE, ServingGapError } from '@gisik-nokma/app-core/online';
import { Providers } from '../src/providers.js';
import { EXPIRED_SESSION_COPY, isExpiredSession } from '../src/expired-session.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * ## THE ADAPTATION THIS FILE EXISTS TO PROVE
 *
 * FOUR of the THIRTEEN `DataSourceQuery` methods answer with a `ServingGapError`
 * — six until ruling P25 clause 1 served `getTickets`' and `getTicket`'s gaps
 * that ENUMERATES the facts the shipped routes do not serve. Four of the six —
 * `getMyWorkspaces`, `getMyWork`, `getAttention`, `getTickets` — are called by
 * pages in this shell, and the plan text (written before those refusals
 * existed) renders each of them as `data === null ? <p>Loading…</p> : …`, with
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
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: '01J9WORKSPACE0000000000000', projectId: '01J9PROJECT000000000000000' }),
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
      expect.stringContaining('What needs your attention cannot be shown yet.'),
      expect.stringContaining('My Work cannot be shown yet.'),
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
    expect(screen.queryByRole('complementary', { name: 'Needs attention' })).not.toBeInTheDocument();
  });

  it('Workspaces: the list refuses, and the page does not claim there are none', async () => {
    render(
      <Providers services={stubServices({})}>
        <WorkspacesPage />
      </Providers>,
    );

    expect(await screen.findByText(/Your workspaces cannot be shown yet\./)).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No workspaces yet. Ask an admin for an invite link.'),
    ).not.toBeInTheDocument();
  });

  it('Workspaces: a 401 is NOT a refusal — it sends the viewer to sign in', async () => {
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
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sign-in'));
    expect(screen.queryByText(/cannot be shown yet/)).not.toBeInTheDocument();
    expect(await screen.findByText(EXPIRED_SESSION_COPY)).toBeInTheDocument();
    // Not a spinner either. With the refusal suppressed the page falls through
    // to `workspaces === null`, which without the notice is `Loading…` over a
    // read that has already failed.
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('Project page: the attention strip refuses out loud rather than rendering nothing', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: () => Promise.reject(new Error('GET /v1/projects/p1/board failed: 404')),
        })}
      >
        <ProjectPage />
      </Providers>,
    );

    expect(
      await screen.findByText(/What needs your attention cannot be shown yet\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Needs attention' })).not.toBeInTheDocument();
  });

  /**
   * 12.382 — case 12.258 asserted the CAP REFUSAL and recorded, with an owner, that
   * *"what the WEB SHELL renders when `getTickets` throws past the cap is not exercised
   * anywhere … a refusal nobody renders is a blank screen with a good conscience."*
   * This renders it, with the REAL `LIST_TOO_LARGE_ABSENCE` rather than a hand-made
   * error, so the case pins the string a user actually meets and reddens if that prose
   * changes.
   *
   * **And it measures more than 12.322 records.** That row says a project past the cap
   * *"loses three of four tabs"*. One `useTicketList` read feeds all four consumers on
   * this page — the create region, Calendar, Timeline and List — so **`New ticket` is
   * not offered either.** A user whose project grew past the bound cannot create a
   * ticket in it, on any tab. That is asserted here rather than narrated, because it is
   * the part a design decision most needs to know.
   */
  it('Project page: past the list cap, three tabs AND New ticket all refuse', async () => {
    render(
      <Providers
        services={stubServices({
          getTickets: () =>
            Promise.reject(new ServingGapError('getTickets', [LIST_TOO_LARGE_ABSENCE])),
        })}
      >
        <ProjectPage />
      </Providers>,
    );

    // The create affordance is gone, and says so — the half 12.322 does not record.
    expect(
      await screen.findByText(/The tickets that could be a parent, so New ticket is not offered/),
    ).toBeInTheDocument();

    // The refusal carries the absence's OWN words, not a paraphrase. Taken FROM the
    // absence rather than from a re-imported constant: `LIST_ROW_CAP` is not exported
    // through this entrypoint, and importing it anyway yielded `undefined`, which made
    // the matcher `/undefined/` and failed for a reason unrelated to the page.
    const ownWords = LIST_TOO_LARGE_ABSENCE.because.slice(0, 60);
    expect(screen.getByText(new RegExp(ownWords.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();

    // Paired, as every case in this file is: the refusal present AND what would
    // otherwise stand in its place absent.
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
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

    expect(await screen.findByText(/The board cannot be shown yet\./)).toBeInTheDocument();
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
 * *"My Work cannot be shown yet — HTTP 401 for /v1/me/work"* — a refusal panel
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

  it('My Work: both reads 401, and the page says so instead of refusing', async () => {
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
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sign-in'));
    expect(await screen.findByText(EXPIRED_SESSION_COPY)).toBeInTheDocument();
    // The half that makes it a test: the sentence this page used to show.
    expect(screen.queryByText(/cannot be shown yet/)).not.toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('Project page: every read 401s, and one notice stands in for all four', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: expired('/v1/projects/p1/board'),
          getTickets: expired('/v1/projects/p1/tickets'),
          getAttention: expired('/v1/workspaces/w1/attention'),
          getTicketTypes: expired('/v1/workspaces/w1/ticket-types'),
          getPreferences: expired('/v1/me/preferences'),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sign-in'));
    // ONE, printed as a list: four reads failed together and they are one event.
    const texts = (await screen.findAllByRole('status')).map((node) => node.textContent ?? '');
    expect(texts).toEqual([EXPIRED_SESSION_COPY]);
    expect(screen.queryByText(/cannot be shown yet/)).not.toBeInTheDocument();
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
    expect(await screen.findByText(/My Work cannot be shown yet\./)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText(EXPIRED_SESSION_COPY)).not.toBeInTheDocument();
  });
});
