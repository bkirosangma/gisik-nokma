'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card } from '@gisik-nokma/ui';
import { FoundingError } from '@gisik-nokma/app-core/online';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { AppNav } from '../../src/app-nav.js';
import { ShellRefusal } from '../../src/shell-refusal.js';
import { useAppServices, useCurrentUser } from '../../src/providers.js';
import { ExpiredSessionNotice, useSignInOnExpiredSession } from '../../src/expired-session.js';

export default function WorkspacesPage() {
  const { dataSource } = useAppServices();
  const user = useCurrentUser();
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    dataSource.query.getMyWorkspaces().then(setWorkspaces, (cause: unknown) => {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    });
  }, [dataSource]);

  // A 401 is not a refusal to answer, it is “we do not know who you are” — and the
  // one place that has an answer is the sign-in page. The rule USED TO LIVE HERE,
  // inline and spelled `message.includes('401')`, and it lived here ALONE: the
  // other two data-reading pages rendered a refusal panel for an expired session
  // instead. It is now one exported function all three call, so the claim
  // `Features.md` makes about this shell is made by one piece of code.
  const expired = useSignInOnExpiredSession([failure]);
  // The failure is recorded either way and suppressed here rather than never
  // stored: a page that only stored what it was willing to show could not tell
  // “no failure” from “a failure I decided not to mention”.
  const error = expired ? null : failure;

  return (
    <main className="gn-shell">
      <AppNav />
      <h1 className="gn-page-title">Workspaces{user !== null ? ` — ${user.name}` : ''}</h1>
      {/* Error before data, everywhere in this shell. `getMyWorkspaces` is one
          of the refusing reads (four of them since ruling P25 clause 1; this is
          still one), so `workspaces === null` is its NORMAL
          resting state against the shipped server and a bare "Loading…" here
          would be a spinner that never stops. */}
      {expired ? (
        <ExpiredSessionNotice />
      ) : error !== null ? (
        <ShellRefusal what="Your workspaces" message={error} />
      ) : workspaces === null ? (
        <p>Loading…</p>
      ) : workspaces.length === 0 ? (
        // The second sentence this always needed (Plan 6 Task 15b, item 1). A
        // person with a session and no workspace used to be told only to wait
        // for somebody else, which was the last hole in the founding path.
        <p>No workspaces yet. Ask an admin for an invite link — or create your own.</p>
      ) : (
        <ul className="gn-workspace-list">
          {workspaces.map((workspace) => (
            <li key={workspace.id} data-testid={`workspace-card-${workspace.id}`}>
              <Card>
                <h2>{workspace.name}</h2>
                <ul>
                  {workspace.projects.map((project) => (
                    <li key={project.id} data-testid={`project-card-${project.id}`}>
                      <Link href={`/w/${workspace.id}/p/${project.id}`}>{project.name}</Link>
                    </li>
                  ))}
                </ul>
                <Link href={`/w/${workspace.id}/my-work`}>My Work</Link>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/*
        OUTSIDE the list's three branches, and deliberately so. `getMyWorkspaces`
        is one of the refusing reads — four of them since ruling P25
        clause 1, and this is still one — so `error` is its NORMAL resting state
        against the shipped server — and a founding form nested inside the
        `workspaces.length === 0` arm would be a form nobody could ever reach.
        A person who cannot be told which workspaces they are in can still found
        one, and that is exactly the person who most needs to.
      */}
      <FoundingForm />
    </main>
  );
}

/**
 * Founding a workspace — the client half of `POST /v1/workspaces`
 * (`apps/server/src/routes/workspaces.ts:74`, Plan 4 Task 13).
 *
 * The name is submitted AS TYPED. `FoundingGateway` does not trim it and
 * neither does this form: trimming would silently repair a claim the person
 * made, and it would make the door's own 400 unreachable for the one input it
 * exists to refuse — `minLength: 1` admits `'   '`, which names nothing while
 * looking like a name everywhere it is displayed.
 *
 * Both refusal shapes reach the screen in the DOOR's words: 400
 * `INVALID_NAME_BODY` for a whitespace name, and 422 carrying the ingest
 * layer's own `IngestResult`. `HttpError` carries the parsed body precisely so
 * that is possible; before it did, the most this could have shown was
 * `HTTP 422 for /v1/workspaces`.
 */
function FoundingForm() {
  const router = useRouter();
  const { founding } = useAppServices();
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setSending(true);
    setRefusal(null);
    void founding.foundWorkspace(name).then(
      ({ workspaceId }) => router.push(`/w/${workspaceId}/my-work`),
      (cause: unknown) => {
        setSending(false);
        setRefusal(
          cause instanceof FoundingError && cause.serverMessage !== null
            ? cause.serverMessage
            : 'The workspace could not be created, and the server did not say why.',
        );
      },
    );
  };

  return (
    <form className="gn-founding" onSubmit={submit}>
      <h2 className="gn-founding__heading">New workspace</h2>
      <label className="gn-founding__label" htmlFor="gn-founding-name">
        Name
      </label>
      <input
        id="gn-founding-name"
        className="gn-founding__name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Button variant="primary" type="submit" disabled={sending}>
        Create workspace
      </Button>
      {refusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {refusal}
        </p>
      ) : null}
    </form>
  );
}
