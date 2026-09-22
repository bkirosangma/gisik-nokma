import { useEffect, useRef, useState } from 'react';
import { VISIBILITY_MODES, type VisibilityMode, type IngestResult } from '@gisik-nokma/domain';
import { Button, Popover } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import { actorLabel, formatDateTime } from '../provenance.js';
import { memberLabel } from '../member-label.js';
import { makeSubmittedFactory } from '../submit.js';
import type { ClaimProvenance, ResolvedVisibilityMode, RosterMember, TicketVisibility } from '../view-types.js';

/**
 * The two sentences on this screen that are OWNER DECISIONS, not wording.
 *
 * Both are pinned by Plan 6 Task 15b item 3 and are reproduced here character
 * for character. They are exported so a consumer's test asserts the same string
 * this renders rather than a re-typed copy — two spellings of one sentence is
 * how a copy change passes the test it broke.
 *
 * `OWNER_ALWAYS_SEES_COPY` discloses the workspace owner's read bypass (owner
 * decision, 2026-08-27). The bypass is a power the ledger cannot attribute —
 * nothing is appended when an owner reads — so the only thing that can make it
 * honest is saying it out loud, beside the control that would otherwise imply
 * the list is the whole audience. It is rendered ALWAYS, on every mode,
 * including the modes that name no people: a viewer who saw it only on
 * `explicit` would reasonably infer the other three modes exclude the owner.
 *
 * `LOCKOUT_WARNING_COPY` fires when an explicit list being authored omits its
 * own author. It is a WARNING and not a correction: the claim submitted is
 * still exactly the authored list (Plan 4 Open question 9 — warning is not
 * inventing). Silently adding the author would file a claim they did not make,
 * against the one invariant this product is built on.
 */
export const OWNER_ALWAYS_SEES_COPY = 'Visible to: these people — and the workspace owner, always.';

export const LOCKOUT_WARNING_COPY =
  'You are about to lose access to this ticket. A project admin — or the workspace owner, who always sees — can restore it.';

/**
 * What the read-only arm says when this viewer may not edit — i.e. the answer to
 * *"then who can?"*, which is the question a person who has just been told "no"
 * is asking.
 *
 * **⚠ IT WAS WRONG AND IT CONTRADICTED ITS OWN SIBLING (F4, 2026-09-21).** It read
 * *"Only a project admin, or whoever created this ticket, can change who sees
 * it."* The server's rule
 * (`apps/server/src/permissions/check-permission.ts:1058-1060`) is
 * `hasProjectAdminRights(ctx.eff, projectId) || ctx.sessionUserId === creatorId`,
 * and `hasProjectAdminRights` (`apps/server/src/permissions/effective-role.ts`) is
 * `workspaceRole === 'owner' || workspaceRole === 'admin' || projectAdmin`. **A
 * workspace OWNER or ADMIN may change any ticket's visibility**, and the sentence
 * named neither — while `LOCKOUT_WARNING_COPY` two declarations up says *"or the
 * workspace owner, who always sees"*. Two sentences in ONE component disagreeing
 * about who may act, and the omission is invisible to the people best placed to
 * notice it: an owner never reads a sentence about what an owner may do.
 *
 * Hoisted to a constant for the reason the other two are: the spec asserts the
 * string that RENDERS, not a re-typed copy of it.
 */
export const READ_ONLY_COPY =
  'Only a project admin, a workspace owner or admin, or whoever created this ticket, can change who sees it.';

/**
 * The TRANSPORT sentence, for a write that never reached a server (V3,
 * 2026-09-21) — the shape `BulkCloseDialog`'s `transportError` slot already uses
 * two files away, including carrying the cause's own words without paraphrase.
 *
 * It exists because `apply` had NO try/catch and its call site is
 * `onClick={() => void apply()}`, so a rejected `ingest` was discarded entirely:
 * `submission` stayed `{kind:'sending'}`, which is the state the Apply button is
 * `disabled` on, and the component's only sentence lived under
 * `submission.kind === 'refused'` — unreachable from there. A person saw a
 * control go dead with nothing said, for ever.
 *
 * It says WHO CAN SEE THIS IS UNCHANGED because that is the reader's next
 * question, and the honest answer is that nothing was recorded.
 */
export function writeUnreachedCopy(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return `We could not reach the server for this change — ${message}. Who can see this ticket is unchanged.`;
}

