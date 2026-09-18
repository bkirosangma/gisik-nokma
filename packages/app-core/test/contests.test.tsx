import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { newSubmittedEvent } from '@gisik-nokma/domain';
import { CONTEST_RULES } from '@gisik-nokma/rule-engine';
import { resolveContest, type ContestLike } from '../src/contests/contest-view-model.js';
import { ContestBanner } from '../src/contests/contest-banner.js';
import { OfflineAcceptError } from '../src/replica/replica-data-source.js';

const TICKET = '01J9GTKA000000000000000000';

/**
 * A fixed clock, so the rendered IST string is a constant this file can assert.
 * `2026-08-20T18:30:00.000Z` is deliberately an instant whose UTC day and IST
 * day DIFFER — 18:30 UTC is 00:00 the next morning in Asia/Kolkata. An
 * implementation that printed the device's zone, or that dropped the +05:30
 * shift, gets the DAY wrong here, not merely the hour.
 */
const CLAIM_INSTANT = '2026-08-20T18:30:00.000Z';
const CLAIM_IN_IST = '21 Aug 2026, 00:00 IST';

function contest(): ContestLike {
  return {
    contestedEventId: '01J9GCON000000000000000000',
    ticketId: TICKET,
    claimantId: 'user_b',
    rule: 'restrict-to',
    reason: 'Only the assignee may do this.',
    originalEvent: newSubmittedEvent({
      workspaceId: 'ws_1',
      entity: { kind: 'ticket', id: TICKET },
      type: 'ticket.transitioned',
      // `to`, not `toStateId` — the ledger's spelling
      // (`ticketTransitionedPayloadSchema`). This is a fixture of a claim that
      // really was made, so it carries the shape a real claim carries.
      payload: { to: 'done' },
      actorId: 'user_b',
      origin: 'mobile',
      now: () => new Date(CLAIM_INSTANT),
    }),
    contestedAt: '2026-08-20T10:00:00.000Z',
    resolved: false,
    resolution: null,
  };
}

/**
 * The save/restore shape this package settled on (`test/views/board.test.tsx`).
 * The naive `process.env.TZ = original` restore assigns the STRING "undefined"
 * when TZ was unset — which ICU resolves to GMT — silently switching every
 * later file in the same worker. It corrupts only when TZ was unset, which is
 * the default here and in CI: present in exactly the runs nobody inspects.
 */
function underTz(zone: string, body: () => void): void {
  const original = process.env['TZ'];
  process.env['TZ'] = zone;
  try {
    body();
  } finally {
    if (original === undefined) delete process.env['TZ'];
    else process.env['TZ'] = original;
  }
}

