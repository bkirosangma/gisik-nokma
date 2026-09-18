'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Select } from '@gisik-nokma/ui';
import { membershipId } from '@gisik-nokma/domain';
import { formatDateTime, makeSubmittedFactory, type RosterMember } from '@gisik-nokma/app-core';
import { InviteAdminError, type MintedInvite, type PendingInvite } from '@gisik-nokma/app-core/online';
import { AppNav } from '../../../../src/app-nav.js';
import { ShellRefusal } from '../../../../src/shell-refusal.js';
import { useAppServices, useCurrentUser } from '../../../../src/providers.js';
import { useWorkspaceName } from '../../../../src/use-workspace-name.js';

/**
 * The minted link's copy. Pinned by Plan 6 Task 15b item 2 and exported so the
 * test asserts this string rather than a re-typed one.
 *
 * It is true of the server rather than a caution: the mint stores only a sha256
 * hash of the token and the raw copy leaves in that one response. There is no
 * "show it again" behind any door, and the pending list deliberately carries no
 * token, so a UI implying a re-read exists would be promising something nothing
 * can deliver.
 */
export const COPY_IT_NOW = 'Copy it now — it is not stored and cannot be shown again';

/**
 * `/w/[workspaceId]/members` — the roster, and for owners and admins the invite
 * machinery (Plan 6 Task 15b, item 2).
 *
 * ## The roster table, and the THREE things the prototype draws that are NOT here
 *
 * The screen is ported from `desktop.dc.html@6d7b67c0a52c:651-798`. What the
 * product can back from the wire is a Person column and a Role column over the
 * roster `GET /v1/workspaces/:workspaceId/members` already serves, plus a
 * heading and a derived summary line. Three things the prototype draws are
 * deliberately ABSENT, and each is absent for the same reason rather than three
 * different ones — the product has no field, no door, or no read behind it, and
 * a screen that drew them anyway would be inventing. (A fourth — the role
 * `<select>` — was absent on that same reasoning until 2026-09-18 and is now
 * drawn in part; its own section below carries the correction, because the
 * reason it was withheld turned out to be false even though withholding it was
 * right.)
 *
 * - **Project access, Assigned and Last seen columns** (`:664-666`, `:691-693`).
 *   `readMembers` selects `user_id`, `u."name"` and `role` and nothing else
 *   (`routes/builder-reads.ts:247`), so none of the three has a wire field.
 * - **The "Ticket-only access" panel and its "Add to workspace" button**
 *   (`:700-718`). It is built from `ticketOnlyPeople` (data `:3034`), a join of
 *   the workspace's TICKETS against a people directory — no product read
 *   computes that set, and the button behind it writes a membership the product
 *   has no door for.
 * - **`Email`**, which the prototype renders inside the Person cell (`:675`) and
 *   which is not on this wire either.
 *
 * What IS here and was already here — the invite panel and its 403 gate — is
 * unchanged. Its strings are load-bearing and match the prototype verbatim.
 *
 * ## THE ROLE CONTROL — CORRECTED 2026-09-18, and the wrong sentence is kept
 *
 * Until this date the Role cell carried a comment saying the prototype's select
 * was omitted because *"the product has NO per-member role-change door at all:
 * no route accepts one, and `role` is written only by membership creation."*
 * **Both halves of that are measurable and both are false.** `POST /events`
 * (`apps/server/src/routes/events.ts`) is the generic client batch door; its
 * body schema is `{ events: unknown[] }` with `minItems: 1` and no per-type
 * constraint, and `membership.granted` is admitted by it. And
 * `apps/server/src/projections/proj-memberships.ts` upserts `ON CONFLICT …
 * DO UPDATE SET role = excluded.role`, so `role` is written by any later grant
 * and not only at membership creation.
 *
 * The conclusion — do not draw a picker — was right, and it was right for a
 * reason nobody had checked. What was missing was never the door; it was the
 * **guard**. An admin could already submit a role change, and with it demote the
 * sole owner and promote themselves, so a picker would have been a control
 * offering to do the one thing the workspace could not survive. Task 1 of
 * `docs/superpowers/plans/2026-09-18-membership-role-guard` closed that in both
 * layers (the actor question in `check-permission.ts`, the world-state question
 * in the rule engine), and this cell now draws the control the prototype draws,
 * scoped as the sections below describe.
 *
 * The earlier sentence is **corrected rather than deleted**, which is this
 * repo's convention for a refuted claim: a passage that vanishes takes its
 * mistake with it, and the next person to wonder why the picker was withheld
 * finds nothing to tell them it once was.
 *
 * ## THE ROLE CONTROL IS OFFERED WHERE IT CAN STATE THE VALUE, which is narrower than the prototype
 *
 * The prototype gates the select on the VIEWER alone (`:3061`,
 * `canEditRole: myRoleIsAdmin`) and lists `Owner` among its options, so its
 * owner rows are editable like any other. This product omits `Owner` from the
 * options — the invite form's judgement, and the same one the plan records — and
 * **the two halves do not compose.** `Select` renders
 * `selected ? selected.label : placeholder`
 * (`packages/ui/src/select/select.tsx:255`); with no option whose value is
 * `owner` there is no selected item, so an owner's cell would render the
 * placeholder `Select…` beside the person who owns the workspace. A cell that
 * does not say what its person's role is, on the screen whose whole subject is
 * who holds what, is the failure this page's docblock is about. So the control
 * is drawn for every row whose role it can state, and the chip stays on an
 * owner's row; offering that row a control would also be a demotion door with no
 * designed flow — the mirror of the promotion the plan refuses to add.
 *
 * **This narrowing was a CONSERVATIVE DEFAULT taken by the executor, and it has
 * since been RULED ON: the controller confirmed it on 2026-09-18**, answering the
 * question filed as `gisik-nokma-lanes/EXEC2-2026-09-18-owner-row-editability.md`
 * (which priced both readings). The earlier sentence in this spot said the
 * narrowing was "not a ruling", which was true only until the answer came back.
 * The default stands; if it is ever revisited, the predicate in the Role cell
 * and case 13.828 change together, and nothing else does.
 *
 * ## THE ROLE GATE IS THE SERVER'S 403, and that is an adaptation worth naming
 *
 * Task 15b says the invite machinery is "feature-gated on the caller's own role
 * from `/v1/me/workspaces`". That route does carry a `role`
 * (`apps/server/src/routes/workspaces.ts:149`), but `getMyWorkspaces` REFUSES
 * whole — `mapWorkspaceRefs` throws a `ServingGapError` — so no client on this
 * branch can read it, and adding a role-only mapper over the same route would
 * be routing around a refusal this step is forbidden to weaken.
 *
 * What IS readable is the door's own answer. `GET
 * /v1/workspaces/:workspaceId/invites` (`routes/invites.ts:542`) resolves the
 * caller's effective role and answers **403 `INVITE_ADMIN_ONLY_BODY`** to
 * anyone who is not an owner or admin, because an invitation's address is PII.
 * So the pending read IS the role question, asked of the one thing that knows:
 *
 * - **403** — a member. Roster only, no mint form, and the door's own sentence
 *   shown as the explanation rather than a silence the viewer must interpret.
 * - **200** — an owner or admin. Roster, pending list, and the mint form.
 * - anything else — a refusal, rendered, because a failed read must not be
 *   mistaken for either answer.
 *
 * This is the same shape the server itself argues for in `routes/invites.ts`:
 * gate at the door that owns the rule rather than by a second check free to
 * drift from the first. It is strictly better than the plan's gate in one way
 * worth stating — it cannot disagree with the door — and worse in another: a
 * member's page makes a request that 403s, so the gate costs a round trip and
 * an entry in the server's log.
 *
 * ## Revoke goes through the ORDINARY ingest door
 *
 * `invite.revoked` is a registered domain event, payload `{inviteId}`, filed
 * against `{kind:'invite', id: inviteId}` — `parse-event.ts` refuses the two
 * disagreeing. It is submitted through `DataSource.ingest` like every other
 * claim, so it gets the ordinary refusal and the ordinary attribution, and it
 * needs no check here: `invite.revoked` is in `ADMIN_ONLY_TYPES`
 * (`apps/server/src/permissions/check-permission.ts:207`).
 */