/**
 * How the ticket's audience stands now, as somebody's claim rather than a
 * property.
 *
 * ## This is `TicketVisibility` WIDENED, and the two extra members are nullable
 *
 * `TicketVisibility` (`../view-types.js`) is what the shipped ticket read
 * serves: the two mode columns of `proj_visibility`, and nothing else. This type
 * adds the two things a FULLER read would carry and no shipped read does — the
 * roster an `explicit` audience names, and the provenance of whoever set the
 * mode.
 *
 * Both are `| null` rather than optional, and `null` is a CLAIM here rather than
 * a shrug: it says *"no read served this"*, which is the honest answer for the
 * roster (**cut from the wire entirely** — `routes/tickets.ts`, *"an explicit
 * audience ROSTER, a disclosure no plan authorized"*) and for the
 * provenance (which lives on the LEDGER, not in the projection the ticket read
 * is built from). An optional key would let a mapper that simply forgot the
 * field look the same as the cut applying — the rule `WorkItem.projectName`
 * states for the same reason.
 *
 * ## `ownMode` seeds the controls; `resolvedMode` is what the section REPORTS
 *
 * They are different questions and swapping them is a defect with a visible
 * consequence: seeding the mode picker from `resolvedMode` shows "Everyone on
 * the project" for a ticket whose own claim is `inherit`, and pressing Apply
 * then FILES a claim nobody made. See `TicketVisibility`'s own docblock.
 */
export type VisibilityClaim = TicketVisibility & {
  /**
   * The people an `explicit` audience names, or `null` when no read served a
   * roster.
   *
   * **Empty for every mode but `explicit`** — the domain refuses `userIds` on
   * any other mode outright (`visibilitySetPayload`), because a list nothing
   * reads would be a permanent, untrue record of a hand-picked audience.
   */
  userIds: string[] | null;
  /**
   * Who set the standing claim, and when — or `null` when no read served it.
   *
   * `ClaimProvenance` requires BOTH clocks, so there is no partial form of this
   * to render: either the read named an actor and two instants, or the section
   * says nothing about who set it. It never names an actor it does not have.
   */
  claim: ClaimProvenance | null;
};

export type VisibilityEditorProps = {
  dataSource: DataSource;
  workspaceId: string;
  ticketId: string;
  currentUserId: string;
  /**
   * The workspace roster, for the people picker and for naming the actor behind
   * the standing claim. `getMembers` ANSWERS (as, since 2026-09-19, does every
   * method in `SERVING_GAPS`' own register — it is empty), so this arrives filled
   * in practice.
   *
   * `RosterMember[]` rather than `Actor[]` since E4-6: the picker labels through
   * `memberLabel`, whose second fallback is the EMAIL, and `Actor` carries none.
   * The two provenance sites still go through `actorLabel`, which needs only
   * `id` and `name` — and which is what puts the system-actor step in front of
   * the same fallback chain, so the two are one rule applied twice rather than
   * two rules kept apart.
   */
  members: RosterMember[];
  /**
   * The standing audience, or `null` when no read carried one.
   *
   * **⚠ CORRECTED 2026-09-20.** This prop's docblock read: *"`null` is what the
   * shipped server produces today ... `TicketRead` carries no visibility field
   * and `GET /v1/workspaces/:ws/tickets/:id` serves no provenance block at all,
   * so there is no read behind this."* **The framing was wrong and the
   * conclusion was right.** The endpoint has always served the `proj_visibility`
   * row — under the key `ticket`, beside `ticketState` — and this client's
   * `mapTicketRead` simply never looked at it; the MODE now reaches here as
   * `TicketRead.visibility`. What no read serves is the ROSTER and the
   * PROVENANCE, which is why the two nullable members of `VisibilityClaim` are
   * still `null` in production, and why `null` for the whole prop remains the
   * honest answer for a read that carried no row at all (the offline replica,
   * `replica-data-source.ts`: `visibility.set` is not a type its reducer folds).
   *
   * The component renders the ABSENCE — a sentence saying the current audience
   * is not being served — rather than drawing "Inherited" and inventing the
   * very default the ledger may not hold.
   */
  current: VisibilityClaim | null;
  /**
   * Whether this viewer may CHANGE the audience — the server's rule, which is
   * **a project admin, a workspace OWNER or ADMIN, or the ticket's creator**
   * (`apps/server/src/permissions/check-permission.ts:1058-1060` ORs
   * `hasProjectAdminRights` with `sessionUserId === creatorId`, and
   * `effective-role.ts` defines the first as owner ‖ admin ‖ projectAdmin).
   *
   * ⚠ **THIS SENTENCE SAID "project admins and the ticket's creator" UNTIL
   * 2026-09-21 (F4), and it was the same omission as the read-only sentence's:**
   * it left out the workspace owner and admin, who may change any ticket's
   * visibility. A caller reading this docblock to decide what to pass would have
   * written the same under-permissive gate the sentence described.
   *
   * Decided by the caller and passed in, not resolved here, because the facts it
   * needs (effective role, and who created this ticket) are the caller's reads
   * and not this component's. It gates only the CONTROLS: the standing claim and
   * the owner-disclosure line render either way, because somebody who cannot
   * change the audience still needs to know what it is and who else can see.
   */
  canEdit: boolean;
  /** Told after a committed change, so the sheet can refetch what it holds. */
  onChanged?: () => void;
};

