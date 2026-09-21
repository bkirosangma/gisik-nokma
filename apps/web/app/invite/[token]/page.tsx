'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Card } from '@gisik-nokma/ui';
import { InviteAcceptanceError, type InviteSummary } from '@gisik-nokma/app-core/online';
import { useAppServices, useSessionStatus } from '../../../src/providers.js';

/**
 * `/invite/[token]` — where a link somebody was sent turns into a membership.
 *
 * ## This URL is the SERVER's, not this file's
 *
 * `POST /v1/workspaces/:id/invites` builds the link it hands the admin as
 * `${WEB_ORIGIN}/invite/${token}` (`apps/server/src/routes/invites.ts:361`), and
 * `.env.example` sets `WEB_ORIGIN=http://localhost:3001`, which is this app.
 * So the route segment below is one half of a contract the server already
 * shipped: renaming it breaks every link already minted, and no test in this
 * app would notice.
 *
 * ## Signed out is a NORMAL arrival, and the third branch is why
 *
 * `GET /v1/invites/:token` deliberately requires no session — the token IS the
 * credential, and demanding an account before telling somebody which workspace
 * they are being asked to join gets the order backwards. So the summary loads
 * for a stranger, and only the JOIN needs a session.
 *
 * The plan's snippet branches `user === null ? <sign-in link> : <join button>`.
 * That is a false statement for the whole of the session request: `useCurrentUser`
 * answers `null` while the session is in flight, so a signed-in person is shown
 * "Sign in to accept" and clicking it sends them through an authentication they
 * already completed. `useSessionStatus` splits loading from signed-out, and the
 * three branches below are that split.
 *
 * ## What a dead link says, and why it is this page's sentence
 *
 * A used, withdrawn, lapsed or never-real link all arrive as ONE 404 with one
 * frozen body, deliberately, so a holder learns nothing about which — and the
 * transport's read affordance turns that 404 into `null`, discarding the body.
 * The sentence below is therefore this page's own, and it is written to say the
 * same three things the server's does (used, withdrawn, lapsed) rather than the
 * narrower "expired" a reader would guess. The ACCEPT failure is different: it
 * is a POST, the body survives, and `InviteAcceptanceError.serverMessage`
 * carries the door's own words to the screen unparaphrased.
 */
export default function InvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { invites } = useAppServices();
  const session = useSessionStatus();

  const [invite, setInvite] = useState<InviteSummary | null | 'loading'>('loading');
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    invites.getInvite(token).then(
      (summary) => {
        if (live) setInvite(summary);
      },
      () => {
        // A transport failure is not the same as a dead link, but the only
        // thing this page can honestly do with either is stop claiming there
        // is a workspace to join.
        if (live) setInvite(null);
      },
    );
    return () => {
      live = false;
    };
  }, [invites, token]);

  const accept = (): void =>
    void invites.acceptInvite(token).then(
      ({ workspaceId }) => router.push(`/w/${workspaceId}/my-work`),
      (cause: unknown) => {
        setRefusal(
          cause instanceof InviteAcceptanceError && cause.serverMessage !== null
            ? cause.serverMessage
            : 'This invitation could not be accepted, and the server did not say why. Ask whoever invited you for a fresh link.',
        );
      },
    );

  return (
    <main id="gn-main" className="gn-shell">
      <h1 className="gn-page-title">Gisik Nokma</h1>
      <Card className="gn-invite">
        {invite === 'loading' ? (
          <p>Checking the invitation…</p>
        ) : invite === null ? (
          <p className="gn-invite__dead">
            This invitation link does not open anything. It may have been used, withdrawn, or
            lapsed — ask whoever invited you for a new one.
          </p>
        ) : (
          <>
            <p>
              You are invited to join <strong>{invite.workspaceName}</strong> as {invite.role}.
            </p>
            {session.kind === 'loading' ? (
              <p role="status">Checking whether you are signed in…</p>
            ) : session.kind === 'signed-out' ? (
              <p>
                <Link href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}>
                  Sign in to accept
                </Link>{' '}
                — any of the four sign-in methods works; you land back here.
              </p>
            ) : (
              <Button variant="primary" onClick={accept}>
                Join {invite.workspaceName}
              </Button>
            )}
            {refusal !== null ? (
              <p role="alert" className="gn-refusal gn-refusal--server">
                {refusal}
              </p>
            ) : null}
          </>
        )}
      </Card>
    </main>
  );
}
