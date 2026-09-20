import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import { visibilitySetPayload } from '@gisik-nokma/domain';
import type { DataSource } from '../../src/data-source.js';
import {
  LOCKOUT_WARNING_COPY,
  OWNER_ALWAYS_SEES_COPY,
  VisibilityEditor,
  type VisibilityClaim,
} from '../../src/views/visibility-editor.js';
import type { Actor } from '../../src/view-types.js';

/**
 * These cases drive the component DIRECTLY rather than through `TicketSheet`,
 * and that is deliberate rather than convenient.
 *
 * **⚠ CORRECTED 2026-09-20.** This read *"The sheet returns its refusal branch
 * before the details body renders whenever `getTicket` rejects, and `getTicket`
 * REFUSES against the shipped server (`mapTicketRead`, one of the six serving
 * gaps). A sheet test that fabricated a successful ticket read in order to reach
 * this section would be exercising a line unreachable in production and reporting
 * the result as coverage — the UNREACHABLE vacuity."* **Ruling P25 clause 1
 * (`c86c4b5c`, 2026-09-06) served that read, and the register has been empty since
 * 2026-09-19, so the section IS reachable through the sheet and that argument has
 * expired.** Driving the component directly is still the narrower unit, and
 * whether the sheet should now prove this mount is a test-design decision this
 * comment correction does not take. The component is the unit; the mount is
 * asserted once, as a mount, in `ticket-sheet.test.tsx`.
 *
 * Cases 3.104–3.111 (`test-cases/03-foundation-ledger.md`).
 */
/**
 * REAL ULIDs, and the reason is a defect this file caught while being written.
 *
 * `visibilitySetPayload.userIds` is `z.array(ulidString)`, so a readable
 * fixture id like `'user_anselma'` is REFUSED by the shipped schema. The
 * schema-parse case below is what found it: with friendly ids, every explicit
 * payload this component builds would have been rejected at the door while the
 * suite reported the component correct. Names carry the readability instead —
 * which is also how the product renders these people.
 */
const KIRO = '01J0000000000000000000000K';
const ANSELMA = '01J0000000000000000000000A';
const DIPU = '01J0000000000000000000000D';

const MEMBERS: Actor[] = [
  { id: KIRO, name: 'Kiro' },
  { id: ANSELMA, name: 'Anselma Marak' },
  { id: DIPU, name: 'Dipu' },
];

const TICKET_ID = '01J0000000000000000000000T';

function recordingSource(result: IngestResult = committed()): {
  dataSource: DataSource;
  submitted: SubmittedEvent[];
} {
  const submitted: SubmittedEvent[] = [];
  const dataSource: DataSource = {
    ingest: async (events) => {
      submitted.push(...events);
      return [result];
    },
    query: new Proxy(
      {},
      {
        get: (_target, name) => () => {
          throw new Error(`VisibilityEditor must not read ${String(name)}`);
        },
      },
    ) as DataSource['query'],
    subscribe: () => () => undefined,
  };
  return { dataSource, submitted };
}

function committed(): IngestResult {
  return {
    status: 'committed',
    eventId: '01J0000000000000000000000E',
    seq: 1,
    serverTime: '2026-09-02T10:00:00.000Z',
  };
}

function mount(
  overrides: Partial<React.ComponentProps<typeof VisibilityEditor>> = {},
  source = recordingSource(),
) {
  render(
    <VisibilityEditor
      dataSource={source.dataSource}
      workspaceId="ws_1"
      ticketId={TICKET_ID}
      currentUserId={KIRO}
      members={MEMBERS}
      current={null}
      canEdit
      {...overrides}
    />,
  );
  return source;
}