type Submission = { kind: 'idle' } | { kind: 'sending' } | { kind: 'refused'; rule: string; reason: string };

/**
 * "Who can see this" — the ticket sheet's audience section (spec §6).
 *
 * ## The READ side: the MODE is served now, and the ROSTER and PROVENANCE are not
 *
 * **⚠ CORRECTED 2026-09-20 — the framing below this paragraph was wrong and its
 * conclusion was right.** It read: *"The READ side of this surface is UNSERVED
 * ... `TicketRead` has five fields and none of them is visibility ... `GET
 * /v1/workspaces/:ws/tickets/:ticketId` answers a `proj_visibility` row wrapped
 * in `{ticket, parent, rollup}` ... so nothing anywhere can hand this component
 * a `VisibilityClaim`."*
 *
 * **The endpoint has served the mode since it existed.** `toTicketView`
 * (`apps/server/src/routes/tickets.ts:132-142`) answers
 * `{ticket_id, workspace_id, project_id, parent_id, own_mode, resolved_mode,
 * seq}`, and `mapTicketRead` never opened the key — so the section drew an
 * absence for a fact that was on the wire the whole time. **That is now read**
 * (`TicketRead.visibility`), and the section renders the audience in force. The
 * correction to the old text is not "the read was served": it is that the old
 * text derived a serving gap from a docblock that asserted the same gap, without
 * opening the route's allow-list or the mapper.
 *
 * What the old text was RIGHT about, and what still stands:
 *
 * - the ROSTER (`own_user_ids` / `resolved_user_ids`) is **cut**, by a standing
 *   disclosure ruling — `routes/tickets.ts`: *"an explicit audience
 *   ROSTER, a disclosure no plan authorized"*. So an `explicit` audience renders
 *   its mode and says the list is not served, rather than drawing names;
 * - the PROVENANCE is **not in the row** — who set the audience, and when, is on
 *   the LEDGER, and no read behind this component carries it. So the *"set by
 *   {actor} on {date}"* clause renders only when a caller supplies a claim, and
 *   is absent in production rather than invented.
 *
 * The claim's own authorisation is unchanged — a fuller read may hand this
 * component a complete `VisibilityClaim` (`userIds` and `claim` filled) and the
 * section renders all three clauses.
 *
 * `null` is still reachable and still right, but it now means something
 * narrower: **no read carried the row at all** — the offline replica, whose
 * reduced state has no visibility column (`replica-data-source.ts`). It is a
 * prop that admits `null` with an absence sentence behind it, NOT a default.
 * Rendering "Inherited from the parent" for a read that carried nothing would be
 * this component asserting a mode nobody claimed — the same absence-as-fact the
 * refusals exist to prevent, on the one surface whose subject is who may see
 * what.
 *
 * The WRITE side is whole: `visibility.set` is a registered domain event
 * (`packages/domain/src/vocabulary.ts:224`, entity kind `ticket`) and goes
 * through the ordinary `DataSource.ingest` door, which is the same door,
 * refusal and attribution every other claim gets.
 *
 * ## Its mount point in the ticket sheet: it WAS dark, and it is not any more
 *
 * **⚠ CORRECTED 2026-09-20.** This section read: *"`TicketSheet` returns its
 * refusal branch before the details body renders, and `getTicket` refuses today —
 * so a person cannot reach this component through the sheet until that read is
 * served."* Ruling P25 clause 1 (`c86c4b5c`, 2026-09-06) served that read, so the
 * sheet's refusal branch no longer fires on a healthy read and the details body —
 * this section included — renders. **What is deliberately NOT corrected here is
 * this component's own tests.** The sentence they were justified by read: *"this
 * component's tests drive it DIRECTLY: a sheet test that fabricated a successful
 * `getTicket` in order to see this section would be exercising a line unreachable
 * in production and reporting the result as coverage."* Driving it directly is
 * still the narrower unit, but the UNREACHABLE-vacuity argument has expired with
 * the refusal, and whether the sheet should now prove this mount is a test-design
 * decision a comment correction does not get to take. *Owner: whoever next
 * touches this file.*
 *
 * ## The payload spellings are the domain's, and both refusals are honoured
 *
 * `visibilitySetPayload` is `{ticketId, mode, userIds?}` `.strict()`, and it
 * refuses two shapes: `explicit` with an empty or missing list (an audience of
 * nobody, which reads as a restriction hiding the ticket from everyone
 * including its author), and `userIds` on any other mode (a list nothing will
 * ever read, recorded permanently and untrue). This component never builds
 * either: the key is omitted for the three standing modes, and Apply is
 * disabled while `explicit` names nobody. `payload.ticketId` restates the
 * entity on purpose and `parse-event.ts` refuses the two disagreeing, so both
 * are set from the one `ticketId` prop.
 */