export default function MembersPage() {
  const params = useParams<{ workspaceId: string }>();
  const { workspaceId } = params;
  const { dataSource, invitesAdmin } = useAppServices();
  const user = useCurrentUser();
  /**
   * The workspace's own served name, for the summary line — `null` while it is
   * pending and `null` if the read refuses, and the summary is built WITHOUT it
   * in that case rather than printing a placeholder. Its own docblock says why:
   * "a caller renders no name rather than the raw id or a stale guess".
   */
  const workspaceName = useWorkspaceName(workspaceId);

  const [members, setMembers] = useState<RosterMember[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingInvite[] | null>(null);
  const [revokeRefusal, setRevokeRefusal] = useState<string | null>(null);
  const [roleRefusal, setRoleRefusal] = useState<string | null>(null);
  const [adminGate, setAdminGate] = useState<
    { kind: 'asking' } | { kind: 'admin' } | { kind: 'member'; why: string } | { kind: 'failed'; why: string }
  >({ kind: 'asking' });

  /** The roster read, and it is a callback rather than a bare effect because a
   *  committed role change re-runs it: the cell renders the role the SERVER
   *  holds, so the only way a change becomes visible is by re-reading it. */
  const loadMembers = useCallback(() => {
    dataSource.query.getMembers(workspaceId).then(setMembers, (cause: unknown) => {
      setMembersError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [dataSource, workspaceId]);

  useEffect(loadMembers, [loadMembers]);

  const loadPending = useCallback(() => {
    invitesAdmin.listPending(workspaceId).then(
      (rows) => {
        setPending(rows);
        setAdminGate({ kind: 'admin' });
      },
      (cause: unknown) => {
        if (cause instanceof InviteAdminError && cause.status === 403) {
          setAdminGate({
            kind: 'member',
            why:
              cause.serverMessage ??
              'Only a workspace owner or admin can see or manage this workspace’s invitations.',
          });
          return;
        }
        setAdminGate({
          kind: 'failed',
          why: cause instanceof Error ? cause.message : String(cause),
        });
      },
    );
  }, [invitesAdmin, workspaceId]);

  useEffect(loadPending, [loadPending]);

  /**
   * Withdrawing an invitation, and it READS THE ANSWER.
   *
   * This is the one write on this page that could most easily have swallowed a
   * refusal, and it is the one where swallowing it is worst. `invite.revoked`
   * is in `ADMIN_ONLY_TYPES`, so a member's revoke IS refused — and a `.then()`
   * that reloaded unconditionally would re-fetch the list, redraw the same row,
   * and say nothing. The invitation would still be live and the admin would
   * have been shown a screen indistinguishable from success: absence rendered
   * as fact, on the surface whose whole subject is who may do what.
   *
   * `user === null` is refused HERE and not sent, for the same honesty and a
   * different reason: `actorId: ''` would be turned away by the door's
   * actor-identity check — the first thing `checkRolePermission` asks — and the
   * refusal would be about this code rather than about the admin's act. The
   * rejection arm exists so a transport failure is a sentence rather than an
   * unhandled promise.
   */
  const revoke = (inviteId: string): void => {
    setRevokeRefusal(null);
    if (user === null) {
      setRevokeRefusal('You are not signed in, so this withdrawal was not sent.');
      return;
    }
    const make = makeSubmittedFactory({ actorId: user.id, origin: 'web' });
    void dataSource
      .ingest([
        make({
          workspaceId,
          entity: { kind: 'invite', id: inviteId },
          type: 'invite.revoked',
          // The entity id restated, because `parse-event.ts` refuses the two
          // disagreeing — three events about one invitation must land on one
          // stream or a revoke and an accept each start their own history.
          payload: { inviteId },
        }),
      ])
      .then(
        (results) => {
          const [result] = results;
          if (result === undefined) {
            setRevokeRefusal('The server returned no answer for this withdrawal.');
            return;
          }
          if (result.status === 'committed') {
            loadPending();
            return;
          }
          // The authority's own words, exactly as the mint, the founding form
          // and the visibility editor carry them.
          setRevokeRefusal(
            result.status === 'refused'
              ? `${result.rule}: ${result.reason}`
              : `${result.code}: ${result.message}`,
          );
        },
        (cause: unknown) => {
          setRevokeRefusal(cause instanceof Error ? cause.message : String(cause));
        },
      );
  };

  /**
   * Changing somebody's workspace role, through the ORDINARY ingest door.
   *
   * `membership.granted` is a registered domain event and `POST /events` is the
   * generic client batch every other claim on this shell goes through — the
   * same door the withdraw above uses. **No new server route was added for
   * this** and none is needed; what made the control impossible until
   * 2026-09-18 was not a missing door but a missing GUARD (an admin could
   * already submit a role change, and could demote the sole owner with it), and
   * the guard now lives in the engine and the permission gate where every other
   * client is subject to it too.
   *
   * The entity id is `membershipId(workspaceId, userId)` — the key the
   * projection upserts on and the id the guard reads the target's CURRENT role
   * through. The payload restates the `userId`, exactly as the withdraw above
   * restates its `inviteId`, because `parse-event.ts` refuses the entity and the
   * payload disagreeing.
   *
   * A committed change re-reads the roster rather than setting local state: the
   * cell renders what the server holds, so an optimistic update would put a role
   * on screen that nothing has confirmed. And a REFUSAL is said out loud for
   * the reason 3.138 gives about the withdrawal — the guard behind this write can
   * genuinely say no (`last-owner`, `grant-owner-requires-owner`), and a
   * swallowed answer would show the person their own intent as a fact.
   */
  const changeRole = (member: RosterMember, role: string): void => {
    setRoleRefusal(null);
    if (user === null) {
      setRoleRefusal('You are not signed in, so this change was not sent.');
      return;
    }
    const make = makeSubmittedFactory({ actorId: user.id, origin: 'web' });
    void dataSource
      .ingest([
        make({
          workspaceId,
          entity: { kind: 'membership', id: membershipId(workspaceId, member.id) },
          type: 'membership.granted',
          payload: { userId: member.id, role },
        }),
      ])
      .then(
        (results) => {
          const [result] = results;
          if (result === undefined) {
            setRoleRefusal('The server returned no answer for this change.');
            return;
          }
          if (result.status === 'committed') {
            loadMembers();
            return;
          }
          setRoleRefusal(
            result.status === 'refused'
              ? `${result.rule}: ${result.reason}`
              : `${result.code}: ${result.message}`,
          );
        },
        (cause: unknown) => {
          setRoleRefusal(cause instanceof Error ? cause.message : String(cause));
        },
      );
  };

  return (
    <main className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      <div className="gn-members__head">
        <h1 className="gn-page-title">Members</h1>
        {/* No summary until the roster has answered: a count drawn over a
            read that has not returned is a number nobody counted. */}
        {members !== null && members.length > 0 ? (
          <p className="gn-members__summary">{memberSummary(members, workspaceName)}</p>
        ) : null}
      </div>

      {membersError !== null ? (
        <ShellRefusal what="The roster" message={membersError} />
      ) : members === null ? (
        <p className="gn-members__loading">Loading…</p>
      ) : members.length === 0 ? (
        /*
         * THE EMPTY ROSTER IS TWO READINGS WEARING ONE SHAPE, and this says the
         * one that is true of both instead of picking.
         *
         * `online-data-source.ts` answers `[]` BOTH for a body whose `members`
         * array is empty and for the 404 this route sends a guest
         * (`door(..., 'no-guests')`). A workspace always has an owner, so a
         * genuinely empty roster is not something a real workspace produces —
         * which means `[]` here is, in practice, "you may not read this
         * roster". "Nobody is in this workspace" would be a confident statement
         * about the world drawn from an absence, on the screen whose whole
         * subject is who is here; "no members are listed" is true either way.
         */
        <p className="gn-members__empty">No members are listed here.</p>
      ) : (
        /* The table is the prototype's (`desktop.dc.html@6d7b67c0a52c:658-698`):
           a card holding a Person column and a Role column, no more — the
           prototype's three other columns have no wire field behind them (see
           the file docblock). `overflow: auto` on the card is what carries the
           table's `min-width` on a phone, exactly as the prototype's own
           container does. */
        <div className="gn-members">
          <table className="gn-members__table">
            <thead>
              <tr>
                <th scope="col" className="gn-members__th gn-members__th--person">
                  Person
                </th>
                <th scope="col" className="gn-members__th">
                  Role
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="gn-members__row">
                  <td className="gn-members__cell">
                    <span className="gn-members__person">
                      {/* `aria-hidden` because the monogram repeats the first
                          letter of the name beside it: without it the cell's
                          accessible name reads "A Anselma Marak". */}
                      <span className="gn-members__initial" aria-hidden="true">
                        {initialOf(member.name)}
                      </span>
                      <span className="gn-members__name">{member.name}</span>
                    </span>
                  </td>
                  <td className="gn-members__cell">
                    {/* THE TWO ARMS, and the predicate between them is where
                        this diverges from the prototype — see the case below
                        and the file docblock's role-control section.

                        The prototype gates its `<select>` on the VIEWER alone
                        (`:3061`, `canEditRole: myRoleIsAdmin`) and offers
                        `Owner` in the options, so its owner rows are editable
                        like any other. This product removed `Owner` from the
                        options, and the two halves do not compose: a `Select`
                        whose `value` matches no option renders its PLACEHOLDER
                        (`packages/ui/src/select/select.tsx:255`, `selected ?
                        selected.label : placeholder`), so an owner's cell would
                        read `Select…` — a cell that does not say what that
                        person's role is, on the screen whose whole subject is
                        who holds what. A control that cannot state the value it
                        would change is the same failure as a control that
                        cannot be honoured, one step quieter.

                        The viewer half is the page's existing gate and not a
                        second role read: `adminGate.kind === 'admin'` is the
                        server's own answer to "may you manage this workspace's
                        people", asked of `GET .../invites`, which 403s for
                        exactly the population the ingest door refuses. The two
                        are the same question, so a second client-side answer
                        could only drift from it — and on this branch the
                        caller's own role is unreadable anyway.

                        The chip arm wears the SHARED `.gn-chip` — the product's
                        port of this very element, whose `--chipBg`/`--chipShadow`
                        roles are the ones the mapping table names. The `Chip`
                        component is not used because it always renders a
                        `.gn-chip__dot`, and this chip has no dot; see
                        `.gn-members__role` in `globals.css` for the one
                        declaration the shared rule does not already carry. */}
                    {adminGate.kind === 'admin' && isEditableRole(member.role) ? (
                      <Select
                        options={EDITABLE_ROLE_OPTIONS}
                        value={member.role}
                        onChange={(next) => changeRole(member, next)}
                        aria-label={`Role for ${member.name}`}
                      />
                    ) : (
                      <span className="gn-chip gn-members__role">{member.role}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* A refused role change, in the authority's own words — the rule and the
          engine's reason, exactly as the withdrawal below carries them. It sits
          under the roster and not in the invitations block, because that is
          where the action was taken; the guard behind this write can genuinely
          refuse (`last-owner`, `grant-owner-requires-owner`), and a screen that
          said nothing would leave the person reading their own click as fact. */}
      {roleRefusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {roleRefusal}
        </p>
      ) : null}

      {adminGate.kind === 'asking' ? (
        <p>Checking whether you can invite people…</p>
      ) : adminGate.kind === 'failed' ? (
        <ShellRefusal what="The invitations for this workspace" message={adminGate.why} />
      ) : adminGate.kind === 'member' ? (
        // Not a silence. A member who saw the roster and nothing else would be
        // left to guess whether invitations exist, are broken, or are somebody
        // else's job.
        <p className="gn-members__not-admin">{adminGate.why}</p>
      ) : (
        <>
          <MintForm workspaceId={workspaceId} onMinted={loadPending} />
          <PendingList rows={pending ?? []} onRevoke={revoke} />
          {revokeRefusal !== null ? (
            <p role="alert" className="gn-refusal gn-refusal--server">
              {revokeRefusal}
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}

/**
 * The roles the roster's role control may SET — the invite form's own three
 * (`:669-671`), with the same omission and the same reason. `owner` is absent
 * because there is no ownership-transfer flow: the prototype offers it
 * (`:680-685`), `inviteSentPayload` refuses it, `check-permission.ts:389`
 * records that the invite path "refuses `owner`, and stops there", and Task 1's
 * `grant-owner-requires-owner` now refuses it on the ingest door too. Promoting
 * somebody to owner is a task of its own, not an option in a dropdown.
 *
 * The LABELS are the wire's own tokens and not prettified, which is the
 * judgement the roster's chip already carries and case 13.761 pins: the mint
 * form on this same page ships `admin / member / guest` (`:669-671`), and a
 * capitalised label here would be a display mapping that exists in exactly one
 * control and nowhere else in the product.
 */
const EDITABLE_ROLE_OPTIONS = [
  { value: 'admin', label: 'admin' },
  { value: 'member', label: 'member' },
  { value: 'guest', label: 'guest' },
];

/**
 * Whether the control can STATE this role, which is the narrower question the
 * cell actually asks — not whether the role exists.
 *
 * `owner` is the one role that answers no, and the reason is mechanical rather
 * than stylistic: `Select` renders `selected ? selected.label : placeholder`
 * (`packages/ui/src/select/select.tsx:255`), and with no option whose value is
 * `owner` there is no `selected`, so the cell would render `Select…` beside a
 * person who is in fact the workspace's owner. A `string` test rather than a
 * `WorkspaceRole` test because `RosterMember.role` is a plain `string` (see
 * that type's docblock) — a value this client does not recognise gets the chip
 * and prints itself, which is the honest arm for an unknown token.
 */
function isEditableRole(role: string): boolean {
  return EDITABLE_ROLE_OPTIONS.some((option) => option.value === role);
}

/**
 * The monogram the prototype draws at the head of the Person cell
 * (`desktop.dc.html@6d7b67c0a52c:674`). Its own `m.k` is a person KEY; this
 * product has a NAME, which is the better source for a first letter and the
 * only one the wire carries. `toUpperCase` for the same reason the prototype's
 * keys are capitalised — a lowercase "a" beside "Anselma Marak" reads as a
 * rendering fault rather than as a monogram.
 */
function initialOf(name: string): string {
  // `slice(0, 1)` is measured WRONG here, not merely unfashionable: it splits a
  // surrogate pair. On Node v22.22.2, `'🐧 Penguin Team'.slice(0, 1)` returns a
  // lone high surrogate, which renders as U+FFFD — a replacement glyph in the
  // disc beside a real person's name. `Array.from` iterates by CODE POINT, so an
  // emoji or any astral-plane character yields the whole character.
  //
  // `trimStart` for the same class of measured fault: a name typed with leading
  // whitespace (`'  Kiro'`) took the space as its initial and rendered a BLANK
  // disc. The monogram renders a name, and leading whitespace is not part of one.
  return Array.from(name.trimStart())[0]?.toUpperCase() ?? '';
}

/**
 * The line under the heading, DERIVED and never invented.
 *
 * The prototype's own data (`desktop.dc.html@6d7b67c0a52c:3032`) is
 * `` `${n} people in ${ws.name} · one owner, ${adminN} admins. Membership and
 * roles are per workspace.` `` Two of its three pieces are claims this client
 * can only make with a qualification, and each is qualified rather than copied:
 *
 * - **"one owner" is COUNTED, not asserted.** The roster carries every visible
 *   person's `role` (case 13.760), so the owner count is a fact this viewer was
 *   served. The prototype's literal would be a guess standing on the screen
 *   whose whole subject is who holds what.
 * - **"N people" is VIEWER-SCOPED, because the roster is.** `readMembers` hides
 *   guests from a non-admin caller (`read/membership-roster.ts`'s
 *   `ROSTER_VISIBLE_CLAUSE`), so this number is the people *this* viewer may be
 *   told about, not the workspace's membership. "You can see" is the whole
 *   difference between a count and a claim about the world, and dropping it
 *   would hand a member a smaller number dressed as the true one.
 * - **The workspace name is OPTIONAL and is OMITTED, never faked.** It comes
 *   from `getMyWorkspaces`, which refuses whole (`mapWorkspaceRefs` throws a
 *   `ServingGapError`), and `useWorkspaceName` answers `null` rather than the
 *   raw id or a stale guess. With no name the sentence is shorter and still
 *   true; the prototype's own clause order is kept so the two readings sit in
 *   the same place.
 *
 * Nothing else about the line is conditionally rendered: "Membership and roles
 * are per workspace." is the prototype's and is true of every workspace.
 */
function memberSummary(members: readonly RosterMember[], workspaceName: string | null): string {
  const people = members.length;
  const owners = members.filter((member) => member.role === 'owner').length;
  const admins = members.filter((member) => member.role === 'admin').length;
  const counted = `You can see ${people} ${people === 1 ? 'person' : 'people'}${
    workspaceName === null ? '' : ` in ${workspaceName}`
  }`;
  return `${counted} · ${owners} ${owners === 1 ? 'owner' : 'owners'}, ${admins} ${
    admins === 1 ? 'admin' : 'admins'
  }. Membership and roles are per workspace.`;
}

/**
 * The mint form. Its shape is the DOOR's body schema
 * (`routes/invites.ts:285`): `address`, `channel`, `role` required,
 * `projectIds` optional, `additionalProperties: false`.
 *
 * Two refusals are honoured by the form rather than spent at the door:
 *
 * - **`owner` is not in the role picker.** `inviteSentPayload` refuses it, and
 *   offering a choice the door will reject is a form that lies about what it
 *   can do.
 * - **The project field is hidden on `guest`.** The same schema refuses
 *   `projectIds` on a guest invitation — "a guest reaches work through
 *   `visibility.set` explicit lists, so a project association would promise
 *   something membership no longer means" — and the key is OMITTED, never sent
 *   as `[]`, because an empty array the admin never asked for is refused as if
 *   they had.
 *
 * Everything else the door refuses reaches the screen in the door's own words,
 * unparaphrased, out of the 422's `IngestResult`.
 */
function MintForm({ workspaceId, onMinted }: { workspaceId: string; onMinted: () => void }) {
  const { invitesAdmin } = useAppServices();
  const [address, setAddress] = useState('');
  const [channel, setChannel] = useState('email');
  const [role, setRole] = useState('member');
  const [projectIds, setProjectIds] = useState('');
  const [minted, setMinted] = useState<MintedInvite | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setRefusal(null);
    const named = projectIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== '');
    void invitesAdmin
      .mintInvite(workspaceId, {
        address,
        channel,
        role,
        ...(role === 'guest' || named.length === 0 ? {} : { projectIds: named }),
      })
      .then(
        (result) => {
          setMinted(result);
          onMinted();
        },
        (cause: unknown) => {
          setMinted(null);
          setRefusal(
            cause instanceof InviteAdminError && cause.serverMessage !== null
              ? cause.serverMessage
              : 'The invitation could not be sent, and the server did not say why.',
          );
        },
      );
  };

  return (
    <form className="gn-invite-mint" onSubmit={submit}>
      <h2 className="gn-invite-mint__heading">Invite somebody</h2>

      <label htmlFor="gn-invite-address">Address</label>
      <input
        id="gn-invite-address"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
      />

      <span>Channel</span>
      <Select
        options={[
          { value: 'email', label: 'email' },
          { value: 'sms', label: 'sms' },
          { value: 'whatsapp', label: 'whatsapp' },
        ]}
        value={channel}
        onChange={setChannel}
        aria-label="Channel"
      />

      <span>Role</span>
      {/* No `owner`. The door refuses it and a picker offering it would lie. */}
      <Select
        options={[
          { value: 'admin', label: 'admin' },
          { value: 'member', label: 'member' },
          { value: 'guest', label: 'guest' },
        ]}
        value={role}
        onChange={setRole}
        aria-label="Role"
      />

      {role === 'guest' ? null : (
        <>
          <label htmlFor="gn-invite-projects">Projects (comma-separated ids, optional)</label>
          <input
            id="gn-invite-projects"
            value={projectIds}
            onChange={(event) => setProjectIds(event.target.value)}
          />
        </>
      )}

      <Button variant="primary" type="submit">
        Send invitation
      </Button>

      {minted !== null ? (
        <Card className="gn-invite-mint__result">
          <p className="gn-invite-mint__once">{COPY_IT_NOW}</p>
          <code className="gn-invite-mint__url">{minted.url}</code>
          {/*
            Through `formatDateTime`, never raw. `expiresAt` is a UTC ISO instant
            off the wire, and printing it verbatim puts a second clock in front of
            an IST reader — the thing `src/ist-today.ts` and the ticket sheet's
            provenance lines both exist to prevent. One clock, named: '8 Sep
            2026, 15:30 IST'.
          */}
          <p className="gn-invite-mint__expiry">
            It stops working after {formatDateTime(minted.expiresAt)}.
          </p>
        </Card>
      ) : null}

      {refusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {refusal}
        </p>
      ) : null}
    </form>
  );
}

/**
 * The outstanding invitations, with the one thing an admin can do about each.
 *
 * `expiresAt: null` is the mint-crash residue the server's LEFT JOIN
 * deliberately keeps listable: pending in the ledger, no credential behind it.
 * It is dead, and it is named as dead, because an admin looking at a list with
 * a blank there would read it as "no expiry" — a link that never lapses rather
 * than one that never worked.
 */
function PendingList({
  rows,
  onRevoke,
}: {
  rows: PendingInvite[];
  onRevoke: (inviteId: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="gn-invite-pending__empty">No invitations are outstanding.</p>;
  }
  return (
    <ul className="gn-invite-pending">
      {rows.map((row) => (
        <li key={row.inviteId} className="gn-invite-pending__row">
          <span className="gn-invite-pending__address">{row.address}</span>
          <span className="gn-invite-pending__role">{row.role}</span>
          <span className="gn-invite-pending__expiry">
            {row.expiresAt === null
              ? 'No link behind this one — withdraw it and invite again.'
              : `Lapses ${formatDateTime(row.expiresAt)}`}
          </span>
          <Button onClick={() => onRevoke(row.inviteId)}>Withdraw</Button>
        </li>
      ))}
    </ul>
  );
}