describe('3.104 the owner’s read bypass is disclosed, on every mode', () => {
  it('renders the pinned sentence with no mode chosen at all', () => {
    mount();
    expect(screen.getByText(OWNER_ALWAYS_SEES_COPY)).toBeInTheDocument();
  });

  /**
   * PLANTED DEFECT: rendering it only under `explicit` would let a viewer
   * reasonably infer the other three modes exclude the owner — which is the
   * opposite of true, and the bypass is a power the ledger cannot attribute, so
   * disclosure is the only thing that makes it honest.
   */
  it('3.104 renders it under every one of the four modes, each checked alone', async () => {
    const user = userEvent.setup();
    mount();
    for (const label of [
      'Everyone in the workspace',
      'Everyone on the project',
      'Only the people I name',
      'Whatever the parent decided',
    ]) {
      await user.click(screen.getByRole('radio', { name: label }));
      expect(screen.getByText(OWNER_ALWAYS_SEES_COPY), label).toBeInTheDocument();
    }
  });

  it('3.104 renders it for a viewer who may NOT edit, who still needs to know who sees', () => {
    mount({ canEdit: false });
    expect(screen.getByText(OWNER_ALWAYS_SEES_COPY)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Only the people I name' })).toBeNull();
  });
});

describe('3.105 the lockout warning warns and changes nothing', () => {
  it('shows the pinned sentence when the authored list omits its own author', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('radio', { name: 'Only the people I name' }));
    await user.click(screen.getByRole('checkbox', { name: 'Anselma Marak' }));
    expect(screen.getByRole('alert')).toHaveTextContent(LOCKOUT_WARNING_COPY);
  });

  it('3.105 does not show it once the author names themselves', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('radio', { name: 'Only the people I name' }));
    await user.click(screen.getByRole('checkbox', { name: 'Anselma Marak' }));
    expect(screen.queryByText(LOCKOUT_WARNING_COPY)).not.toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Kiro' }));
    expect(screen.queryByText(LOCKOUT_WARNING_COPY)).toBeNull();
  });

  /**
   * 3.106 THE PLANTED DEFECT THIS FILE EXISTS FOR (Plan 6 Task 15b, item 3).
   *
   * The warning showing and the claim being untouched are asserted in ONE case,
   * on purpose. Split across two, a "helpful" `[...userIds, currentUserId]`
   * passes the first — the warning is computed before the fix and still shows —
   * while the second, written elsewhere, may never be run against the same
   * click sequence. Warning is not inventing (Plan 4 Open question 9): what is
   * submitted is exactly what was authored, and if that locks the author out,
   * the ledger records the claim they actually made.
   */
  it('3.106 submits the authored list VERBATIM while the warning is on screen', async () => {
    const user = userEvent.setup();
    const source = recordingSource();
    mount({}, source);
    await user.click(screen.getByRole('radio', { name: 'Only the people I name' }));
    await user.click(screen.getByRole('checkbox', { name: 'Anselma Marak' }));
    await user.click(screen.getByRole('checkbox', { name: 'Dipu' }));
    expect(screen.getByRole('alert')).toHaveTextContent(LOCKOUT_WARNING_COPY);

    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(source.submitted).toHaveLength(1);
    const event = source.submitted[0];
    expect(event?.payload).toEqual({
      ticketId: TICKET_ID,
      mode: 'explicit',
      userIds: [ANSELMA, DIPU],
    });
    // The author is absent, and that absence is the whole point.
    expect(JSON.stringify(event?.payload)).not.toContain(KIRO);
    // The actor IS the author — they made this claim, and the ledger says so.
    expect(event?.actorId).toBe(KIRO);
  });
});