/**
 * The server's own claim, reduced to the content a re-seed turns on: the mode
 * the ticket asserts for itself and the roster it names. Sorted, because the
 * wire's order is not a fact about the audience — two reads naming the same
 * people in a different order are the same claim.
 *
 * `null` (`no read served one`) is its own key rather than an empty claim: a
 * read that has not answered yet must not be read as "the claim moved".
 */
export function visibilityClaimKey(current: VisibilityClaim | null): string {
  if (current === null) return 'none';
  return JSON.stringify([current.ownMode, [...(current.userIds ?? [])].sort()]);
}

export function VisibilityEditor({
  dataSource,
  workspaceId,
  ticketId,
  currentUserId,
  members,
  current,
  canEdit,
  onChanged,
}: VisibilityEditorProps) {
  // Seeded from the ticket's OWN claim, never from the resolved audience: the
  // picker is what a `visibility.set` on THIS ticket would assert, and a ticket
  // whose own mode is `inherit` must not open showing a mode it never claimed.
  // (`current?.userIds ?? []` is not a default mode — it is the roster the read
  // served, and `[]` is what "no read served one" leaves the picker holding.)
  //
  // ⚠ This seed is re-run when the sheet's live query changes ticket, because
  // `useLiveQuery` answers `null` on a queryKey change and the "Loading…" branch
  // remounts the subtree. That is what makes the picker correct on a ticket
  // SWITCH rather than stale from the previous one — and it is a behaviour of
  // the hook, not an invariant this component states. Named here so the next
  // reader sees the dependency instead of discovering it.
  const [mode, setMode] = useState<VisibilityMode>(current?.ownMode ?? 'inherit');
  const [userIds, setUserIds] = useState<string[]>(current?.userIds ?? []);
  /**
   * ⚠ A RELOAD IS NOT A REMOUNT, SO THE SEED ABOVE DOES NOT RE-RUN FOR IT
   * (E2-33c, 2026-09-21).
   *
   * The docblock above names the ONE behaviour that re-seeds today: `useLiveQuery`
   * answers `null` on a QUERYKEY change, and the "Loading…" branch remounts this
   * subtree — so a ticket SWITCH is correct. A RELOAD keeps the key, so `data`
   * (and `current`) updates IN PLACE with this component still mounted
   * (`use-live-query.ts`, measured by the lane that filed this) — and the
   * standing sentence above renders from `current` while the fieldset below
   * renders from the seeded state. Two modes on one screen, with Apply sending
   * the stale one.
   *
   * Re-seeded on the SERVER CLAIM, not on the object: `current` is a fresh
   * object on every read, so keying the effect on identity would wipe a
   * half-authored fieldset whenever a stream event merely RE-DELIVERED the same
   * claim. The key is the claim's own content — its mode and its roster — so the
   * fieldset is reset exactly when the standing claim has actually moved, which
   * is the moment it would otherwise contradict the sentence above it.
   */
  const seededFrom = useRef(visibilityClaimKey(current));
  useEffect(() => {
    const next = visibilityClaimKey(current);
    if (seededFrom.current === next) return;
    seededFrom.current = next;
    setMode(current?.ownMode ?? 'inherit');
    setUserIds(current?.userIds ?? []);
  }, [current]);
  const [submission, setSubmission] = useState<Submission>({ kind: 'idle' });
  /**
   * A write that never reached a server (V3, 2026-09-21) — its own slot, and NOT
   * a `Submission` state, because a transport failure is not a refusal: no
   * authority judged it and no rule names it. `BulkCloseDialog` keeps the same
   * split for the same reason.
   */
  const [transportError, setTransportError] = useState<string | null>(null);

  /**
   * The standing chip is a menu trigger (spec 2026-09-22, Task 5): its own
   * `useRef`/`useState` pair for the `Popover` it opens, independent of the
   * submission/seed state above. `menuOpen && canEdit` gates the portal itself
   * (belt-and-braces beside the trigger's own `disabled`): a viewer who cannot
   * edit never opens this, whatever `menuOpen` happens to hold.
   */
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // The viewers/sentence renderer, and the SAME shape `ticket-sheet.tsx`'s
  // `nameOf` takes: `actorLabel` stays the outer renderer — it checks
  // `SYSTEM_ACTOR_NAMES` first, which is what keeps a system actor from being
  // renamed and keeps the id floor total — while the LABEL it is handed comes
  // from `memberLabel` when the id is on the roster (name → email → id), and
  // from `null` when it is not, which `actorLabel` renders as the id.
  //
  // The member row was already in hand (`members.find`); reading `.name` past
  // it printed a ULID for the nameless population on the two surfaces that are
  // most obviously lists of PEOPLE — the chips under "Who can see it" and the
  // `Only: …` sentence — while the picker one section up had offered those same
  // people by email since E4-6. Case 13.1296.
  const nameOf = (userId: string): string => {
    const member = members.find((candidate) => candidate.id === userId);
    return actorLabel(userId, member === undefined ? null : memberLabel(member));
  };

  const toggle = (userId: string) =>
    setUserIds((chosen) =>
      chosen.includes(userId) ? chosen.filter((id) => id !== userId) : [...chosen, userId],
    );

  // The warning's condition, and it is about the list being AUTHORED — not
  // about the standing claim. Somebody removing themselves needs telling before
  // they submit, and somebody who was never on the list needs the same telling.
  const willLockSelfOut = mode === 'explicit' && !userIds.includes(currentUserId);
  const explicitNamesNobody = mode === 'explicit' && userIds.length === 0;

  /**
   * The dot's tone, and it is the MODE's fact rather than the roster's.
   *
   * A restricted ticket whose names were not served is STILL restricted, so this
   * reads `resolvedMode` and never `namedAudience` — keying the tone on the
   * roster would paint "not restricted" over the one state this section exists
   * to disclose. `null` (no read carried the row) draws no pill at all and so
   * has no dot to tone; the guard is here rather than in the JSX because the
   * tone is a fact about the claim, not about which branch rendered.
   *
   * The dot is DECORATIVE and `aria-hidden` in the markup below: the label
   * beside it states the same fact in words, so WCAG 1.4.11's "convey
   * information" obligation is discharged by the text and the dot carries no
   * meaning a screen reader would lose. It is also why the dot needs no
   * accessible name of its own.
   */
  const restricted = current !== null && current.resolvedMode === 'explicit';

  const apply = async (): Promise<void> => {
    setSubmission({ kind: 'sending' });
    const make = makeSubmittedFactory({ actorId: currentUserId, origin: 'web' });
    /**
     * THE CLAIM IS THE AUTHORED LIST, UNTOUCHED.
     *
     * `willLockSelfOut` is read by the render and by nothing else. It does not
     * reach this line, and the planted defect in `visibility-editor.test.tsx`
     * is exactly that: the warning is on screen AND the submitted `userIds` is
     * byte-identical to what was authored, asserted in one case so that a
     * "helpful" `[...userIds, currentUserId]` cannot pass by making the warning
     * true and the claim false.
     */
    const payload: Record<string, unknown> =
      mode === 'explicit' ? { ticketId, mode, userIds } : { ticketId, mode };
    /**
     * ⚠ **THE AWAIT IS WRAPPED, AND ITS ABSENCE WAS V3 (2026-09-21).** This call
     * site is `onClick={() => void apply()}`, so a REJECTED `ingest` — a dropped
     * connection, a 500, an unparseable body — was discarded entirely: nothing
     * caught it, `submission` stayed `{kind:'sending'}`, and that is exactly the
     * state the Apply button is `disabled` on. The component's only sentence sits
     * under `submission.kind === 'refused'`, so the person got a control that
     * never came back and no explanation. **`submission` returns to `idle` here
     * rather than becoming a refusal**, because nothing was refused — no server
     * judged this — and dressing a transport failure as the engine's words is the
     * thing the refusal slot exists to prevent.
     */
    let result: IngestResult | undefined;
    try {
      [result] = await dataSource.ingest([
        make({ workspaceId, entity: { kind: 'ticket', id: ticketId }, type: 'visibility.set', payload }),
      ]);
    } catch (cause) {
      setSubmission({ kind: 'idle' });
      setTransportError(writeUnreachedCopy(cause));
      return;
    }
    setTransportError(null);
    if (result === undefined) {
      // An empty results array is not a commit. The door answers one result per
      // event; nothing coming back means the claim's fate is unknown, and
      // reporting success would be this component inventing the answer.
      setSubmission({ kind: 'refused', rule: 'no-answer', reason: 'The server returned no answer for this change.' });
      return;
    }
    if (result.status === 'committed') {
      setSubmission({ kind: 'idle' });
      onChanged?.();
      // Apply closes the menu on success and leaves it open on refusal (spec
      // decision 6): a refusal or an unreached write needs to stay visible
      // beside the controls that produced it, but a committed write has
      // nothing more to say here.
      setMenuOpen(false);
      return;
    }
    // The authority's own words, carried without paraphrase — a refusal is a
    // named rule and the engine's reason; an invalid is the door's code and
    // message. Same treatment `TicketSheet.submitTransition` gives a refused
    // transition, for the same reason.
    if (result.status === 'refused') setSubmission({ kind: 'refused', rule: result.rule, reason: result.reason });
    else setSubmission({ kind: 'refused', rule: result.code, reason: result.message });
  };

  return (
    <section className="gn-visibility" aria-label="Who can see this" data-testid="visibility-editor">
      {/*
        The standing chip IS the menu trigger now (spec 2026-09-22, Task 5):
        clicking it opens the `Popover` below holding the SAME fieldset this
        section always had, moved rather than rebuilt — every control inside
        keeps its role, name and behaviour. Two renders rather than one
        conditional's worth of extra JSX, because they differ in more than the
        children: only the served-claim branch carries `.gn-visibility__standing`
        (and the dot/mode span inside it), which is load-bearing for
        `ticket-sheet.test.tsx`'s existing `.gn-visibility__standing` queries and
        for 17.004's "no pill, no dot when unserved" cases — inventing either on
        an unserved read would be exactly the invention `current === null`
        exists to refuse.
      */}
      {current === null ? (
        <button
          ref={triggerRef}
          type="button"
          className="gn-visibility__trigger"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          disabled={!canEdit}
          onClick={() => setMenuOpen((open) => !open)}
        >
          Who can see this…
        </button>
      ) : (
        <div className="gn-visibility__standing">
          <button
            ref={triggerRef}
            type="button"
            className="gn-visibility__trigger"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            disabled={!canEdit}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span
              className={
                restricted
                  ? 'gn-visibility__standing-mode gn-visibility__standing-mode--restricted'
                  : 'gn-visibility__standing-mode'
              }
            >
              <span className="gn-visibility__dot" aria-hidden="true" />
              {standingSentence(current, nameOf)}
            </span>
          </button>
          {current.resolvedMode === 'explicit' && namedAudience(current) === null ? (
            // The MODE is served and the LIST is not (ruling: the roster stays
            // cut). "Only the people this ticket names" without this clause
            // would be a partial answer wearing the shape of a complete one —
            // the reader cannot tell a name withheld by policy from a list that
            // was simply never drawn.
            <span className="gn-visibility__roster-unserved">
              The list itself is not being served — this read carries the ticket’s audience mode
              and not the names it holds.
            </span>
          ) : null}
          {namedAudience(current) !== null ? (
            // The prototype's `WHO CAN SEE IT` caption and one READ-ONLY chip
            // per named person (`desktop.dc.html:1214-1222`) — no × and no
            // `Add someone…` select, because both are per-person writes this
            // build does not have; the people checklist inside the menu is the
            // one write path and it stays there.
            <div className="gn-visibility__viewers" data-testid="visibility-viewers">
              <p className="gn-visibility__viewers-caption">Who can see it</p>
              <div className="gn-visibility__viewer-chips">
                {namedAudience(current)!.map((userId) => (
                  <span key={userId} className="gn-visibility__viewer">
                    {nameOf(userId)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {current.claim === null ? null : (
            <span className="gn-visibility__standing-claim">
              set by {actorLabel(current.claim.actorId, current.claim.actorName)} on{' '}
              {formatDateTime(current.claim.serverTime)}
            </span>
          )}
        </div>
      )}

      {current === null ? (
        <p className="gn-visibility__unserved" role="status">
          The audience this ticket has now is not being served yet — no read on this branch carries
          it. Anything shown here would be a guess.
        </p>
      ) : null}

      {/* ALWAYS, on every mode and whether or not this viewer may edit. */}
      <p className="gn-visibility__owner-note">{OWNER_ALWAYS_SEES_COPY}</p>

      {canEdit ? null : (
        /*
          ⚠ **THE ARM IS DEAD IN THE SHIPPED PRODUCT, AND THAT IS RECORDED RATHER
          THAN FIXED HERE (F4, 2026-09-21).** It renders only when `canEdit` is
          false, `canEdit` is `TicketSheet`'s `canSetVisibility` prop, whose
          declared default is `true` (`ticket-sheet.tsx:422`), and a sweep of
          `apps/web/**`, `apps/desktop/**` and `apps/mobile/**` for
          `canSetVisibility` finds ONE hit and it is a COMMENT
          (`page.tsx:2825`) — no caller anywhere passes it, so no shipped surface
          can render this. **The sentence is corrected above regardless**, because
          a wrong permission statement is not made less wrong by being
          unreachable, and because the prop is a declared part of this component's
          public surface that a caller may pass at any time. **Deleting the arm —
          or giving it the read that makes it reachable — is a decision about
          `canSetVisibility` rather than about this sentence**, and the sheet's
          own docblock (`ticket-sheet.tsx:225-241`) argues at length that the
          client cannot know role or creator, which is a sound argument for
          showing the control and letting the door refuse. **Owner: whoever next
          revisits `canSetVisibility`.**
        */
        <p className="gn-visibility__read-only">{READ_ONLY_COPY}</p>
      )}

      {/*
        The controls move into the trigger's popover, unchanged markup (spec
        decision 6). `open` is gated on `canEdit` too, belt-and-braces beside
        the trigger's own `disabled`. `Popover` itself renders nothing when
        `open` is false, so a viewer who cannot edit never portals this.
      */}
      <Popover
        triggerRef={triggerRef}
        open={menuOpen && canEdit}
        onClose={() => setMenuOpen(false)}
        aria-label="Change who can see this"
      >
        <div className="gn-visibility__controls">
          <fieldset className="gn-visibility__modes">
            <legend>Change who can see this</legend>
            {VISIBILITY_MODES.map((candidate) => (
              <label key={candidate} className="gn-visibility__mode">
                <input
                  type="radio"
                  name="gn-visibility-mode"
                  value={candidate}
                  checked={mode === candidate}
                  onChange={() => setMode(candidate)}
                />
                {MODE_LABELS[candidate]}
              </label>
            ))}
          </fieldset>

          {mode === 'explicit' ? (
            <fieldset className="gn-visibility__people">
              <legend>Who, exactly</legend>
              {members.length === 0 ? (
                <p className="gn-visibility__no-roster">
                  No one to choose from — the roster for this workspace has not been read.
                </p>
              ) : (
                members.map((member) => (
                  <label key={member.id} className="gn-visibility__person">
                    <input
                      type="checkbox"
                      checked={userIds.includes(member.id)}
                      onChange={() => toggle(member.id)}
                    />
                    {/* A ROSTER MEMBER'S LABEL IN THE PICKER, through the shared
                        `memberLabel` — the same function that names a person
                        everywhere else, and from Task 4 on the same function the
                        roster JOIN's value is built with, so a person's row and
                        their claim line cannot disagree.

                        E4-6 is why this is not `actorLabel(member.id,
                        member.name)`: that fallback is the raw id, which is right
                        for PROVENANCE ("never blank, never a fabricated
                        'system'") and wrong for a CHOOSER. A member whose display
                        name is empty was offered as
                        `01M1V035TASFV2G9WPWFV9QDVW`; the dev roster ships exactly
                        that row (`accountant@e2e.gisik-nokma.local`, `name = ''`),
                        so it is a shape the product really meets rather than a
                        fixture's invention.

                        `actorLabel` is NOT gone and is not the same job: it is
                        still what `:242` and `:350` render this screen's claims
                        through, because it checks `SYSTEM_ACTOR_NAMES` FIRST — a
                        step a picker must never take, and one auto-close must
                        never lose. It keeps no email step of its own; the email
                        reaches it through the join, not through this call. */}
                    {memberLabel(member)}
                  </label>
                ))
              )}
            </fieldset>
          ) : null}

          {willLockSelfOut ? (
            <p role="alert" className="gn-visibility__lockout">
              {LOCKOUT_WARNING_COPY}
            </p>
          ) : null}

          <Button
            variant="primary"
            // Disabled for the ONE shape the domain refuses, so the refusal is
            // never spent on a body this component could see was malformed.
            disabled={explicitNamesNobody || submission.kind === 'sending'}
            onClick={() => void apply()}
          >
            Apply
          </Button>

          {submission.kind === 'refused' ? (
            <p role="alert" className="gn-visibility__refusal">
              <span className="gn-visibility__refusal-rule">{submission.rule}</span>
              {submission.reason}
            </p>
          ) : null}

          {transportError === null ? null : (
            /* `role="alert"`, like the refusal beside it: this is the answer to a
               click, and a reader who cannot see the button re-enable needs to be
               told. It carries no rule name — there is no rule — which is why it
               does not reuse the refusal's `<span class="…__refusal-rule">`. */
            <p role="alert" className="gn-visibility__unreached">
              {transportError}
            </p>
          )}
        </div>
      </Popover>
    </section>
  );
}

const MODE_LABELS: Record<VisibilityMode, string> = {
  workspace: 'Everyone in the workspace',
  project: 'Everyone on the project',
  explicit: 'Only the people I name',
  inherit: 'Whatever the parent decided',
};

/**
 * The STANDING line's words, and they are deliberately not `MODE_LABELS`.
 *
 * Two differences and one absence, all of them the same fact: `MODE_LABELS`
 * names a choice a viewer is about to MAKE, and this names an audience that is
 * already in force.
 *
 * - `explicit` is third-person here — *"the people this ticket names"*, not *"the
 *   people I name"* — because whoever chose the audience is routinely not
 *   whoever is reading the ticket.
 * - `inherit` cannot appear: this is keyed by the RESOLVED mode, and
 *   `proj_visibility` walks the inherit chain at write time, so the key type
 *   (`ResolvedVisibilityMode`) has no such member and the compiler enforces it.
 */
const RESOLVED_MODE_LABELS: Record<ResolvedVisibilityMode, string> = {
  workspace: MODE_LABELS.workspace,
  project: MODE_LABELS.project,
  explicit: 'Only: the people this ticket names',
};

/**
 * The names an `explicit` audience brought, or `null` when none arrived.
 *
 * ## Why this is ONE function, read by the sentence AND by the clause beneath it
 *
 * Two things must agree about the unserved state: the standing SENTENCE (which
 * must not leave `Only: ` dangling) and the CLAUSE beneath it (which explains
 * the absence). Written as two guards a few lines apart they are two chances to
 * disagree, and the failure is SILENT — `Only: ` renders with nothing after it
 * and nothing says why, which is a partial answer wearing the shape of a
 * complete one. So the state is computed once, here, and both readers ask this.
 *
 * **Returning the names rather than a boolean is what makes it one definition
 * instead of three.** A boolean would have to be re-checked at the call site to
 * narrow `userIds`, and a re-check is a second copy. This way the sentence needs
 * no second condition at all: `null` covers every mode but a *named* explicit
 * one, so a single `if` answers the whole question.
 *
 * **The empty roster cannot come off the wire and is folded in anyway.** The
 * domain refuses `explicit` with no names (`visibilitySetPayload`: *"an audience
 * of nobody ... reads as a restriction that hides the ticket from everyone
 * including its author"*) and the sheet passes `null`, never `[]`. But this
 * prop admits `string[] | null`, so a caller CAN hand it `[]` — and a guard is
 * about the state it makes unrepresentable, not the state it happens to receive.
 * Found by the reviewer on 2026-09-20 as a latent coupling rather than a live
 * defect.
 */
function namedAudience(claim: VisibilityClaim): string[] | null {
  if (claim.resolvedMode !== 'explicit') return null;
  if (claim.userIds === null || claim.userIds.length === 0) return null;
  return claim.userIds;
}

function standingSentence(claim: VisibilityClaim, nameOf: (userId: string) => string): string {
  const names = namedAudience(claim);
  // The names, not the count. "3 people" is a number a reader cannot check
  // against the one question this section answers.
  if (names !== null) return `Only: ${names.map(nameOf).join(', ')}`;
  // Every other state is the mode's own label: the three standing audiences,
  // and an explicit one whose names did not arrive — which the clause beside
  // this sentence says out loud rather than leaving `Only: ` dangling.
  return RESOLVED_MODE_LABELS[claim.resolvedMode];
}

