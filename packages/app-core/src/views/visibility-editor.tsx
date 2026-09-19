import { useState } from 'react';
import { VISIBILITY_MODES, type VisibilityMode } from '@gisik-nokma/domain';
import { Button } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import { actorLabel, formatDateTime } from '../provenance.js';
import { makeSubmittedFactory } from '../submit.js';
import type { Actor, ClaimProvenance } from '../view-types.js';

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

/** How the ticket's audience stands now, as somebody's claim rather than a property. */
export type VisibilityClaim = {
  mode: VisibilityMode;
  /** Empty for every mode but `explicit`, which is the only one that names people. */
  userIds: string[];
  claim: ClaimProvenance;
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
   */
  members: Actor[];
  /**
   * The standing claim, or `null` when nothing served it.
   *
   * **`null` is what the shipped server produces today**, and this prop exists
   * in the honest shape rather than being dropped. See the component docblock:
   * `TicketRead` carries no visibility field and `GET
   * /v1/workspaces/:ws/tickets/:id` serves no provenance block at all, so there
   * is no read behind this. The component renders the ABSENCE — a sentence
   * saying the current audience is not being served — rather than drawing
   * "Inherited" and inventing the very default the ledger may not hold.
   */
  current: VisibilityClaim | null;
  /**
   * Whether this viewer may CHANGE the audience — spec §6: project admins and
   * the ticket's creator.
   *
   * Decided by the caller and passed in, not resolved here, because the two
   * facts it needs (project-admin rights, and who created this ticket) are the
   * caller's reads and not this component's. It gates only the CONTROLS: the
   * standing claim and the owner-disclosure line render either way, because
   * somebody who cannot change the audience still needs to know what it is and
   * who else can see.
   */
  canEdit: boolean;
  /** Told after a committed change, so the sheet can refetch what it holds. */
  onChanged?: () => void;
};

type Submission = { kind: 'idle' } | { kind: 'sending' } | { kind: 'refused'; rule: string; reason: string };

/**
 * "Who can see this" — the ticket sheet's audience section (spec §6).
 *
 * ## The READ side of this surface is UNSERVED, and that is reported rather than papered over
 *
 * Task 15b asks for "current resolved visibility rendered with its provenance
 * like every other claim". There is no such read on this branch:
 *
 * - `TicketRead` (`src/view-types.ts:115`) has five fields and none of them is
 *   visibility;
 * - `GET /v1/workspaces/:ws/tickets/:ticketId` answers a `proj_visibility` row
 *   wrapped in `{ticket, parent, rollup}` — `mapTicketRead`'s absence table
 *   records that "the wrapper carries no provenance block at all". **This clause
 *   ended "...which is why `getTicket` REFUSES rather than mapping", and that half
 *   is corrected 2026-09-20: ruling P25 clause 1 (`c86c4b5c`, 2026-09-06) served
 *   that absence and `getTicket` maps.** The bullet's CONCLUSION is untouched —
 *   the wrapper still carries no provenance block, and `TicketRead` has no
 *   visibility field either;
 * - so nothing anywhere can hand this component a `VisibilityClaim`.
 *
 * The response is a prop that admits `null` and an absence sentence behind it,
 * NOT a default. Rendering "Inherited from the parent" for an unserved read
 * would be this component asserting a mode nobody claimed — the same
 * absence-as-fact the refusals exist to prevent, on the one surface whose
 * subject is who may see what.
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
  const [mode, setMode] = useState<VisibilityMode>(current?.mode ?? 'inherit');
  const [userIds, setUserIds] = useState<string[]>(current?.userIds ?? []);
  const [submission, setSubmission] = useState<Submission>({ kind: 'idle' });

  const nameOf = (userId: string): string =>
    actorLabel(userId, members.find((member) => member.id === userId)?.name ?? null);

  const toggle = (userId: string) =>
    setUserIds((chosen) =>
      chosen.includes(userId) ? chosen.filter((id) => id !== userId) : [...chosen, userId],
    );

  // The warning's condition, and it is about the list being AUTHORED — not
  // about the standing claim. Somebody removing themselves needs telling before
  // they submit, and somebody who was never on the list needs the same telling.
  const willLockSelfOut = mode === 'explicit' && !userIds.includes(currentUserId);
  const explicitNamesNobody = mode === 'explicit' && userIds.length === 0;

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
    const [result] = await dataSource.ingest([
      make({ workspaceId, entity: { kind: 'ticket', id: ticketId }, type: 'visibility.set', payload }),
    ]);
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
    <section className="gn-visibility" aria-label="Who can see this">
      <h3 className="gn-visibility__heading">Who can see this</h3>

      {current === null ? (
        <p className="gn-visibility__unserved" role="status">
          The audience this ticket has now is not being served yet — no read on this branch carries
          it. Anything shown here would be a guess.
        </p>
      ) : (
        <p className="gn-visibility__standing">
          <span className="gn-visibility__standing-mode">{standingSentence(current, nameOf)}</span>{' '}
          <span className="gn-visibility__standing-claim">
            set by {actorLabel(current.claim.actorId, current.claim.actorName)} on{' '}
            {formatDateTime(current.claim.serverTime)}
          </span>
        </p>
      )}

      {/* ALWAYS, on every mode and whether or not this viewer may edit. */}
      <p className="gn-visibility__owner-note">{OWNER_ALWAYS_SEES_COPY}</p>

      {canEdit ? (
        <>
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
                    {actorLabel(member.id, member.name)}
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
        </>
      ) : (
        <p className="gn-visibility__read-only">
          Only a project admin, or whoever created this ticket, can change who sees it.
        </p>
      )}
    </section>
  );
}

const MODE_LABELS: Record<VisibilityMode, string> = {
  workspace: 'Everyone in the workspace',
  project: 'Everyone on the project',
  explicit: 'Only the people I name',
  inherit: 'Whatever the parent decided',
};

function standingSentence(claim: VisibilityClaim, nameOf: (userId: string) => string): string {
  if (claim.mode !== 'explicit') return MODE_LABELS[claim.mode];
  // The names, not the count. "3 people" is a number a reader cannot check
  // against the one question this section answers.
  return `Only: ${claim.userIds.map(nameOf).join(', ')}`;
}
