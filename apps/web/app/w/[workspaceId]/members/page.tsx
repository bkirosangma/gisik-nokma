'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Select } from '@gisik-nokma/ui';
import { formatDateTime, makeSubmittedFactory, type Actor } from '@gisik-nokma/app-core';
import { InviteAdminError, type MintedInvite, type PendingInvite } from '@gisik-nokma/app-core/online';
import { AppNav } from '../../../../src/app-nav.js';
import { ShellRefusal } from '../../../../src/shell-refusal.js';
import { useAppServices, useCurrentUser } from '../../../../src/providers.js';

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

  const [members, setMembers] = useState<Actor[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingInvite[] | null>(null);
  const [revokeRefusal, setRevokeRefusal] = useState<string | null>(null);
  const [adminGate, setAdminGate] = useState<
    { kind: 'asking' } | { kind: 'admin' } | { kind: 'member'; why: string } | { kind: 'failed'; why: string }
  >({ kind: 'asking' });

  useEffect(() => {
    dataSource.query.getMembers(workspaceId).then(setMembers, (cause: unknown) => {
      setMembersError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [dataSource, workspaceId]);

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

  return (
    <main className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      <h1 className="gn-page-title">People</h1>

      {membersError !== null ? (
        <ShellRefusal what="The roster" message={membersError} />
      ) : members === null ? (
        <p>Loading…</p>
      ) : (
        <ul className="gn-members">
          {members.map((member) => (
            <li key={member.id} className="gn-members__row">
              {member.name}
            </li>
          ))}
        </ul>
      )}

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