describe('3.107 the payload is the domain’s, and the two refusals are never built', () => {
  it('files the claim against the ticket, restating it in the payload as parse-event requires', async () => {
    const user = userEvent.setup();
    const source = recordingSource();
    mount({}, source);
    await user.click(screen.getByRole('radio', { name: 'Everyone on the project' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    const event = source.submitted[0];
    expect(event?.entity).toEqual({ kind: 'ticket', id: TICKET_ID });
    expect(event?.type).toBe('visibility.set');
    // `parse-event.ts` refuses the two disagreeing, so this is not decoration.
    expect((event?.payload as { ticketId: string }).ticketId).toBe(event?.entity.id);
  });

  /**
   * 3.108 PLANTED DEFECT: `userIds` on any mode but `explicit` is a list
   * NOTHING will ever read — the ticket would be visible to a whole workspace
   * while the ledger carried a permanent, untrue record of a hand-picked
   * audience. The schema refuses it, and this proves the component never builds
   * one even after people were picked and the mode was changed back.
   */
  it('3.108 drops a picked list when the mode moves off explicit, rather than filing a lie', async () => {
    const user = userEvent.setup();
    const source = recordingSource();
    mount({}, source);
    await user.click(screen.getByRole('radio', { name: 'Only the people I name' }));
    await user.click(screen.getByRole('checkbox', { name: 'Kiro' }));
    await user.click(screen.getByRole('radio', { name: 'Everyone in the workspace' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(source.submitted[0]?.payload).toEqual({ ticketId: TICKET_ID, mode: 'workspace' });
  });

  it('3.108 every payload it can build PARSES against the shipped schema', async () => {
    const user = userEvent.setup();
    const source = recordingSource();
    mount({}, source);
    for (const label of [
      'Everyone in the workspace',
      'Everyone on the project',
      'Whatever the parent decided',
    ]) {
      await user.click(screen.getByRole('radio', { name: label }));
      await user.click(screen.getByRole('button', { name: 'Apply' }));
    }
    await user.click(screen.getByRole('radio', { name: 'Only the people I name' }));
    await user.click(screen.getByRole('checkbox', { name: 'Kiro' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(source.submitted).toHaveLength(4);
    for (const event of source.submitted) {
      // The REAL schema, not a re-typed shape of it: `.strict()` plus the two
      // superRefine refusals, which is what the door will run.
      expect(visibilitySetPayload.safeParse(event.payload).success, JSON.stringify(event.payload)).toBe(
        true,
      );
    }
  });

  /**
   * 3.109 PLANTED DEFECT: `explicit` naming nobody is an audience of nobody —
   * it reads as a restriction hiding the ticket from everyone including its
   * author, when what the sender almost certainly meant was a list they forgot
   * to attach. Apply is disabled so the refusal is never spent on a body this
   * component could see was malformed.
   */
  it('3.109 disables Apply while explicit names nobody, and enables it once somebody is named', async () => {
    const user = userEvent.setup();
    const source = recordingSource();
    mount({}, source);
    await user.click(screen.getByRole('radio', { name: 'Only the people I name' }));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(source.submitted).toEqual([]);
    await user.click(screen.getByRole('checkbox', { name: 'Dipu' }));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });
});

describe('3.110 a refusal reaches the screen in the authority’s own words', () => {
  it('renders the rule and the engine’s reason, unparaphrased', async () => {
    const user = userEvent.setup();
    const source = recordingSource({
      status: 'refused',
      eventId: '01J0000000000000000000000E',
      rule: 'permission.role',
      reason: 'Only a project admin, or whoever created this ticket, may change who sees it.',
    });
    mount({}, source);
    await user.click(screen.getByRole('radio', { name: 'Everyone in the workspace' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('permission.role');
    expect(alert).toHaveTextContent(
      'Only a project admin, or whoever created this ticket, may change who sees it.',
    );
  });

  it('3.110 renders an invalid’s code and message, which are different fields', async () => {
    const user = userEvent.setup();
    const source = recordingSource({
      status: 'invalid',
      eventId: null,
      code: 'invalid-payload',
      message: 'visibility.set with explicit mode requires a non-empty userIds list',
    });
    mount({}, source);
    await user.click(screen.getByRole('radio', { name: 'Whatever the parent decided' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('invalid-payload');
    expect(alert).toHaveTextContent('requires a non-empty userIds list');
  });
});

describe('3.111 the standing audience — served where it is served, absent where it is not', () => {
  /**
   * PLANTED DEFECT: drawing a MODE for a read that carried no row would be this
   * component asserting an audience nobody claimed, on the one surface whose
   * subject is who may see what. `inherit` is what a ticket is BORN with, so
   * the invented default is also the plausible one — which is exactly why it
   * must not be drawn.
   *
   * **⚠ 2026-09-20 — this case's REACH changed and its defect did not.** It used
   * to describe every production state, because nothing read the audience mode
   * off the wire. The mode is read now (`TicketRead.visibility`), so this arm is
   * reached only by a read that carried no row at all — the offline replica, or
   * a `null` override here. A defaulted mode is still a mode nobody claimed.
   */
  it('3.111 renders the absence, and NOT a mode, when no read carried the audience', () => {
    mount({ current: null });
    expect(screen.getByRole('status')).toHaveTextContent('not being served yet');
    // The control labels exist (they are the picker); what must not exist is a
    // STANDING sentence claiming one of them is in force.
    expect(document.querySelector('.gn-visibility__standing')).toBeNull();
  });

  it('3.111 renders a served claim with its actor and the server’s clock', () => {
    // The two modes DIFFER on purpose: the ticket claims `inherit` and the
    // audience in force is the explicit list. A render that reported the own
    // mode would say "Whatever the parent decided" here — see 3.170.
    const claim: VisibilityClaim = {
      ownMode: 'inherit',
      resolvedMode: 'explicit',
      userIds: [ANSELMA, DIPU],
      claim: {
        actorId: KIRO,
        actorName: 'Kiro',
        clientTime: '2026-08-19T09:58:12.000Z',
        serverTime: '2026-08-19T10:00:00.000Z',
      },
    };
    mount({ current: claim });
    const standing = document.querySelector('.gn-visibility__standing');
    expect(standing?.textContent).toContain('Only:');
    expect(standing?.textContent).toContain('Anselma Marak, Dipu');
    expect(standing?.textContent).toContain('set by Kiro');
    expect(screen.queryByText(/not being served yet/)).toBeNull();
  });

  it('3.111 names the people rather than counting them', () => {
    mount({
      current: {
        ownMode: 'explicit',
        resolvedMode: 'explicit',
        userIds: [ANSELMA],
        claim: {
          actorId: DIPU,
          actorName: null,
          clientTime: '2026-08-19T09:58:12.000Z',
          serverTime: '2026-08-19T10:00:00.000Z',
        },
      },
    });
    const standing = document.querySelector('.gn-visibility__standing');
    expect(standing?.textContent).toContain('Anselma Marak');
    expect(standing?.textContent).not.toContain('1 person');
    // A nameless actor renders by id, never blank and never "system".
    expect(standing?.textContent).toContain(DIPU);
  });

  /**
   * 3.170 — the standing line answers "who can see this" with the audience IN
   * FORCE, and `proj_visibility` is what resolved it.
   *
   * PLANTED DEFECT: reading `ownMode` here. "Whatever the parent decided" is a
   * true statement about the ticket's own claim and a useless answer to the
   * question the section asks — and on a ticket that HAS no parent it is not
   * even informative.
   */
  it('3.170 reports the audience in force, not the mode the ticket itself claims', () => {
    mount({ current: { ownMode: 'inherit', resolvedMode: 'project', userIds: null, claim: null } });
    const standing = document.querySelector('.gn-visibility__standing');
    expect(standing?.textContent).toContain('Everyone on the project');
    expect(standing?.textContent).not.toContain('Whatever the parent decided');
  });

  /**
   * 3.171 — the picker is seeded from the ticket's OWN claim.
   *
   * PLANTED DEFECT: seeding from the resolved audience. The picker is what a
   * `visibility.set` on THIS ticket would assert, so a ticket whose own mode is
   * `inherit` must not open with "Everyone on the project" checked — pressing
   * Apply would then FILE that claim, and the user would have made it by not
   * touching anything.
   */
  it('3.171 seeds the picker from the ticket’s own mode, never from the resolved audience', () => {
    mount({ current: { ownMode: 'inherit', resolvedMode: 'project', userIds: null, claim: null } });
    expect(screen.getByRole('radio', { name: 'Whatever the parent decided' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Everyone on the project' })).not.toBeChecked();
  });

  /**
   * 3.172 — an `explicit` audience whose ROSTER is not served.
   *
   * The roster is cut from the wire by a standing disclosure ruling
   * (`routes/tickets.ts:111-114`), so this is the production shape for every
   * explicit ticket. The mode is named and the names are not, and the section
   * has to SAY so: "Only: the people this ticket names" without the clause
   * beside it is a partial answer wearing the shape of a complete one — a
   * reader cannot tell a list withheld by policy from one nobody drew.
   */
  it('3.172 an explicit audience with no roster names the mode and says the list is not served', () => {
    mount({
      current: { ownMode: 'explicit', resolvedMode: 'explicit', userIds: null, claim: null },
    });
    const standing = document.querySelector('.gn-visibility__standing');
    expect(standing?.textContent).toContain('Only: the people this ticket names');
    expect(standing?.querySelector('.gn-visibility__roster-unserved')).not.toBeNull();
    // NOT a dangling `Only: `, and never a name: nothing here knows one.
    expect(standing?.textContent).not.toContain('Anselma Marak');
    expect(standing?.textContent?.trim()).not.toBe('Only:');
  });

  /**
   * 3.177 — an `explicit` audience whose roster is EMPTY, not `null`.
   *
   * The domain refuses this shape outright (`visibilitySetPayload`: an audience
   * of nobody *"reads as a restriction that hides the ticket from everyone
   * including its author"*) and the sheet passes `null`, never `[]` — so it is
   * not reachable from a shipped read. It is asserted anyway because **the prop
   * admits `string[]`**, and the defect it guards is the one two separate guards
   * produce the moment they disagree: the sentence suppressing `Only: ` under
   * one condition while the clause explaining the absence lives under another.
   * The result is a dangling `Only: ` with nothing after it and nothing saying
   * why — a partial answer that looks like a complete one, which is the exact
   * failure the clause was added to prevent.
   *
   * Found by the reviewer on 2026-09-20 as a latent coupling, not a live defect.
   */
  it('3.177 an explicit audience with an EMPTY roster is treated as unserved, not as a dangling Only:', () => {
    mount({ current: { ownMode: 'explicit', resolvedMode: 'explicit', userIds: [], claim: null } });
    const standing = document.querySelector('.gn-visibility__standing');
    expect(standing?.textContent).toContain('Only: the people this ticket names');
    expect(standing?.querySelector('.gn-visibility__roster-unserved')).not.toBeNull();
    expect(standing?.textContent?.trim()).not.toBe('Only:');
  });

  /**
   * 3.173 — a read that served no provenance renders no attribution.
   *
   * PLANTED DEFECT: rendering the clause anyway. `claim` is `null` for every
   * production read — who set the audience is on the LEDGER, not in the
   * projection the ticket read is built from — so the alternatives are a
   * non-null assertion that throws, or an actor invented to fill the gap.
   */
  it('3.173 renders no attribution clause when the read served no provenance', () => {
    mount({ current: { ownMode: 'project', resolvedMode: 'project', userIds: null, claim: null } });
    const standing = document.querySelector('.gn-visibility__standing');
    expect(standing?.textContent).toContain('Everyone on the project');
    expect(standing?.querySelector('.gn-visibility__standing-claim')).toBeNull();
    expect(standing?.textContent).not.toContain('set by');
  });
});

/**
 * §17 — the styling transcription's COMPONENT half. The CSS half is
 * `packages/ui/test/components.test.tsx` (17.001–17.005), and the two are split
 * because neither suite can see the other's subject: jsdom computes no cascade,
 * and a test in `packages/ui` cannot render a component from `app-core`.
 */
describe('the standing line carries the prototype’s dot (17.004, 17.006)', () => {
  /**
   * 17.004 — THE DOT IS TONED BY THE MODE, AND THE PRODUCTION SHAPE IS THE ONE
   * THAT PROVES IT.
   *
   * `userIds: null` is not an edge case here: the roster is CUT at the wire
   * (`apps/server/src/routes/tickets.ts:115-118` — *"an explicit audience
   * ROSTER, a disclosure no plan authorized"*), so a restricted ticket served
   * by the shipped server has `resolvedMode: 'explicit'` and NO names. A dot
   * keyed on the ROSTER — the natural mistake, since the two arrive together in
   * `VisibilityClaim` — renders the NOT-restricted tone on exactly that ticket,
   * and would pass every assertion written against a fixture that happened to
   * carry names. So the fixture is the production shape and the assertion is on
   * the modifier, not on the dot's presence.
   */
  it('17.004 tones the dot from the MODE, on the production shape where the roster is null', () => {
    mount({ current: { ownMode: 'explicit', resolvedMode: 'explicit', userIds: null, claim: null } });
    const mode = document.querySelector('.gn-visibility__standing-mode');
    expect(mode).not.toBeNull();
    expect(mode).toHaveClass('gn-visibility__standing-mode--restricted');
    // The audience genuinely IS restricted and the section still says so — the
    // dot's tone is not standing in for a list that was withheld.
    expect(mode?.textContent).toContain('Only:');
  });

  it('17.004 does NOT tone it restricted for a standing audience of everyone', () => {
    mount({ current: { ownMode: 'project', resolvedMode: 'project', userIds: null, claim: null } });
    const mode = document.querySelector('.gn-visibility__standing-mode');
    expect(mode).not.toBeNull();
    expect(mode).not.toHaveClass('gn-visibility__standing-mode--restricted');
    expect(mode?.textContent).toContain('Everyone on the project');
  });

  it('17.004 draws NO pill and NO dot when no read carried the audience at all', () => {
    // `current: null` is the offline replica's state. A dot here would be the
    // same invention the absence sentence exists to refuse: the section would be
    // reporting a tone for an audience nobody served.
    mount({ current: null });
    expect(document.querySelector('.gn-visibility__standing')).toBeNull();
    expect(document.querySelector('.gn-visibility__standing-mode')).toBeNull();
    expect(document.querySelector('.gn-visibility__dot')).toBeNull();
  });

  it('17.004 the dot is DECORATIVE — hidden from the accessible name, and adding no text', () => {
    const claim = { ownMode: 'explicit' as const, resolvedMode: 'explicit' as const, userIds: null, claim: null };
    mount({ current: claim });
    const dot = document.querySelector('.gn-visibility__dot');
    expect(dot).not.toBeNull();
    // 1.4.11 binds a graphical object "required to identify … or convey
    // information". This one is not: the pill's own label states the same fact
    // in words, which is what the `aria-hidden` is asserting.
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    // …and it contributes nothing to the text, asserted as an EXACT match
    // rather than a containment: a dot that introduced so much as a leading
    // space would leave `toContain` green and this red. The sentence is the
    // mode label, because `namedAudience` answers `null` for a roster that was
    // never served and `standingSentence` falls through to
    // `RESOLVED_MODE_LABELS.explicit` — the same state clause `3.111` covers.
    expect(document.querySelector('.gn-visibility__standing-mode')?.textContent).toBe(
      'Only: the people this ticket names',
    );
  });

  /**
   * 17.006 — THE ROSTER STAYS CUT, and the prototype's own row is where the
   * temptation comes from.
   *
   * `desktop.dc.html:1214-1229` draws a chip per viewer and an *"Add someone who
   * can see it…"* `<select>` over `viewerCandidates`. The owner's standing ruling
   * on `visibility` is **(a) BUILD, (b) KEEP THE RULING**, and (b) keeps the
   * explicit audience roster off the wire — so the product has no data behind
   * either control. **A picker over an empty set is the same defect as a form
   * that can only be refused**, which is why this is a negative assertion with a
   * positive control rather than an omission.
   */
  it('17.006 offers no audience picker and no chip, and the members picker is the control', () => {
    mount({
      current: { ownMode: 'explicit', resolvedMode: 'explicit', userIds: null, claim: null },
      // `explicit` opens the members fieldset, so the section is in its
      // most-populated state and "no select" cannot be satisfied by an
      // empty render.
      canEdit: true,
    });
    const section = document.querySelector('.gn-visibility');
    expect(section).not.toBeNull();
    expect(section?.querySelector('select')).toBeNull();
    expect(section?.querySelector('option')).toBeNull();
    expect(section?.querySelector('[class*="chip"]')).toBeNull();
    // POSITIVE CONTROL, same run, same element: the control that DOES exist for
    // choosing people is rendered, so this case cannot pass by the section
    // drawing nothing at all.
    expect(section?.querySelectorAll('.gn-visibility__person').length).toBe(MEMBERS.length);
    expect(section?.querySelectorAll('.gn-visibility__mode').length).toBeGreaterThan(0);
  });
});
