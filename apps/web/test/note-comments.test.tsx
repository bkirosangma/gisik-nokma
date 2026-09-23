import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, NoteComment, SubmittedEvent } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 18.213–18.215 — comments on a note (Plan 5 of 6, spec §9.2, D19).
 *
 * `TicketEditorSlot` stays stubbed for the whole file: these three cases are
 * about `NoteComments`' OWN wiring — which entity a post is filed against,
 * whether the thread reloads, who may post — not about the composer's own
 * behaviour, which `packages/editor` already proves.
 */
let capturedSlotProps: Array<Record<string, unknown>> = [];
vi.mock('@gisik-nokma/editor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gisik-nokma/editor')>();
  return {
    ...actual,
    TicketEditorSlot: function CapturingSlot(props: Record<string, unknown>) {
      capturedSlotProps.push(props);
      return null;
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/notes',
  useSearchParams: () => new URLSearchParams(),
}));

let mockSessionUser: { id: string; name: string; email?: string } = {
  id: 'u_ana',
  name: 'Anselma Marak',
  email: 'ana@example.com',
};
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: mockSessionUser } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { NoteComments } from '../src/notes/note-comments.js';

const WS = '01J9WSLOGISTICS000000000000';
const NOTE = '01J9NOTECOLDROOM000000000000';

const NAMES: Record<string, string> = { u_kiro: 'Kiro', u_ana: 'Anselma Marak' };
const nameOf = (id: string): string => NAMES[id] ?? id;

function comment(over: Partial<NoteComment> & { commentId: string }): NoteComment {
  return {
    authorId: 'u_kiro',
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a comment' }] }] },
    recordedAt: '2026-09-23T08:00:00.000Z',
    ...over,
  };
}

function committedIngest(ingested: SubmittedEvent[]): (events: SubmittedEvent[]) => Promise<IngestResult[]> {
  return async (events) => {
    ingested.push(...events);
    return events.map((event) => ({
      status: 'committed' as const,
      eventId: event.id,
      seq: 1,
      serverTime: '2026-09-23T09:00:00.000Z',
    }));
  };
}

function slotProps(): Record<string, unknown> {
  const last = capturedSlotProps[capturedSlotProps.length - 1];
  if (last === undefined) throw new Error('the slot was never rendered');
  return last;
}

beforeEach(() => {
  cleanup();
  capturedSlotProps = [];
  mockSessionUser = { id: 'u_ana', name: 'Anselma Marak', email: 'ana@example.com' };
});

