import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KINDS, istDayOf } from '@gisik-nokma/domain';
import { dueClaimLabel, formatClaimDate } from '../../src/claims/claim-labels.js';
import {
  notificationBody,
  notificationHeadline,
  notificationTicketId,
} from '../../src/inbox/format.js';
import { notificationOf, userName } from './fixtures.js';

/**
 * The inbox's copy — what a notification SAYS.
 *
 * Two different questions are asked about the date-approaching headline and
 * they are asked separately: whether it is literally the calendar's own
 * `dueClaimLabel` (imported and called), and whether that label still has the
 * shape §7 specifies (hand-typed). The first would survive a change to the
 * label's wording; the second would survive a re-implementation here that
 * happened to produce the same words today. Neither survives both.
 *
 * The stale-ticket day is the opposite case and MUST be hand-typed: the
 * planted defect is a UTC string slice standing in for `istDayOf`, and an
 * expectation composed by calling `istDayOf` would agree with the correct
 * implementation and with nothing else — it could not tell the slice apart
 * because it would never be compared to one. So the days below are literals,
 * and the instants either side of the IST midnight boundary are the whole test.
 */
describe('11.83 every kind is spoken for — a sixth would arrive mute', () => {
  it('the walk really covers the vocabulary, and the vocabulary is five kinds', () => {
    // The positive control for the loops below: a walk over an empty list
    // reports "every kind has a headline" in exactly the same green.
    expect(NOTIFICATION_KINDS).toEqual([
      'assignment',
      'mention',
      'contested-claim',
      'date-approaching',
      'stale-ticket',
    ]);
  });

  for (const kind of NOTIFICATION_KINDS) {
    it(`${kind}: headline, body and ticket id are all non-empty`, () => {
      const notification = notificationOf(kind);
      expect(notificationHeadline(notification, userName).length).toBeGreaterThan(0);
      expect(notificationBody(notification).length).toBeGreaterThan(0);
      expect(notificationTicketId(notification).length).toBeGreaterThan(0);
    });
  }

  it('the ticket id is read off the payload, one distinct id per kind', () => {
    const ids = NOTIFICATION_KINDS.map((kind) => notificationTicketId(notificationOf(kind)));
    expect(ids).toEqual([
      't-assignment',
      't-mention',
      't-contested',
      't-date',
      't-stale',
    ]);
  });
});

describe('11.84 the headline is the claim, attributed — never invented urgency', () => {
  it('date-approaching IS the calendar label, and that label is §7 exact', () => {
    const notification = notificationOf('date-approaching');
    const claim = {
      date: '2026-08-30',
      actorId: 'user_kiro',
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
    };
    // Pinned once, consumed twice: the same function the month grid prints.
    expect(notificationHeadline(notification, userName)).toBe(dueClaimLabel(claim, userName));
    // And the shape that function is specified to have.
    expect(notificationHeadline(notification, userName)).toBe("needed by 30 Aug, Kiro's claim");
  });

  it('assignment and mention name the actor through userName, not by id', () => {
    expect(notificationHeadline(notificationOf('assignment'), userName)).toBe(
      'Kiro assigned this to you',
    );
    expect(notificationHeadline(notificationOf('mention'), userName)).toBe('Kiro mentioned you');
    // The un-named actor falls back to the id rather than to a blank or an
    // invented name — `userName` is the shell's lookup and it can miss.
    const stranger = notificationOf('assignment', { payload: { assignedBy: 'user_unknown' } });
    expect(notificationHeadline(stranger, userName)).toBe('user_unknown assigned this to you');
  });

  it('a contested claim says so in words, and the RULE is named by the body not by its slug', () => {
    // E5-35 — the headline read `… — require-evidence`, printing the engine's
    // internal name where a person reads a sentence. The rule is still named on
    // the row: the BODY under this headline is the engine's own `reason`,
    // verbatim, which says what the rule wanted in the engine's words — the same
    // division `11.86`'s exact-equality case protects.
    const notification = notificationOf('contested-claim');
    expect(notificationHeadline(notification, userName)).toBe('Your claim was contested');
    expect(notificationHeadline(notification, userName)).not.toContain('require-evidence');
    expect(notificationBody(notification)).toBe(
      'This move must carry an attachment as evidence, and none was provided.',
    );
    // The slug itself is still ON the payload, so nothing downstream lost it —
    // this case is about what the ROW says, not about the wire.
    expect((notification.payload as { rule: string }).rule).toBe('require-evidence');
  });

  it('a stale ticket says since when and who moved it there', () => {
    expect(notificationHeadline(notificationOf('stale-ticket'), userName)).toBe(
      'In Doing since 1 Aug, moved there by Kiro',
    );
  });

  it('a state with no display name falls back to its id, and both arms are witnessed', () => {
    // Both directions of the `stateName ?? stateId` coalesce. The named arm is
    // above; without this pair a `payload.stateId`-only implementation passes
    // the nameless case and fails nothing.
    const nameless = notificationOf('stale-ticket', { payload: { stateName: null } });
    expect(notificationHeadline(nameless, userName)).toBe(
      'In doing since 1 Aug, moved there by Kiro',
    );
    const named = notificationOf('stale-ticket', {
      payload: { stateName: 'Awaiting evidence', stateId: 'doing' },
    });
    expect(notificationHeadline(named, userName)).toBe(
      'In Awaiting evidence since 1 Aug, moved there by Kiro',
    );
  });
});