describe('ContestBanner', () => {
  /**
   * 12.25 — the 'what/who/when/rule' half is proven by this test (12.193), which asserts the banner text contains the actor, the claimed action, the rule and reason, and the claim time rendered as IST rather than the raw instant; the 'renders nothing when there is nothing contested' half is a separate assertion in the '12.201' test two blocks down (line 129, `expect(container.innerHTML).toBe('')`).
   */
  /* 13.305 — the three real contested-claim resolutions render by their shipped
   * labels (the assertions at the foot of this case). It witnesses the
   * COMPONENT: `ContestBanner` is mounted nowhere in the product, and the
   * TicketSheet imports no contest component at all — recorded in
   * `test-cases/13-deployment-dogfooding.md` under 13.305, kept separate from
   * this verdict because the verdict's own stated mutation does pass. */
  it('12.193 — names what was claimed, by whom, when, and which rule now refuses it', () => {
    render(<ContestBanner contests={[contest()]} onResolve={() => undefined} onRedo={() => undefined} />);
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('user_b');
    expect(banner.textContent).toContain('ticket.transitioned');
    expect(banner.textContent).toContain('restrict-to');
    expect(banner.textContent).toContain('Only the assignee may do this.');
    // The "when" is India time, named as such — not a raw ISO instant, and not
    // the viewer's device clock (owner decision 2026-08-20).
    expect(banner.textContent).toContain(CLAIM_IN_IST);
    expect(banner.textContent).not.toContain(CLAIM_INSTANT);
    expect(screen.getByRole('button', { name: /redo/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /convert to comment/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /discard/i })).toBeTruthy();
  });

  /**
   * 12.194 — THE BANNER'S DATE IS IST BECAUSE THE CODE SAYS SO, NOT BECAUSE
   * THE MACHINE IS ALREADY IN IST.
   *
   * Both clocks in this project are Asia/Kolkata by owner decision and every
   * machine matches, so an IST assertion run only on this box cannot tell the
   * two apart. Measured before writing this: `packages/domain/test/` assigns
   * `process.env.TZ` on ZERO lines while `formatIstInstant` appears in two of
   * its files — so nothing anywhere had varied the zone under this formatter.
   *
   * It IS falsifiable, and against the likely defect rather than an imaginary
   * one: `formatIstInstant` is a constant +05:30 shift read through
   * `getUTCHours`, and the natural "simplification" — `toLocaleString` with a
   * zone, or `getHours()` — moves with the ambient zone and fails this case in
   * both directions. The probe below proves the zone actually took effect, so
   * a green result cannot come from `TZ` having been ignored by the worker.
   */
  it('12.194 — renders the IST day under a non-IST TZ, and the TZ actually took effect', () => {
    // Probe FIRST: if assigning TZ does not move the ambient clock in this
    // worker, the assertion below would pass for the wrong reason.
    const utcHour = underTzValue('UTC', () => new Date(CLAIM_INSTANT).getHours());
    const laHour = underTzValue('America/Los_Angeles', () => new Date(CLAIM_INSTANT).getHours());
    expect(utcHour, 'process.env.TZ did not reach this worker; 12.194 proves nothing').not.toBe(laHour);

    for (const zone of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      underTz(zone, () => {
        const { unmount } = render(
          <ContestBanner contests={[contest()]} onResolve={() => undefined} onRedo={() => undefined} />,
        );
        expect(screen.getByRole('alert').textContent, `under TZ=${zone}`).toContain(CLAIM_IN_IST);
        unmount();
      });
    }
  });

  it('12.201 — renders nothing when there is nothing contested — no empty chrome', () => {
    const { container } = render(
      <ContestBanner contests={[]} onResolve={() => undefined} onRedo={() => undefined} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('12.202 — renders nothing when every contest is already resolved', () => {
    const { container } = render(
      <ContestBanner
        contests={[{ ...contest(), resolved: true, resolution: 'discarded' }]}
        onResolve={() => undefined}
        onRedo={() => undefined}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('12.203 — planted defect: Redo goes to onRedo, NEVER to onResolve with the contested envelope as the replacement', () => {
    const onResolve = vi.fn();
    const onRedo = vi.fn();
    const c = contest();
    render(<ContestBanner contests={[c]} onResolve={onResolve} onRedo={onRedo} />);
    fireEvent.click(screen.getByRole('button', { name: /redo/i }));
    expect(onRedo).toHaveBeenCalledWith(c);
    expect(onResolve).not.toHaveBeenCalled(); // handing back c.originalEvent would throw in resolveContest
  });

  /* 13.306 — the shipped resolutions are EXACTLY three, each wired to its own
   * resolution KIND, and the prototype's invented pair is ABSENT.
   *
   * The absence is the deliverable. The other two halves are what stop it being
   * vacuous, and neither is decoration:
   *
   *  - EXACT NAMES, because the arm already in this file (12.193, whose
   *    assertions the catalogue cites as `13.305`'s witness) finds its third
   *    control with `/discard/i` — which the prototype's own third label
   *    **`Discard mine`** also satisfies. A rename to the prototype's wording
   *    reddened nothing before this case.
   *  - THE KINDS, because labels alone are satisfied by a banner whose
   *    "Discard" button submits `converted-to-comment`: every label assertion
   *    stays green while the product loses its discard path. Found by review as
   *    a surviving mutation, and closed here.
   *
   * THE FLAG, recorded rather than smoothed over. `ContestBanner` is mounted
   * NOWHERE in the product (`docs/hig-reconciliation-audit.md:577`), so this is
   * a **COMPONENT-level** guard: it says nothing about any screen. Two surfaces
   * are easy to conflate and the difference is the point — the WEB ticket sheet
   * renders no contest UI at all (TicketSheet imports no contest component),
   * while the MOBILE ticket screen renders its OWN three buttons from its own
   * markup (`apps/mobile/src/screens/ticket-screen.tsx:119-121`). Neither is
   * this component, and this case witnesses neither of them.
   *
   * Why the guard earns its place anyway: the audit files the pair as *"I —
   * SHOWN BUT DOES NOT EXIST. Do not build."* (`docs/hig-reconciliation-audit.md:306`)
   * and its pair-specific bullet is at `:308`; the prototype still draws all
   * three labels (`design-system/interactive/mobile.dc.html:353-355`), so a
   * future port has a live source to copy from. Absence is currently a property
   * of what nobody has written yet, which is exactly the state a guard exists to
   * change.
   */
  it('13.306 — the shipped resolutions are exactly three, and the invented pair is absent', () => {
    const onResolve = vi.fn();
    const view = render(
      <ContestBanner contests={[contest()]} onResolve={onResolve} onRedo={() => undefined} />,
    );
    const banner = screen.getByRole('alert');

    // POSITIVE ARM — the anti-vacuity control. An "absent controls" assertion on
    // a banner that rendered NOTHING would pass; these three make that
    // impossible. Exact names, not regexes: `/discard/i` in 12.193 would accept
    // the prototype's `Discard mine`.
    expect(within(banner).getByRole('button', { name: 'Redo legally' })).toBeTruthy();
    expect(within(banner).getByRole('button', { name: 'Convert to comment' })).toBeTruthy();
    expect(within(banner).getByRole('button', { name: 'Discard' })).toBeTruthy();

    // EACH LABEL CARRIES ITS OWN KIND, in order. Without this, a banner that
    // submitted `converted-to-comment` from the DISCARD button passes every
    // other assertion here while the product silently loses its discard path —
    // and a whole-file mutation proved exactly that before this arm existed.
    fireEvent.click(within(banner).getByRole('button', { name: 'Convert to comment' }));
    expect(onResolve).toHaveBeenNthCalledWith(1, expect.anything(), {
      resolution: 'converted-to-comment',
    });
    fireEvent.click(within(banner).getByRole('button', { name: 'Discard' }));
    expect(onResolve).toHaveBeenNthCalledWith(2, expect.anything(), { resolution: 'discarded' });

    // NEGATIVE ARM — the deliverable. The prototype's pair, by the names it
    // actually draws, as controls and in the rendered text.
    expect(within(banner).queryByRole('button', { name: /keep mine/i })).toBeNull();
    expect(within(banner).queryByRole('button', { name: /keep theirs/i })).toBeNull();
    expect(banner.textContent).not.toContain('Keep mine');
    expect(banner.textContent).not.toContain('Keep theirs');

    // AND THE SET IS CLOSED — counted WITHIN the banner, not across
    // `document.body`: the unit matters, because a document-wide count makes this
    // assertion's correctness depend on a cleanup line in another file. Without
    // this arm a control ADDED beside the three leaves every assertion above
    // green, since they only ever name what they expect.
    expect(within(banner).getAllByRole('button')).toHaveLength(3);

    // AND IT IS THREE PER OPEN CONTEST, not three in total. With a single
    // contest those two readings are indistinguishable, and a `.slice(0, 1)` on
    // the open list passes every assertion above — measured as a surviving
    // mutation before this arm existed. Unmount first, so the two renders cannot
    // be mistaken for one another.
    view.unmount();
    render(
      <ContestBanner
        contests={[contest(), { ...contest(), contestedEventId: '01J9GCON000000000000000001' }]}
        onResolve={vi.fn()}
        onRedo={() => undefined}
      />,
    );
    const both = screen.getByRole('alert');
    expect(within(both).getAllByRole('button')).toHaveLength(6);
    expect(within(both).getAllByRole('button', { name: 'Discard' })).toHaveLength(2);
  });
});

/** Same shape as `underTz`, for a body that returns a value. */
function underTzValue<T>(zone: string, body: () => T): T {
  const original = process.env['TZ'];
  process.env['TZ'] = zone;
  try {
    return body();
  } finally {
    if (original === undefined) delete process.env['TZ'];
    else process.env['TZ'] = original;
  }
}

describe('resolveContest', () => {
  /**
   * 12.26 — re-filed across three successors: 12.204 (discard emits exactly one claim.contested_resolved event attributed to the discarding actor); 12.206 (convert-to-comment emits comment.added carrying the claim text, then the linked resolution); 12.207 (redo sends the replacement event first, then a resolution linking to its id).
   */
  it('12.204 — discard emits ONE recorded resolution event carrying who discarded', async () => {
    const ingest = vi.fn(async (events: unknown[]) => events.map(() => ({ status: 'pending', eventId: 'x' })));
    const c = contest();
    const result = await resolveContest(
      ingest,
      c,
      { resolution: 'discarded', note: 'stale' },
      { userId: 'user_c', origin: 'desktop' },
    );
    expect(result.ok).toBe(true);
    expect(ingest).toHaveBeenCalledTimes(1);
    const [events] = ingest.mock.calls[0]!;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'claim.contested_resolved',
      actorId: 'user_c', // the discard is itself a recorded event, attributed
      entity: { kind: 'ticket', id: TICKET },
      payload: { contestedEventId: c.contestedEventId, resolution: 'discarded', note: 'stale' },
    });
  });

  it('12.205 — a discard with no note carries no `note` key at all', async () => {
    const ingest = vi.fn(async (events: unknown[]) => events.map(() => ({ status: 'pending', eventId: 'x' })));
    await resolveContest(ingest, contest(), { resolution: 'discarded' }, { userId: 'user_c', origin: 'desktop' });
    const [events] = ingest.mock.calls[0]!;
    const payload = (events[0] as { payload: Record<string, unknown> }).payload;
    expect(Object.keys(payload).sort()).toEqual(['contestedEventId', 'resolution']);
  });

  it('12.206 — convert-to-comment emits comment.added with the claim text, then the linked resolution', async () => {
    const ingest = vi.fn(async (events: unknown[]) => events.map(() => ({ status: 'pending', eventId: 'x' })));
    const c = contest();
    await resolveContest(ingest, c, { resolution: 'converted-to-comment' }, { userId: 'user_c', origin: 'desktop' });
    const [events] = ingest.mock.calls[0]!;
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: 'comment.added' });
    const bodyText = JSON.stringify((events[0] as { payload: { body: unknown } }).payload.body);
    expect(bodyText).toContain('user_b'); // the original claimant survives in the comment
    expect(bodyText).toContain('restrict-to');
    expect(bodyText).toContain(CLAIM_IN_IST); // and the comment carries the IST instant, not a raw one
    expect(events[1]).toMatchObject({
      type: 'claim.contested_resolved',
      payload: { resolution: 'converted-to-comment', commentEventId: (events[0] as { id: string }).id },
    });
  });

  it('12.207 — redo sends the replacement first and links it from the resolution', async () => {
    const ingest = vi.fn(async (events: unknown[]) => events.map(() => ({ status: 'pending', eventId: 'x' })));
    const c = contest();
    const replacement = newSubmittedEvent({
      workspaceId: 'ws_1',
      entity: { kind: 'ticket', id: TICKET },
      type: 'ticket.transitioned',
      payload: { to: 'done', comment: { text: 'done legally this time' } },
      actorId: 'user_b',
      origin: 'desktop',
    });
    await resolveContest(
      ingest,
      c,
      { resolution: 'redone', replacementEvent: replacement },
      { userId: 'user_b', origin: 'desktop' },
    );
    const [events] = ingest.mock.calls[0]!;
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(replacement);
    expect(events[1]).toMatchObject({ payload: { resolution: 'redone', replacementEventId: replacement.id } });
  });

  it('12.208 — a refused resolution surfaces the refusal instead of pretending', async () => {
    const ingest = vi.fn(async (events: unknown[]) =>
      // `CONTEST_RULES.alreadyResolved`, imported rather than retyped: this is the
      // vocabulary `packages/rule-engine/src/contests.ts` refuses under, and a
      // rename there now moves this fixture with it. What the import does NOT
      // establish is that the server really answers this rule over the wire — an
      // assertion against a producer's own constant is a self-comparison through
      // one module. That half is stated as case 7.244: a contest can only be
      // OPENED with envelope-origin 'server', which the HTTP door refuses from
      // every client by design, so no `POST /v1/events` round trip can reach it.
      // The server-side producer is pinned at `apps/server/test/engine-context.test.ts`.
      events.map(() => ({ status: 'refused', eventId: 'x', rule: CONTEST_RULES.alreadyResolved, reason: 'planted' })),
    );
    const result = await resolveContest(ingest, contest(), { resolution: 'discarded' }, { userId: 'user_c', origin: 'desktop' });
    expect(result).toEqual({ ok: false, refused: { rule: CONTEST_RULES.alreadyResolved, reason: 'planted' } });
  });

  it('12.209 — an INVALID answer surfaces the door’s code and message, not a rule it never named', async () => {
    const ingest = vi.fn(async (events: unknown[]) =>
      events.map(() => ({ status: 'invalid', eventId: null, code: 'unknown_event_type', message: 'planted' })),
    );
    const result = await resolveContest(ingest, contest(), { resolution: 'discarded' }, { userId: 'user_c', origin: 'desktop' });
    expect(result).toEqual({ ok: false, refused: { rule: 'unknown_event_type', reason: 'planted' } });
  });

  it('12.210 — planted defect: redoing with the contested id itself throws — a redo is a fresh claim', async () => {
    const ingest = vi.fn(async () => []);
    const c = contest();
    await expect(
      resolveContest(ingest, c, { resolution: 'redone', replacementEvent: c.originalEvent }, { userId: 'user_b', origin: 'desktop' }),
    ).rejects.toThrow(/fresh envelope/);
    expect(ingest).not.toHaveBeenCalled();
  });

  /**
   * 12.195 — A QUEUED RESOLUTION IS NOT AN ACCEPTED ONE.
   *
   * The replica's `ingest` THROWS `OfflineAcceptError` for a queued claim
   * rather than returning a fourth status — its own docblock's reason is that
   * every arm of `IngestResult` is false of a claim in transit. This pins that
   * `resolveContest` does not catch it and answer `ok: true`, which would put
   * "the server accepted your discard" on screen for a discard the server has
   * never seen. The caller renders "queued" from the error's `queuedEventIds`.
   */
  it('12.195 — an offline-queued resolution propagates OfflineAcceptError; it is never laundered into ok:true', async () => {
    const ingest = vi.fn(async () => {
      throw new OfflineAcceptError([{ status: 'pending', eventId: 'evt_queued' }]);
    });
    await expect(
      resolveContest(ingest, contest(), { resolution: 'discarded' }, { userId: 'user_c', origin: 'desktop' }),
    ).rejects.toBeInstanceOf(OfflineAcceptError);
  });
});
