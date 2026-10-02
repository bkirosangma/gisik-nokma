import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ServingGapError, SERVING_GAPS, mapMyWork } from '../../src/online/mappers.js';
import type { MyWorkView, WorkItem } from '../../src/view-types.js';
import { MyWork, useMyWork } from '../../src/views/my-work.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, claim, contestedClaim } from '../helpers/seed.js';

const GST: WorkItem = {
  ticketId: 't1',
  workspaceId: WS,
  projectId: 'prj_1',
  projectName: 'Registrations',
  title: 'File the GST return',
  stateId: 'doing',
  stateName: 'Doing',
  stateCategory: 'active',
  stateProvenance: claim(),
  dueDate: { date: '2026-08-30', claim: claim({ actorId: 'user_kiro', actorName: 'Kiro' }) },
};

const VIEW: MyWorkView = {
  assigned: [GST],
  inTransit: [],
  shared: [],
  contested: [
    {
      ticketId: 't9',
      title: 'Bank mandate',
      rule: 'restrict-to',
      reason: 'Only the assignee may perform this transition.',
      claim: contestedClaim(),
    },
  ],
};

describe('3.59 MyWork — assigned, in transit, contested (spec §7)', () => {
  /* 13.307 — the four My Work section headings, witnessed across two cases: the
   * three asserted here, and `Shared with me` as its own region in the 3.160
   * case below. */
  it('renders the three sections', () => {
    render(<MyWork view={VIEW} onOpenTicket={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Assigned to me' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'My claims in transit' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'My contested claims' })).toBeInTheDocument();
  });

  it('renders assigned items with project, state provenance title and the attributed due claim', () => {
    render(<MyWork view={VIEW} onOpenTicket={vi.fn()} />);
    const assigned = screen.getByRole('region', { name: 'Assigned to me' });
    expect(within(assigned).getByText('File the GST return')).toBeInTheDocument();
    expect(within(assigned).getByText('Registrations')).toBeInTheDocument();
    expect(within(assigned).getByText("needed by 30 Aug 2026, Kiro's claim")).toBeInTheDocument();
    expect(
      within(assigned).getByTitle('marked Doing by Anselma Marak on 19 Aug 2026'),
    ).toBeInTheDocument();
  });

  // Amended 2026-09-29 by 6.254 (R3 N4): attributed as Unknown person, not by id.
  it('PLANTED DEFECT: a nameless due claim is still attributed — a deadline is never an unowned property', () => {
    const nameless: MyWorkView = {
      ...VIEW,
      assigned: [
        { ...GST, dueDate: { date: '2026-08-30', claim: claim({ actorId: 'user_kiro', actorName: null }) } },
      ],
    };
    render(<MyWork view={nameless} onOpenTicket={vi.fn()} />);
    expect(screen.getByText("needed by 30 Aug 2026, Unknown person's claim")).toBeInTheDocument();
  });

  it('PLANTED DEFECT: an item with no due date renders no due line — no invented deadline', () => {
    const undated: MyWorkView = { ...VIEW, assigned: [{ ...GST, dueDate: null }] };
    const { container } = render(<MyWork view={undated} onOpenTicket={vi.fn()} />);
    expect(container.querySelector('.gn-my-work__due')).toBeNull();
    expect(container.textContent).not.toContain('needed by');
  });

  it('renders a contested claim with the rule named, the reason verbatim and the claim provenance', () => {
    render(<MyWork view={VIEW} onOpenTicket={vi.fn()} />);
    const contested = screen.getByRole('region', { name: 'My contested claims' });
    expect(within(contested).getByText('Bank mandate')).toBeInTheDocument();
    expect(within(contested).getByText(/restrict-to/)).toBeInTheDocument();
    expect(
      within(contested).getByText('Only the assignee may perform this transition.'),
    ).toBeInTheDocument();
    // Ruling P39. This asserted 'claimed by Anselma Marak on 19 Aug 2026', and
    // BOTH of those facts were ones a refused claim cannot carry: there is no
    // `actorName` to resolve and no `serverTime` to date it by. The line now
    // names the actor by raw id and labels BOTH recorded instants — the
    // claimant's device clock, and the server's stamp on the CONTEST — so a
    // reader cannot mistake the second for when the claim was made.
    expect(
      within(contested).getByText(/claimed by Unknown person at .* by their clock, refused /),
    ).toBeInTheDocument();
    // The excluding half, in the same run: no rendered text dates this claim by
    // a server instant it never had. `contestedClaim()` carries no `serverTime`
    // at all, so a renderer reaching for one prints `undefined` here.
    expect(within(contested).queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it('PLANTED DEFECT: the contested reason is the engine’s, not a paraphrase — and the rule is named beside it', () => {
    // The reason and the rule are two different facts and both come off the
    // `claim.contested` ledger event. A card that showed only the rule leaves
    // the user reading a slug; one that showed only the reason leaves them
    // unable to say which rule turned the claim away.
    const contested: MyWorkView = {
      assigned: [],
      inTransit: [],
      shared: [],
      contested: [
        {
          ticketId: 't9',
          title: 'Bank mandate',
          rule: 'four-eyes',
          reason: 'The person who requested this may not also approve it.',
          claim: contestedClaim(),
        },
      ],
    };
    const { container } = render(<MyWork view={contested} onOpenTicket={vi.fn()} />);
    expect(screen.getByText('four-eyes')).toBeInTheDocument();
    expect(
      screen.getByText('The person who requested this may not also approve it.'),
    ).toBeInTheDocument();
    expect(container.querySelector('.gn-my-work__reason')?.textContent).toBe(
      'The person who requested this may not also approve it.',
    );
  });

  it('opens the ticket from either an assigned card or a contested one', async () => {
    const user = userEvent.setup();
    const onOpenTicket = vi.fn();
    render(<MyWork view={VIEW} onOpenTicket={onOpenTicket} />);
    await user.click(screen.getByRole('button', { name: 'File the GST return' }));
    await user.click(screen.getByRole('button', { name: 'Bank mandate' }));
    expect(onOpenTicket.mock.calls).toEqual([['t1'], ['t9']]);
  });
});

/**
 * `inTransit` EMPTY IS THE TRUTH FOR THIS CLIENT, and the reason matters more
 * than the emptiness.
 *
 * `inTransit` is the REPLICA'S OUTBOX (Plan 10). The web client is online-only
 * — SPEC §5 line 104, whose same section places the outbox in the mobile and
 * desktop replicas and nowhere else; Plan 6 carries it at line 23 and cites it
 * as "spec §5" there. ("Plan 6 §5" was a MISCITATION, not a shorthand, and was
 * corrected 2026-09-02 at `online/mappers.ts` and the coordination doc — Plan 6
 * has no §5.) So this client has no outbox — there is no place a claim in transit could be
 * held — so `[]` here is a fact about this client's CONSTRUCTION, not a read
 * that came back with nothing. Those are different facts and only one of them
 * is true here: an assertion resting on "the read returned nothing" would still
 * pass the day the read broke.
 *
 * The register agrees, and that is the falsifiable half of the claim rather
 * than a comment restating it: `mapMyWork` **used to** refuse over `contested` —
 * **⚠ CORRECTED 2026-09-20: rulings P39/P40 served it, and the register has been
 * empty since 2026-09-19. The surviving half of this sentence is the second one,
 * which was always the load-bearing part: `inTransit` is deliberately NOT listed
 * as a serving gap** — and deliberately does NOT list `inTransit` as such.
 */
describe('3.58 MyWork — the in-transit section is empty because there is no outbox, not because a read was empty', () => {
  /* 13.308 — `No claims in transit.` verbatim. Noted in the catalogue: the four
   * sentences are NOT asserted in one all-empty render; this one rides the
   * spec's own fixture, whose only empty section is in-transit. */
  it('renders the empty state, and the reason is structural', () => {
    render(<MyWork view={VIEW} onOpenTicket={vi.fn()} />);
    const transit = screen.getByRole('region', { name: 'My claims in transit' });
    expect(
      within(transit).getByText('No claims in transit.'),
      'empty because this online-only client has no outbox to hold a claim in transit — NOT because a read came back empty',
    ).toBeInTheDocument();
  });

  it('PLANTED DEFECT: `contested` is SERVED now and `inTransit` is still not a gap — the asymmetry survives its own reason', () => {
    // This case used to read `getMyWork`'s absences and assert that `contested`
    // was among them while `inTransit` was not. Rulings P39 and P40 served
    // `contested`, so half its subject is gone — and the property it existed for
    // is the OTHER half, which is why it is re-aimed rather than deleted.
    //
    // The asymmetry was never about which of the two was harder. `contested`
    // rows exist in `proj_contested`, so `[]` there would have been a claim
    // about the world; `inTransit` is the replica's outbox and an online-only
    // client HAS none, so `[]` there is a fact about this client. The first
    // stopped being a gap the moment a route served it. The second cannot
    // become one by being served, because there is nothing to serve.
    expect(SERVING_GAPS['getMyWork']).toBeUndefined();
    // Which makes the empty state above STRUCTURAL and not a read that came
    // back empty — now provable directly rather than by the register's silence:
    // the mapper returns `[]` for any body at all.
    expect(mapMyWork(
      {
        workspaceId: WS,
        groups: { open: [], active: [], terminal: [] },
        projectNames: {},
        stateNames: {},
        contested: [],
        shared: [],
      },
      new Map(),
    ).inTransit).toEqual([]);
    // And no absence ANYWHERE in the register is about `inTransit` — widened
    // from `getMyWork`'s own list, which no longer exists, to the whole
    // register, which is the stronger form of the same claim.
    const register = Object.entries(SERVING_GAPS)
      .flatMap(([method, absences]) => absences.map((a) => `${method}: ${a.field} :: ${a.because}`))
      .join('\n');
    // **THIS CONTROL'S PRECONDITION IS GONE, and it said so rather than passing.**
    // It read: *"the register must be non-empty or this proves nothing"* — and
    // the register HAS become empty (2026-09-19: `search`, the last entry, is
    // served now), so the assertion below it proves nothing and the control
    // failed loudly instead of measuring nothing. **What does the real work is
    // the line above**, over a served read: `inTransit` is `[]` because there is
    // no outbox, not because a read was empty. The emptiness of the register is
    // the honest replacement.
    expect(SERVING_GAPS).toEqual({});
    expect(
      register,
      'no absence may be about inTransit — it is structurally empty for an online-only client',
    ).not.toContain('inTransit');
  });

  it('PLANTED DEFECT: a claim in transit, when one exists, is badged distinctly from an assigned one', () => {
    // The section is not decorative. Plan 10's replica fills it, and when it
    // does the card must be visibly different from the same ticket sitting in
    // "Assigned to me" — otherwise a claim the server has never seen reads as
    // a claim it accepted.
    const withTransit: MyWorkView = { ...VIEW, inTransit: [GST] };
    render(<MyWork view={withTransit} onOpenTicket={vi.fn()} />);
    const transit = screen.getByRole('region', { name: 'My claims in transit' });
    const assigned = screen.getByRole('region', { name: 'Assigned to me' });
    expect(within(transit).getByText('claim in transit')).toBeInTheDocument();
    expect(within(transit).queryByText('No claims in transit.')).not.toBeInTheDocument();
    expect(within(assigned).queryByText('claim in transit')).not.toBeInTheDocument();
  });

  /* 13.307 — the fourth heading; 13.308 — `Nothing has been shared with you.`
   * and `Nothing assigned to you.` asserted together under an ALL-EMPTY view. */
  it('3.160 the Shared with me section renders its rows, and says so when it has none', () => {
    // The section exists whether or not it has rows: a section that vanished
    // when empty is indistinguishable from one that failed to load, and for the
    // guest this key exists for it is the ONLY section that can ever be
    // non-empty.
    const empty = { assigned: [], inTransit: [], contested: [], shared: [] };
    const { unmount } = render(<MyWork view={empty} onOpenTicket={vi.fn()} />);
    const region = screen.getByRole('region', { name: 'Shared with me' });
    expect(within(region).getByText('Nothing has been shared with you.')).toBeInTheDocument();
    unmount();

    // With a row, the empty sentence is GONE and the errand is named. Both
    // halves, because "the row renders" passes on a section that also still
    // claims to be empty.
    render(<MyWork view={{ ...empty, shared: [GST] }} onOpenTicket={vi.fn()} />);
    const filled = screen.getByRole('region', { name: 'Shared with me' });
    expect(within(filled).queryByText('Nothing has been shared with you.')).not.toBeInTheDocument();
    expect(within(filled).getByText('File the GST return')).toBeInTheDocument();

    // And it is a SECTION of its own, not more rows in "Assigned to me" — the
    // ticket is shared, not assigned, and the assigned section still says so.
    const assigned = screen.getByRole('region', { name: 'Assigned to me' });
    expect(within(assigned).getByText('Nothing assigned to you.')).toBeInTheDocument();
    expect(within(assigned).queryByText('File the GST return')).not.toBeInTheDocument();
  });

  it('3.161 a shared errand whose project NAME is withheld shows the project ID, not a blank — and is still openable', async () => {
    // `WorkItem.projectName`'s own contract says a withheld name leaves the
    // viewer holding the id, "so the item renders id-only rather than blank" —
    // and the renderer printed `{item.projectName}`, i.e. NOTHING. PRE-EXISTING
    // and reachable before this change (a guest ASSIGNED a ticket in a project
    // they cannot see, 7.108); "Shared with me" is where it becomes the normal
    // case, which is why it is fixed here.
    //
    // The second half is a CORRECTION recorded rather than quietly dropped. An
    // earlier version of this case asserted the withheld row was NOT openable,
    // on the reasoning that a viewer who may not be told a project's name cannot
    // load its page. Review measured that against `routes/board.ts`, which says
    // in writing that a workspace member who is not on the project "passes the
    // gate and gets 200" — a guest IS a workspace member, and the guest arm of
    // `visibleTicketsWhere` is the explicit clause, so their shared ticket is on
    // that board. The gate withheld a WORKING affordance from exactly the person
    // the section is for, so it is gone and this case pins the opposite.
    const withheld: WorkItem = {
      ...GST,
      ticketId: 't-withheld',
      title: 'Collect the shop keys',
      projectName: null,
      projectId: 'prj_withheld',
    };
    const onOpenTicket = vi.fn();
    render(
      <MyWork
        view={{ assigned: [], inTransit: [], contested: [], shared: [withheld, GST] }}
        onOpenTicket={onOpenTicket}
      />,
    );
    const region = screen.getByRole('region', { name: 'Shared with me' });

    // THE ID, NOT A BLANK.
    expect(within(region).getByText('prj_withheld')).toBeInTheDocument();

    // OPENABLE, and it really opens — the row whose name is withheld is the one
    // that must work, since it is the only kind a guest ever has here.
    await userEvent.click(within(region).getByRole('button', { name: 'Collect the shop keys' }));
    expect(onOpenTicket).toHaveBeenCalledWith('t-withheld');

    // The named row beside it, same section, same render: the assertion above
    // is about the WITHHELD row rather than about buttons existing at all.
    await userEvent.click(within(region).getByRole('button', { name: 'File the GST return' }));
    expect(onOpenTicket).toHaveBeenCalledWith('t1');
    expect(onOpenTicket).toHaveBeenCalledTimes(2);
  });

  /* 13.309 — the withheld-name fallback's TITLE text, witnessed.
   *
   * The plan's sentence for this screen has two halves and this file pinned one
   * of them: `projectName === null` rendering the ID (the 3.161 case above).
   * The other half is *why* the id is a fallback rather than a blank — the
   * `title` attribute that tells the viewer the name was withheld from THEM —
   * and until now a string that nothing checked carried the fallback's whole
   * reason for existing.
   *
   * THE TRAP, recorded at the site because it is the task: the source spells
   * this string with **U+2019**, and the PLAN that specifies this screen spells it
   * with a straight U+0027 (`docs/superpowers/plans/2026-09-08-hig-per-screen.md:902`,
   * and `docs/hig-reconciliation-audit.md:729` after it). A case transcribed from
   * either therefore compares the wrong character, fails, and fails in the shape of
   * a MISSING FALLBACK rather than a wrong apostrophe. The two controls below are
   * what make those two situations tellable apart.
   *
   * The catalogue row this case was minted from carried the straight form too, until
   * this change corrected it on 2026-09-18 — so the row is no longer a source of the
   * wrong character, and the plan still is.
   */
  it('13.309 the withheld-name fallback carries its exact title text', () => {
    const withheld: WorkItem = {
      ...GST,
      ticketId: 't-withheld-title',
      title: 'Collect the shop keys',
      projectName: null,
      projectId: 'prj_withheld',
    };
    render(
      <MyWork
        view={{ assigned: [], inTransit: [], contested: [], shared: [withheld, GST] }}
        onOpenTicket={vi.fn()}
      />,
    );
    const region = screen.getByRole('region', { name: 'Shared with me' });

    // THE RENDERED ATTRIBUTE, not the source string and not a substring: the
    // whole text, spelled as the source spells it. `getByText` returns the span
    // the id renders in, so this is the node the user's pointer lands on.
    expect(within(region).getByText('prj_withheld')).toHaveAttribute(
      'title',
      'You have not been told this project’s name.',
    );

    // CONTROL 1 — the SAME lookup, one character different, must MISS. U+2019 is
    // what the source uses; U+0027 is what this repo's catalogue quotes. Without
    // this line the assertion above would pass just as happily on a test and a
    // source that had quietly agreed on the WRONG character, and would go on
    // passing — the check would be about "some apostrophe" rather than about
    // this string.
    expect(within(region).queryByTitle("You have not been told this project's name.")).toBeNull();

    // CONTROL 2 — it is the WITHHELD row's title and not a title every project
    // line carries. The named sibling renders in the same section, under the
    // same rule; a mutation that moved the title onto both branches would fail
    // here and nowhere else.
    expect(within(region).getAllByTitle('You have not been told this project’s name.')).toHaveLength(
      1,
    );
  });

  /* 13.308 — `Nothing assigned to you.` and `No contested claims.` under an
   * all-empty view, beside the same shape asserted in the 3.160 case above. */
  it('the assigned section has its own honest empty state', () => {
    render(
      <MyWork view={{ assigned: [], inTransit: [], contested: [], shared: [] }} onOpenTicket={vi.fn()} />,
    );
    expect(screen.getByText('Nothing assigned to you.')).toBeInTheDocument();
    expect(screen.getByText('No contested claims.')).toBeInTheDocument();
  });
});

/**
 * BINDING SEMANTIC, and the reach of the claim is stated where it was MEASURED
 * rather than assumed.
 *
 * `board.test.tsx` proves only the INSTANT path — board cards carry no
 * `dueDate`. But Task 10's `ticket-list.test.tsx` DOES already vary `TZ` over a
 * day claim in its due-date column (case 3.52), so this is the second surface
 * on that path and not the first: an earlier draft of this comment claimed the
 * day-claim path was untested and that was simply false. What this block adds
 * is a third zone, a control that the fixture straddles, and expectations
 * reached without the code under test.
 *
 * The defect is not academic. `formatDate` sends a day claim through
 * `istDayBounds`' opening instant precisely so no zone arithmetic can invent a
 * time of day for it. The defect this closes is one line: a bare
 * `new Date('2026-08-30').toLocaleDateString()`, which parses the claim as UTC
 * midnight and prints the TWENTY-NINTH anywhere west of Greenwich — a deadline
 * moved off the day somebody claimed it for, on the machine of whoever is
 * travelling.
 *
 * Same three ingredients as the strip's block, and for the same reasons: a
 * control that the knob moves, a control that the fixture straddles, and each
 * zone checked against an expectation computed WITHOUT the code under test.
 *
 * ## AND THE ZONES DISCRIMINATE NOTHING TODAY — which is why the mutation above
 * is named rather than the zone list
 *
 * `formatDate` reaches `istDayBounds` and `formatIstInstant`, both constant
 * +05:30 arithmetic over the UTC getters, with no local-zone reader on the path,
 * so all three zones render one string against the CURRENT implementation:
 * measured 2026-09-02, `formatDate('2026-08-30')` answered `30 Aug 2026` under
 * `Pacific/Kiritimati`, `Asia/Kolkata` and `Pacific/Niue` alike, while a
 * `new Date('2026-08-30').toLocaleDateString()` control in the same run answered
 * `29/8/2026` from Niue. The `TZ` control proves the KNOB moves; it does not
 * make these assertions discriminate. What they are is a REGRESSION GUARD, and
 * the one-line defect named above is what they kill — TWO cases here, `zone
 * Pacific/Kiritimati: expected 'needed by 30/8/2026, Kiro's claim' to be
 * 'needed by 30 Aug 2026, Kiro's claim'` and its day-anchored twin.
 */
describe('3.61 MyWork — the due DAY CLAIM does not move with the viewer’s laptop', () => {
  const ZONES = ['Pacific/Kiritimati', 'Asia/Kolkata', 'Pacific/Niue'] as const;
  const DUE_DAY = '2026-08-30';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /**
   * '2026-08-30' → '30 Aug 2026', by string surgery and a lookup table. No
   * `Date`, no zone, no `formatIstInstant` — a day claim IS its own day, and
   * the expectation has to be reached without the machinery being tested or it
   * agrees by construction.
   */
  function spellDay(isoDay: string): string {
    const [year, month, day] = isoDay.split('-');
    return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
  }

  function dueLineUnder(zone: string): string {
    const original = process.env['TZ'];
    process.env['TZ'] = zone;
    try {
      const view = render(<MyWork view={VIEW} onOpenTicket={vi.fn()} />);
      const text = view.container.querySelector('.gn-my-work__due')?.textContent ?? '';
      view.unmount();
      return text;
    } finally {
      // The delete-when-unset restore: `= undefined` assigns the string
      // "undefined", which ICU resolves to GMT, silently switching every later
      // file in this worker to UTC — and only when TZ was unset, which is the
      // default here and in CI.
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
  }

  it('CONTROL — setting process.env.TZ really does change what this process thinks local time is', () => {
    const original = process.env['TZ'];
    try {
      process.env['TZ'] = 'UTC';
      const utcHour = new Date(0).getHours();
      process.env['TZ'] = 'Asia/Kolkata';
      const istHour = new Date(0).getHours();
      expect(utcHour).toBe(0);
      expect(istHour).toBe(5);
    } finally {
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
  });

  it('CONTROL — a naive reading of this day claim really would land on a different day', () => {
    // Kiritimati is a fixed +14 and Niue a fixed −11. `new Date('2026-08-30')`
    // is UTC midnight, so the naive local page is the 30th in Kiritimati and
    // the TWENTY-NINTH in Niue. Computed by arithmetic, not by the TZ database
    // and not by anything under test — this is what makes the three-zone
    // comparison below a test rather than a coin flip.
    const naivePageAt = (offsetHours: number) =>
      new Date(Date.parse(`${DUE_DAY}T00:00:00Z`) + offsetHours * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
    expect(naivePageAt(14)).toBe('2026-08-30');
    expect(naivePageAt(-11)).toBe('2026-08-29');
    expect(naivePageAt(-11)).not.toBe(DUE_DAY);
  });

  it('PLANTED DEFECT: the due day renders as claimed from every zone, each checked alone', () => {
    const expected = `needed by ${spellDay(DUE_DAY)}, Kiro's claim`;
    for (const zone of ZONES) {
      expect(dueLineUnder(zone), `zone ${zone}`).toBe(expected);
    }
  });

  /**
   * ANCHORED ON WHAT THE DAY MUST BE, not on the two spellings it must not be —
   * the correction `ticket-list.test.tsx` had to make to its own version of this
   * assertion, inherited here rather than re-learned. Written purely as
   * `not.toContain('29 Aug')` this survives a bare `toLocaleDateString()`, which
   * renders the shifted day as `8/29/2026`: a string containing neither "29 Aug"
   * nor "31 Aug". The absence assertion was checking a spelling the defect does
   * not use. The `toMatch` catches every spelling of the wrong day; the two
   * absences are kept beside it because they name the failure a reader will
   * recognise.
   */
  it('PLANTED DEFECT: and no zone can slide the deadline off the day it claims', () => {
    for (const zone of ZONES) {
      expect(dueLineUnder(zone), `zone ${zone}`).toMatch(/^needed by 30 Aug 2026, /);
      expect(dueLineUnder(zone), `zone ${zone}`).not.toContain('29 Aug');
      expect(dueLineUnder(zone), `zone ${zone}`).not.toContain('31 Aug');
    }
  });

  it('PLANTED DEFECT: the zone swap hands the worker back exactly the TZ it borrowed', () => {
    const outer = process.env['TZ'];
    try {
      delete process.env['TZ'];
      dueLineUnder('Pacific/Niue');
      expect(Object.hasOwn(process.env, 'TZ')).toBe(false);
      expect(process.env['TZ']).toBeUndefined();

      process.env['TZ'] = 'Pacific/Kiritimati';
      dueLineUnder('Pacific/Niue');
      expect(process.env['TZ']).toBe('Pacific/Kiritimati');
    } finally {
      if (outer === undefined) delete process.env['TZ'];
      else process.env['TZ'] = outer;
    }
  });
});

/**
 * **⚠ CORRECTED 2026-09-20: this read *"`getMyWork` REFUSES today*, over
 * `contested`."*** `getMyWork` ANSWERS — rulings P39/P40 served it and the register
 * has been empty since 2026-09-19 — so the refusal below is CONSTRUCTED rather than
 * inherited. **The property is unchanged:** a read that does not answer must reach
 * the surface as an error, because a `MyWorkView` with three empty sections is
 * indistinguishable from a person who has nothing to do.
 */
describe('3.60 useMyWork — a refusal is an error, never three empty sections', () => {
  function Harness({ source }: { source: ReturnType<typeof createFakeDataSource> }) {
    const { data, error } = useMyWork(source, WS);
    return (
      <div>
        <span data-testid="error">{error ?? 'none'}</span>
        <span data-testid="view">{data === null ? 'loading' : `assigned:${data.assigned.length}`}</span>
      </div>
    );
  }

  it('PLANTED DEFECT: the serving gap surfaces and the view never renders "assigned:0"', async () => {
    // CONSTRUCTED, not read off the register — `getMyWork` does not refuse any
    // more (rulings P39/P40), and a `ServingGapError` built over an empty
    // lookup would still carry the message prefix asserted below while
    // measuring a refusal about nothing. Same move as `reopen-flow.test.tsx`'s
    // T13.4h-control. What is under test is the HOOK: a refusal surfaces as an
    // error and `data` never becomes `[]`.
    const source = createFakeDataSource({
      getMyWork: async () => {
        throw new ServingGapError('getMyWork', [
          {
            field: 'ContestedClaim.title',
            wireKey: 'title',
            wireRoute: '/v1/contests',
            because: 'a hand-built absence standing in for a refusal this method no longer makes',
            owner: 'this test',
          },
        ]);
      },
    });
    render(<Harness source={source} />);
    await act(async () => {});
    expect(screen.getByTestId('error')).toHaveTextContent('facts the shipped route does not serve');
    expect(screen.getByTestId('error')).toHaveTextContent('ContestedClaim.title');
    expect(screen.getByTestId('view')).toHaveTextContent('loading');
    expect(screen.getByTestId('view')).not.toHaveTextContent('assigned:0');
  });

  it('PLANTED DEFECT: the hook passes the workspace the caller named — the route 400s without one', async () => {
    // Ruling P25 clause 2: `GET /v1/me/work` reads `?workspaceId=` BEFORE the
    // door and answers 400 `invalid_query` without it, so a hook that dropped
    // the argument would build a request refused whole. The plan's snippet
    // calls `getMyWork()`.
    const asked: string[] = [];
    const source = createFakeDataSource({
      getMyWork: async (workspaceId) => {
        asked.push(workspaceId);
        return { assigned: [GST], inTransit: [], contested: [], shared: [] };
      },
    });
    render(<Harness source={source} />);
    await act(async () => {});
    expect(asked).toEqual([WS]);
    expect(screen.getByTestId('view')).toHaveTextContent('assigned:1');
    expect(source.subscriptions).toEqual([{ workspaceId: WS, afterSeq: 0 }]);
  });
});

/**
 * 6.256 (R3 N4) — MY WORK'S CONTESTED LINE NAMES THE CLAIMANT.
 *
 * `renderContestedClaimAttribution` printed `claim.actorId`. The host now passes
 * `actorLabelOf` (`useActorLabels`), and a call with no label reads `Unknown
 * person` rather than a ULID.
 */
describe('6.256 the contested claim line names the claimant through actorLabelOf', () => {
  it('with the prop: the resolved name; CONTROL: without it `Unknown person` and never the id', () => {
    const { unmount } = render(
      <MyWork
        view={VIEW}
        onOpenTicket={vi.fn()}
        actorLabelOf={(id) => (id === 'user_anselma' ? 'Anselma Marak' : `?${id}`)}
      />,
    );
    const contested = screen.getByRole('region', { name: 'My contested claims' });
    expect(within(contested).getByText(/claimed by Anselma Marak at /)).toBeInTheDocument();
    unmount();

    render(<MyWork view={VIEW} onOpenTicket={vi.fn()} />);
    const bare = screen.getByRole('region', { name: 'My contested claims' });
    expect(within(bare).getByText(/claimed by Unknown person at /)).toBeInTheDocument();
    expect(within(bare).queryByText(/user_anselma/)).not.toBeInTheDocument();
  });
});