describe('18.213-18.215 NoteComments', () => {
  /**
   * 18.213 — the thread renders with the NAMES this component was handed,
   * and an empty thread is the kit's own copy, not something invented here.
   *
   * Mutation: drop `nameOf` — pass an identity function instead of the prop,
   * so the rendered names are raw ids rather than "Kiro"/"Anselma Marak".
   */
  it('18.213 renders comments with author names from the passed nameOf; control: none renders the thread’s own empty copy', async () => {
    const services = stubServices({
      getNoteComments: async () => [
        comment({ commentId: 'c1', authorId: 'u_kiro' }),
        comment({ commentId: 'c2', authorId: 'u_ana' }),
      ],
    });
    render(
      <Providers services={services}>
        <NoteComments workspaceId={WS} noteId={NOTE} nameOf={nameOf} canComment />
      </Providers>,
    );
    expect(await screen.findByText('Kiro')).toBeInTheDocument();
    expect(screen.getByText('Anselma Marak')).toBeInTheDocument();

    // CONTROL — no comments: the THREAD's own "No comments yet.", never
    // wrapped or replaced by this component.
    cleanup();
    render(
      <Providers services={stubServices({ getNoteComments: async () => [] })}>
        <NoteComments workspaceId={WS} noteId={NOTE} nameOf={nameOf} canComment />
      </Providers>,
    );
    expect(await screen.findByText('No comments yet.')).toBeInTheDocument();
  });

  /**
   * 18.214 — the write, and the reload.
   *
   * Mutation: file it against a ticket — `entity: { kind: 'ticket', id }`
   * instead of `{ kind: 'note', id }`.
   */
  it('18.214 posting writes one comment.added against { kind: note, id }, and the thread reloads on commit', async () => {
    const getNoteComments = vi.fn(async () => [] as NoteComment[]);
    const ingested: SubmittedEvent[] = [];
    const services = stubServices({ getNoteComments });
    services.dataSource.ingest = committedIngest(ingested);

    render(
      <Providers services={services}>
        <NoteComments workspaceId={WS} noteId={NOTE} nameOf={nameOf} canComment />
      </Providers>,
    );
    await waitFor(() => expect(capturedSlotProps.length).toBeGreaterThan(0));
    await waitFor(() => expect(getNoteComments).toHaveBeenCalledTimes(1));

    const submit = slotProps().submit as (submission: { type: string; payload: unknown }) => Promise<boolean>;
    let accepted = false;
    await act(async () => {
      accepted = await submit({ type: 'comment.added', payload: { body: {} } });
    });
    expect(accepted).toBe(true);
    expect(ingested).toHaveLength(1);
    expect(ingested[0]!.entity).toEqual({ kind: 'note', id: NOTE });
    expect(ingested[0]!.type).toBe('comment.added');

    // The thread reloads — a SECOND read follows the commit.
    await waitFor(() => expect(getNoteComments).toHaveBeenCalledTimes(2));
  });

  /**
   * 18.215 — a reader who is not the author still gets a working composer,
   * and `canComment=false` withholds it entirely.
   *
   * Mutation: hide it for non-authors — the composer would be absent (or the
   * post refused) for a session whose id is not the comment fixture's author.
   */
  it('18.215 a non-author reader can post; canComment=false offers no composer at all (control)', async () => {
    mockSessionUser = { id: 'u_ana', name: 'Anselma Marak', email: 'ana@example.com' };
    const ingested: SubmittedEvent[] = [];
    const services = stubServices({ getNoteComments: async () => [] });
    services.dataSource.ingest = committedIngest(ingested);

    render(
      <Providers services={services}>
        <NoteComments workspaceId={WS} noteId={NOTE} nameOf={nameOf} canComment />
      </Providers>,
    );
    await waitFor(() => expect(capturedSlotProps.length).toBeGreaterThan(0));
    const submit = slotProps().submit as (submission: { type: string; payload: unknown }) => Promise<boolean>;
    let accepted = false;
    await act(async () => {
      accepted = await submit({ type: 'comment.added', payload: { body: {} } });
    });
    expect(accepted).toBe(true);
    expect(ingested[0]!.actorId).toBe('u_ana');

    // CONTROL — `canComment=false`: no composer prop reaches the thread at all.
    cleanup();
    capturedSlotProps = [];
    render(
      <Providers services={stubServices({ getNoteComments: async () => [] })}>
        <NoteComments workspaceId={WS} noteId={NOTE} nameOf={nameOf} canComment={false} />
      </Providers>,
    );
    await screen.findByText('No comments yet.');
    expect(capturedSlotProps).toHaveLength(0);
  });

  /**
   * 18.273 / 18.274 — Plan 7 Task 4 (spec §14): the note page supplies the
   * SAME two ticket-ref callbacks to its editor (`note-document.test.tsx`)
   * and here, to its comment thread — `queryTickets`/`resolveTicketHref` to
   * the composer, `ticketHref` to `CommentsThread`. 18.274 rides on the same
   * mount: a real `ticketRef` in a seeded comment renders as a link to the
   * ticket's page — `CommentsThread` is NOT stubbed in this file, unlike the
   * composer, so this is the shipped renderer.
   */
  it('18.273/18.274 supplies queryTickets/resolveTicketHref to the composer and ticketHref to the thread; a ticketRef chip links to the ticket\'s page', async () => {
    const search = vi.fn(async (_workspaceId: string, _text: string) => [
      { ticketId: 't1', projectId: 'p1', title: 'Renew the trade licence', snippet: '', matchedIn: 'title' as const, key: 'CCSO-1183' },
    ]);
    const services = stubServices({
      getNoteComments: async () => [
        comment({
          commentId: 'c1',
          body: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'see ' },
                  {
                    type: 'ticketRef',
                    attrs: { ticketId: 't1', projectId: 'p1', key: 'CCSO-1183', title: 'Renew the trade licence' },
                  },
                ],
              },
            ],
          },
        }),
      ],
      search,
    });

    render(
      <Providers services={services}>
        <NoteComments workspaceId={WS} noteId={NOTE} nameOf={nameOf} canComment />
      </Providers>,
    );

    // 18.274 — the rendered chip.
    const link = await screen.findByRole('link', { name: 'CCSO-1183 Renew the trade licence' });
    expect(link).toHaveAttribute('href', `/w/${WS}/p/p1?ticket=t1`);

    // 18.273 — the composer's own two callbacks.
    await waitFor(() => expect(capturedSlotProps.length).toBeGreaterThan(0));
    const queryTickets = slotProps().queryTickets as (
      q: string,
    ) => Promise<Array<{ ticketId: string; projectId: string; key: string; title: string }>>;
    const resolveTicketHref = slotProps().resolveTicketHref as (ref: {
      ticketId: string;
      projectId: string;
    }) => string | null;
    const hits = await queryTickets('licence');
    expect(search).toHaveBeenCalledWith(WS, 'licence');
    expect(hits).toEqual([{ ticketId: 't1', projectId: 'p1', key: 'CCSO-1183', title: 'Renew the trade licence' }]);
    expect(resolveTicketHref({ ticketId: 't1', projectId: 'p1' })).toBe(`/w/${WS}/p/p1?ticket=t1`);
  });
});
