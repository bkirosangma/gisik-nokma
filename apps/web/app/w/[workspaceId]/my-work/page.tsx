'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AttentionStrip,
  MyWork,
  useAttention,
  useMyWork,
  type MyWorkView,
} from '@gisik-nokma/app-core';
import { AppNav } from '../../../../src/app-nav.js';
import { ShellRefusal } from '../../../../src/shell-refusal.js';
import { useAppServices } from '../../../../src/providers.js';
import {
  ExpiredSessionNotice,
  useSignInOnExpiredSession,
} from '../../../../src/expired-session.js';

export default function MyWorkPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const { dataSource, ticketLocation } = useAppServices();
  /**
   * V5 (round-2 ruling) — the fourth section's own answer, and it is a sentence
   * rather than silence.
   *
   * A contested claim's row carries no `projectId` (`ContestedClaim` has
   * `ticketId`, `title`, `rule`, `reason` and the claim's provenance), so the
   * resolver below cannot place it locally as it does the other three. The
   * locator asks the server — the same one-shot gateway the inbox uses — and when
   * even that cannot place it (a ticket this viewer may no longer see, answered
   * by the route's one frozen 404) the click SAYS SO. The defect was a click that
   * did nothing at all.
   */
  const [openNotice, setOpenNotice] = useState<string | null>(null);
  const attention = useAttention(dataSource, workspaceId);
  const myWork = useMyWork(dataSource, workspaceId);

  // A 401 on EITHER read is a session that ended, not a refusal to answer, and
  // this page used to say the opposite: `Features.md` and case 3.86 both claimed
  // the redirect for the whole shell while only `app/workspaces/page.tsx` did it,
  // so an expired session here drew "My Work cannot be shown yet — HTTP 401 for
  // /v1/me/work". That names the wrong cause and offers no way out of it.
  const expired = useSignInOnExpiredSession([attention.error, myWork.error]);

  /**
   * WHICH SECTIONS THE RESOLVER CAN PLACE WITHOUT ASKING THE SERVER (V5).
   *
   * `MyWorkView` has four members; three of them are `WorkItem[]` and carry a
   * `projectId`, and `contested` is `ContestedClaim[]` and does not. That is not
   * a resolver oversight — it is a fact about the row — so the fourth section is
   * answered by the locator instead, and this pair of declarations is what makes
   * a FIFTH section impossible to add silently: a new key on `MyWorkView` fails
   * the `Record` below to compile, and whoever added it has to say here how a
   * title button for it resolves. The comment that used to sit in this function
   * claimed "all four" were searched while three were.
   */
  const LOCALLY_RESOLVABLE = ['assigned', 'inTransit', 'shared'] as const;
  type NeedsLocator = Exclude<keyof MyWorkView, (typeof LOCALLY_RESOLVABLE)[number]>;
  const NEEDS_THE_LOCATOR: Record<NeedsLocator, 'asked of the server'> = {
    contested: 'asked of the server',
  };

  const openTicket = (ticketId: string) => {
    setOpenNotice(null);
    // My Work is cross-project; the sheet lives on the project page, so opening
    // one needs the ticket's `projectId` — which is why this resolves the id
    // against the view rather than pushing a path built from the id alone.
    //
    // **`shared` IS searched, and leaving it out was a dead click on the one
    // section that most needs the affordance.** A shared errand is typically NOT
    // assigned to the viewer — that is the whole reason the section exists — so
    // it is in neither `assigned` nor `inTransit`, `find` answered `undefined`,
    // the guard swallowed it and the button did nothing at all: no navigation,
    // no error, no way for the user to tell the difference from a slow page.
    //
    // ⚠ CORRECTED (V5, round-2 ruling, 2026-09-21): this paragraph used to end
    // *"Every section this component renders a title button for must be
    // resolvable here, and that is now all four."* **Three were searched.** The
    // fourth, `contested`, cannot be searched here at all — its rows carry no
    // `projectId` — and its click was the same dead click one section over.
    // `NEEDS_THE_LOCATOR` above is the honest version of that claim, with a
    // compile-time guard behind it.
    const sections = LOCALLY_RESOLVABLE.map((key) => myWork.data?.[key] ?? []);
    const item = sections.flat().find((candidate) => candidate.ticketId === ticketId);
    if (item !== undefined) {
      router.push(`/w/${workspaceId}/p/${item.projectId}?ticket=${ticketId}`);
      return;
    }
    // The `contested` arm — see `NEEDS_THE_LOCATOR` above. `locate` answers
    // `null` for BOTH "no such ticket" and "not yours", deliberately (the route
    // refuses to be an existence oracle), so the sentence below says what can be
    // said without guessing which of the two it was.
    void (async () => {
      const located = await ticketLocation.locate(workspaceId, ticketId);
      if (located === null) {
        setOpenNotice(
          'That ticket cannot be opened from here — the server will not place it for you, and this page will not guess whether it is gone or simply not yours.',
        );
        return;
      }
      router.push(`/w/${located.workspaceId}/p/${located.projectId}?ticket=${ticketId}`);
    })().catch((cause: unknown) => {
      setOpenNotice(
        `That ticket could not be opened — ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    });
  };

  return (
    <main id="gn-main" className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      <h1 className="gn-page-title">My Work</h1>
      <div className="gn-shell__main">
        {/* BOTH reads on this page refuse against the shipped server, and each
            has its own falsehood if the plan's rendering is kept:
            `items={attention.data ?? []}` makes `AttentionStrip` return null,
            which reads as "nothing needs your attention", and My Work's
            `data !== null ? … : <p>Loading…</p>` spins forever. */}
        {expired ? (
          // ONE notice for the page, not one per failed read: two "your session
          // has ended" panels would describe two events where there was one.
          <ExpiredSessionNotice />
        ) : (
          <>
            {/* V5: a click that could not be honoured says so, beside the
                section that raised it, rather than doing nothing. */}
            {openNotice !== null ? (
              <p role="alert" className="gn-shell__refusal">
                {openNotice}
              </p>
            ) : null}

            {attention.error !== null ? (
              <ShellRefusal what="What needs your attention" message={attention.error} />
            ) : attention.data !== null ? (
              <AttentionStrip items={attention.data} onOpenTicket={openTicket} />
            ) : null}

            {myWork.error !== null ? (
              <ShellRefusal what="My Work" message={myWork.error} />
            ) : myWork.data !== null ? (
              <MyWork view={myWork.data} onOpenTicket={openTicket} />
            ) : (
              <p>Loading…</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