describe('11.85 PLANTED DEFECT: "since" is the IST day of the instant, not a UTC slice', () => {
  it('an instant after 18:30Z belongs to the NEXT IST day', () => {
    // 2026-08-01T19:00:00.000Z is 00:30 IST on 2 Aug. A `.slice(0, 10)` says
    // "1 Aug" — the day the ticket's own history and the calendar both
    // disagree with.
    const crossing = notificationOf('stale-ticket', {
      payload: { enteredAt: '2026-08-01T19:00:00.000Z' },
    });
    expect(notificationHeadline(crossing, userName)).toBe(
      'In Doing since 2 Aug, moved there by Kiro',
    );
    // The control the assertion above needs: the last instant that is still
    // 1 Aug in IST stays 1 Aug, so the fix is a day BOUNDARY and not a
    // blanket +1 that would pass the line above on its own.
    const stillFirst = notificationOf('stale-ticket', {
      payload: { enteredAt: '2026-08-01T18:29:59.999Z' },
    });
    expect(notificationHeadline(stillFirst, userName)).toBe(
      'In Doing since 1 Aug, moved there by Kiro',
    );
    // And the two really are one millisecond either side of the same wall of
    // the domain's own boundary — stated here so the literals above are
    // anchored to `istDayOf` rather than to two numbers somebody typed.
    expect(istDayOf('2026-08-01T18:29:59.999Z')).toBe('2026-08-01');
    expect(istDayOf('2026-08-01T18:30:00.000Z')).toBe('2026-08-02');
    expect(formatClaimDate('2026-08-02')).toBe('2 Aug');
  });

  it('an unparseable instant is printed VERBATIM — one bad row cannot blank the inbox', () => {
    // `enteredAt` is typed `nonEmpty`, not as an instant, so this row parses and
    // is delivered. `istDayOf` refuses it; the headline degrades the way
    // `formatClaimDate` degrades on an unrenderable day rather than throwing
    // through the list that is rendering it.
    const broken = notificationOf('stale-ticket', { payload: { enteredAt: 'yesterday' } });
    expect(() => istDayOf('yesterday')).toThrow(RangeError);
    expect(notificationHeadline(broken, userName)).toBe(
      'In Doing since yesterday, moved there by Kiro',
    );
  });

  it('and verbatim really means VERBATIM — a garbage value that is date-SHAPED is not trimmed to look like a date', () => {
    // MEASURED SURVIVOR, now closed. `'yesterday'` is NINE characters, so the
    // degradation arm's one plausible wrong spelling — `enteredAt.slice(0, 10)`,
    // the ten-character slice this file's docblock forbids — returns the
    // identical string and the case above stays green. The whole point of the
    // arm is that garbage stays visible ON SCREEN rather than being "swallowed
    // into a plausible date", and a value long enough to be sliced is the only
    // input that can tell the two apart.
    //
    // `2026-13-45T99:99:99Z` is exactly that: month 13, day 45, hour 99, so
    // `istDayOf` refuses it (asserted below, not assumed), and a slice would
    // print `2026-13-45` — a string that reads as a date and is not one.
    const shaped = notificationOf('stale-ticket', {
      payload: { enteredAt: '2026-13-45T99:99:99Z' },
    });
    expect(() => istDayOf('2026-13-45T99:99:99Z')).toThrow(RangeError);
    expect(notificationHeadline(shaped, userName)).toBe(
      'In Doing since 2026-13-45T99:99:99Z, moved there by Kiro',
    );
    // Stated as its own assertion so the failure names the defect rather than
    // showing two long strings to diff: whatever the arm returns, it is not
    // the first ten characters.
    expect(notificationHeadline(shaped, userName)).not.toContain(
      'since 2026-13-45 —',
    );
  });
});

describe('11.86 the body is the sender’s own words, unparaphrased and unredacted', () => {
  it('each kind draws its body from its own field, and no two arms are swapped', () => {
    expect(notificationBody(notificationOf('assignment'))).toBe('Renew the DLT registration');
    // A mention's body is the EXCERPT, not the ticket title — the two are
    // different strings in the fixture precisely so a swap shows.
    expect(notificationBody(notificationOf('mention'))).toBe('please check the GST filing');
    expect(notificationBody(notificationOf('contested-claim'))).toBe(
      'This move must carry an attachment as evidence, and none was provided.',
    );
    expect(notificationBody(notificationOf('date-approaching'))).toBe(
      'Renew the DLT registration',
    );
    expect(notificationBody(notificationOf('stale-ticket'))).toBe('Renew the DLT registration');
  });

  it('the refusal reason travels character for character, prefix included', () => {
    const reason = 'Kiro must sign this off first, and has not.';
    const notification = notificationOf('contested-claim', { payload: { reason } });
    // Exact equality, not `toContain`: a body that WRAPPED the reason
    // ("Refused: …") would pass a containment check while adding this
    // surface's own voice to the engine's sentence.
    expect(notificationBody(notification)).toBe(reason);
  });

  it('a mention excerpt is rendered as captured — the delivered letter is not re-checked', () => {
    // The standing ruling: revocation removes future sight, not letters
    // delivered. There is no visibility argument to pass here and no field to
    // scrub, so what this measures is that the excerpt survives the trip
    // whole — including the quoted ticket content that is the whole reason a
    // scrub would be tempting.
    const excerpt = 'the GST filing is behind the locked ticket — see the attachment';
    expect(notificationBody(notificationOf('mention', { payload: { excerpt } }))).toBe(excerpt);
  });
});
