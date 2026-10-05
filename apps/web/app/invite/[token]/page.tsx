'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Card } from '@gisik-nokma/ui';
// Imported rather than the literal re-spelled — `packages/domain/` owns the zone,
// the same reason `/workspaces` imports it for its own `lapses …` line.
import { formatDay } from '@gisik-nokma/app-core';
import { InviteAcceptanceError, type InviteSummary } from '@gisik-nokma/app-core/online';
import { istToday } from '../../../src/ist-today.js';
import { useAppServices, useSessionStatus } from '../../../src/providers.js';
import { bumpProjectsVersion } from '../../../src/projects-version.js';
import { InviteCheckSkeleton } from '../../../src/skeletons/screen-skeletons.js';

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
/**
 * A day, in the workspace's own zone — the SAME shape `/workspaces` uses for a
 * waiting invitation's `lapses …` (`workspaces/page.tsx:352`), rather than a
 * second date vocabulary on a second page. `an unknown date` for an unparseable
 * instant rather than `Invalid Date`, which is not a day anybody set.
 */
function onDay(iso: string): string {
  if (Number.isNaN(new Date(iso).getTime())) return 'on an unknown date';
  return formatDay(iso, istToday());
}

export default function InvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { invites } = useAppServices();
  const session = useSessionStatus();

  const [invite, setInvite] = useState<InviteSummary | null | 'loading' | 'unreachable'>('loading');
  const [refusal, setRefusal] = useState<string | null>(null);
  /** Bumped by "Try again" — the effect below is keyed on it (V9). */
  const [attempt, setAttempt] = useState(0);
  /** The accept is in flight: Join is a busy button and a second click sends nothing (smoothness T8, case 25.148). */
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let live = true;
    setInvite('loading');
    invites.getInvite(token).then(
      (summary) => {
        if (live) setInvite(summary);
      },
      () => {
        // **A transport failure is NOT a dead link, and this used to say it was**
        // (V9, 2026-09-21). The arm set `invite = null` for ANY rejection, so a
        // dropped connection, a 500 or an unparseable body all rendered the
        // dead-link sentence — which sends the person to ask for a replacement
        // for a link that was never tried, retiring a link that may be perfectly
        // good. `null` is kept for the ANSWERED 404 (the transport's read
        // affordance, and the server's one frozen body for used/withdrawn/lapsed,
        // which really does mean the link opens nothing); everything else is this
        // fourth state, whose only honest sentence is that the link could not be
        // CHECKED, plus the retry that a transport failure may clear.
        if (live) setInvite('unreachable');
      },
    );
    return () => {
      live = false;
    };
  }, [invites, token, attempt]);

  const accept = (): void => {
    if (joining) return;
    setJoining(true);
    void invites.acceptInvite(token).then(
      () => {
        // The workspace JOINED the person's list: the shared read behind the nav asks again before the push (25.049).
        bumpProjectsVersion();
        // My work is global (my-work-global T4): the joined workspace is one of the ones it now covers.
        router.push('/my-work');
      },
      (cause: unknown) => {
        setJoining(false);
        setRefusal(
          cause instanceof InviteAcceptanceError && cause.serverMessage !== null
            ? cause.serverMessage
            : 'This invitation could not be accepted, and the server did not say why. Ask whoever invited you for a fresh link.',
        );
      },
    );
  };

  return (
    <main id="gn-main" className="gn-shell">
      {/* A dead link's ONE h1 is its own headline (UX fixes T10, ENT-04), so the product name steps down to a
          paragraph in that arm rather than leaving two h1s on the page. */}
      {invite === null ? (
        <p className="gn-page-title">Gisik Nokma</p>
      ) : (
        <h1 className="gn-page-title">Gisik Nokma</h1>
      )}
      <Card className="gn-invite">
        {invite === 'loading' ? (
          <InviteCheckSkeleton label="Checking the invitation" />
        ) : invite === 'unreachable' ? (
          <>
            {/*
              NOT the dead-link sentence, and the difference is the whole of V9.
              That sentence tells the person to ask for a new invitation — advice
              that RETIRES the one they hold — on the strength of a read that
              never came back. So this says what actually happened, and says the
              one thing a person in this state most needs to know: nothing has
              been used up by trying.
            */}
            <p className="gn-invite__unreachable" data-testid="invite-unreachable" role="status">
              This invitation could not be checked. The server did not answer. Nothing has been
              used up, so the link may still be good.
            </p>
            <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </>
        ) : invite === null ? (
          <>
            <h1 className="gn-invite__dead-title">This invitation can&rsquo;t be used</h1>
            <p className="gn-invite__dead">
              This invitation link does not open anything. It may have been used, withdrawn, or
              lapsed. Ask whoever invited you for a new one.
            </p>
            {/* THE ONE PRIMARY (ENT-04): a dead end needs a way on, and the way on for a person with no live
                link is the sign-in page. The workspaces link below is the quiet second door. */}
            <Link className="gn-button gn-button--primary" href="/sign-in">
              Go to sign in
            </Link>
            {/*
              AND IT OFFERS SOMEWHERE TO GO (E5-18, 2026-09-21). The arm was one
              `<p>` in a Card with no link at all: a person who followed a dead
              link, possibly while signed out, was given a sentence and no next
              step. `/workspaces` is where their own waiting invitations live —
              including the one this link was for, if they signed in under the
              address it was sent to — so it is the honest destination rather than
              a generic home link.
            */}
            {session.kind === 'signed-in' ? (
              <p>
                <Link href="/workspaces">See your workspaces</Link>
                {' '}— any invitation waiting for you is there.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p>
              You are invited to join <strong>{invite.workspaceName}</strong> as {invite.role}.
            </p>
            {/*
              WHEN THIS LINK STOPS WORKING (E5-18, 2026-09-21). The door has served
              this since 2026-09-19 — it is the presented TOKEN's own window — and
              the client dropped it for two days, so a person deciding whether to
              act now could not see the deadline. `/workspaces` renders the same
              fact for a waiting invitation (`Invited … · lapses …`), and this is
              the same sentence shape rather than a second vocabulary.
              `null` draws NOTHING: the shipped door always sends one, and a day
              this page made up would be a deadline nobody set.
            */}
            {invite.expiresAt === null ? null : (
              <p className="gn-invite__expiry" data-testid="invite-expiry">
                {`This link lapses ${onDay(invite.expiresAt)}.`}
              </p>
            )}
            {session.kind === 'loading' || session.kind === 'error' ? (
              <InviteCheckSkeleton label="Checking whether you are signed in" action />
            ) : session.kind === 'signed-out' ? (
              <p>
                <Link href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}>
                  Sign in to accept
                </Link>
                {'. '}Any of the four sign-in methods works; you land back here.
              </p>
            ) : (
              <Button variant="primary" onClick={accept} busy={joining} busyLabel="Joining…">
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
