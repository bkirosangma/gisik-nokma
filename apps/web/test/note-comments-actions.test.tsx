import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, NoteComment, SubmittedEvent } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 26.113–26.115 on a NOTE — the twin of the ticket sheet's cases. `TicketEditorSlot` is stubbed to capture the props
 * the in-place editor is handed (as `note-comments.test.tsx` does for the composer), so these cases read WHICH entity an
 * edit or a delete is filed against and WHO may see the controls, not the editor's own behaviour.
 */
let capturedSlotProps: Array<Record<string, unknown>> = [];
// The seam is the page's own editor slot (`../src/editor-slot.js`, the lazy wrapper, smoothness T10/T9 case 25.163), so a capture
// is synchronous with the render instead of waiting for the editor chunk's dynamic import.
vi.mock('../src/editor-slot.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/editor-slot.js')>();
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

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_ana', name: 'Anselma Marak', email: 'ana@example.com' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { NoteComments } from '../src/notes/note-comments.js';

const WS = '01J9WSLOGISTICS000000000000';
const NOTE = '01J9NOTECOLDROOM000000000000';
const NAMES: Record<string, string> = { u_kiro: 'Kiro', u_ana: 'Anselma Marak' };
const nameOf = (id: string): string => NAMES[id] ?? id;

const BODY = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a comment' }] }] };
const row = (over: Partial<NoteComment> & { commentId: string }): NoteComment => ({
  authorId: 'u_ana',
  body: BODY,
  recordedAt: '2026-10-02T08:00:00.000Z',
  editedAt: null,
  deletedAt: null,
  ...over,
});

function recording(ingested: SubmittedEvent[]): (events: SubmittedEvent[]) => Promise<IngestResult[]> {
  return async (events) => {
    ingested.push(...events);
    return events.map((event) => ({ status: 'committed' as const, eventId: event.id, seq: 1, serverTime: '2026-10-02T09:00:00.000Z' }));
  };
}

function mount(
  rows: NoteComment[] | (() => Promise<NoteComment[]>),
  canModerate: boolean,
  ingested: SubmittedEvent[],
) {
  const services = stubServices({ getNoteComments: typeof rows === 'function' ? rows : async () => rows });
  services.dataSource.ingest = recording(ingested);
  render(
    <Providers services={services}>
      <NoteComments workspaceId={WS} noteId={NOTE} nameOf={nameOf} canComment canModerate={canModerate} />
    </Providers>,
  );
}

beforeEach(() => {
  cleanup();
  capturedSlotProps = [];
});

describe('26.113–26.115 note comments: edit and delete', () => {
  it('26.113 Edit opens the editor in place with Save, and its submit files ONE comment.edited against { kind: note, id }', async () => {
    const ingested: SubmittedEvent[] = [];
    mount([row({ commentId: 'c-mine' })], false, ingested);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: "More actions for Anselma Marak's comment" }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const editor = capturedSlotProps.filter((p) => p['submitLabel'] === 'Save').at(-1);
    expect(editor, 'the in-place editor was never mounted with submitLabel="Save"').toBeDefined();
    expect(editor!['doc']).toEqual(BODY);
    const submit = editor!['submit'] as (s: { type: string; payload: unknown }) => Promise<boolean>;
    let accepted = false;
    await act(async () => {
      accepted = await submit({ type: 'comment.added', payload: { body: { type: 'doc', content: [] } } });
    });
    expect(accepted).toBe(true);
    expect(ingested).toHaveLength(1);
    expect(ingested[0]).toMatchObject({
      type: 'comment.edited',
      entity: { kind: 'note', id: NOTE },
      payload: { commentId: 'c-mine', body: { type: 'doc', content: [] } },
      origin: 'web',
      actorId: 'u_ana',
    });
  });

  it('26.113 after a committed edit the note thread RELOADS and shows "edited"; before Save it does not', async () => {
    const ingested: SubmittedEvent[] = [];
    let reads = 0;
    mount(
      async () => {
        reads += 1;
        return [row({ commentId: 'c-mine', editedAt: reads > 1 ? '2026-10-02T09:30:00.000Z' : null })];
      },
      false,
      ingested,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: "More actions for Anselma Marak's comment" }));
    expect(screen.queryByText('edited')).toBeNull(); // control: the first read carries no edit
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const editor = capturedSlotProps.filter((p) => p['submitLabel'] === 'Save').at(-1)!;
    const submit = editor['submit'] as (s: { type: string; payload: unknown }) => Promise<boolean>;
    await act(async () => {
      await submit({ type: 'comment.added', payload: { body: { type: 'doc', content: [] } } });
    });
    expect(await screen.findByText('edited')).toBeInTheDocument(); // what the reader SEES, from the second read
    expect(ingested).toHaveLength(1);
  });

  it('26.121 the in-place editor takes the composer\'s capabilities: @, :ticket, [[ and the ticket link; none is excluded', async () => {
    mount([row({ commentId: 'c-mine' })], false, []);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: "More actions for Anselma Marak's comment" }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    // The composer is a button until reached for (smoothness T9, 25.153): open it so its slot exists to compare.
    await user.click(await screen.findByRole('button', { name: /Add a comment/ }));
    const KEYS = ['queryUsers', 'queryNotes', 'queryTickets', 'resolveTicketHref'] as const;
    const composer = capturedSlotProps.filter((p) => p['placeholder'] === 'Add a comment').at(-1)!;
    const edit = capturedSlotProps.filter((p) => p['submitLabel'] === 'Save').at(-1)!;
    // CONTROL: the composer's set is non-empty and contains queryUsers, so equality below is not two empty sets.
    const capsOf = (props: Record<string, unknown>) => KEYS.filter((k) => typeof props[k] === 'function');
    expect(capsOf(composer)).toContain('queryUsers');
    expect(capsOf(composer)).toEqual([...KEYS]);
    expect(capsOf(edit)).toEqual(capsOf(composer));
  });

  it('26.114 Delete asks, then files ONE comment.deleted against the note', async () => {
    const ingested: SubmittedEvent[] = [];
    mount([row({ commentId: 'c-mine' })], false, ingested);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /More actions/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(ingested).toHaveLength(0); // control: the question comes first
    await user.click(screen.getByRole('button', { name: 'Delete comment' }));
    await waitFor(() => expect(ingested).toHaveLength(1));
    expect(ingested[0]).toMatchObject({ type: 'comment.deleted', entity: { kind: 'note', id: NOTE }, payload: { commentId: 'c-mine' }, actorId: 'u_ana' });
  });

  it('26.112 canModerate offers Delete on another person’s comment, never Edit; without it, no "…"', async () => {
    mount([row({ commentId: 'c-kiro', authorId: 'u_kiro' })], true, []);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: "More actions for Kiro's comment" }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Delete']);
    cleanup();
    mount([row({ commentId: 'c-kiro', authorId: 'u_kiro' })], false, []);
    const list = await screen.findByText('Kiro');
    expect(within(list.closest('li')!).queryByRole('button', { name: /More actions/ })).toBeNull();
  });

  it('26.111 a deleted note comment reads "Comment deleted", with no body', async () => {
    mount([row({ commentId: 'c-gone', body: null, deletedAt: '2026-10-02T10:00:00.000Z' })], true, []);
    expect(await screen.findByText('Comment deleted')).toBeInTheDocument();
    expect(screen.queryByText('a comment')).toBeNull();
  });
});
