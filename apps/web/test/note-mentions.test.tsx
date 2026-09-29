import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { DataSourceQuery, ProjectRef, RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
import type { NoteDetail } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 18.401–18.402 — the `@` picker is wired into BOTH note editors (owner
 * ruling 2026-09-29, "yes, notify on note mentions": typing `@` in a note body
 * or a note comment listed nobody — "No people match" — because neither editor
 * was handed a mention source).
 *
 * The REAL slot and the REAL editor, no stub: what is asserted is the popup a
 * person sees, in the DOM, after typing `@an` into each editor. The editor
 * instance comes off the contenteditable (`.ProseMirror`.editor — Tiptap hangs
 * it there) and characters go through `handleTextInput`, the path a browser's
 * typing takes, because `insertContent` would bypass the suggestion trigger.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/notes',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { NoteDocument } from '../src/notes/note-document.js';

const WS = '01J9WSLOGISTICS000000000000';
const P_COLD = '01J9PCOLDROOM00000000000000';
const NOTE = '01J9NOTECOLDROOM000000000000';

const WS_REF: WorkspaceRef = {
  id: WS,
  name: 'Garo Hills Logistics',
  prefix: 'CC',
  role: 'owner',
  archived: false,
  memberCount: 3,
  nameRestrictedProjectCount: 0,
  projects: [{ id: P_COLD, name: 'Cold room', prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0 } as ProjectRef],
};

/** Anselma has NO name (magic-link) — she must be found by her address, as on a ticket. */
const MEMBERS: RosterMember[] = [
  { id: 'u_kiro', name: 'Kiro', role: 'owner' },
  { id: 'u_ana', name: 'Anselma Marak', role: 'member' },
  { id: 'u_nameless', name: '', email: 'ananda@example.com', role: 'member' },
];

const NOTE_DETAIL: NoteDetail = {
  noteId: NOTE,
  workspaceId: WS,
  homeProjectId: P_COLD,
  authorId: 'u_kiro',
  title: 'Compressor log',
  scope: { mode: 'workspace' },
  attachedTickets: [],
  deleted: false,
  createdAt: '2026-09-23T06:00:00.000Z',
  updatedAt: '2026-09-23T06:00:00.000Z',
  body: { type: 'doc', content: [{ type: 'paragraph' }] },
  schemaVersion: 2,
};

function renderDocument() {
  const services = stubServices({
    getMyWorkspaces: async () => [WS_REF],
    getNote: async (_workspaceId: string, id: string) => (id === NOTE ? NOTE_DETAIL : null),
    getMembers: async () => MEMBERS,
    getNotes: async () => [],
    getDeletedNotes: async () => [],
    getNoteComments: async () => [],
  } as Partial<DataSourceQuery>);
  return render(
    <Providers services={services}>
      <NoteDocument noteId={NOTE} workspaces={[WS_REF]} />
    </Providers>,
  );
}

function editorOf(el: Element): Editor {
  return (el as unknown as { editor: Editor }).editor;
}

function typeInto(editor: Editor, text: string): void {
  editor.commands.focus('end');
  for (const char of text) {
    const { view } = editor;
    const { from, to } = view.state.selection;
    const deflt = () => view.state.tr.insertText(char, from, to);
    const handled = view.someProp('handleTextInput', (handler) => handler(view, from, to, char, deflt));
    if (!handled) view.dispatch(deflt());
  }
}

const popupNames = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('.mention-popup__item')].map((item) => item.textContent?.trim() ?? '');

beforeEach(() => cleanup());
afterEach(() => {
  cleanup();
  document.querySelectorAll('.mention-popup').forEach((el) => el.remove());
});

/** The two rich editors on the page, body first and the comment composer second. */
async function bothEditors(container: HTMLElement): Promise<{ body: Editor; comment: Editor }> {
  // The byline names the author from the SAME roster the picker reads, so its
  // appearance is the signal the roster has loaded — typing before it would ask
  // the picker for people the page does not know yet.
  await screen.findByText('Kiro');
  await waitFor(() => expect(container.querySelectorAll('.ProseMirror').length).toBeGreaterThanOrEqual(2));
  const [body, comment] = [...container.querySelectorAll('.ProseMirror')];
  return { body: editorOf(body!), comment: editorOf(comment!) };
}

describe('18.401–18.402 the @ picker lists the workspace people in both note editors', () => {
  it('18.401 typing @an in the note BODY lists the people whose label matches — and not the others', async () => {
    const { container } = renderDocument();
    const { body } = await bothEditors(container);
    typeInto(body, '@an');
    await waitFor(() => expect(popupNames().length).toBeGreaterThan(0));
    const names = popupNames().join(' | ');
    expect(names).toContain('Anselma Marak');
    // A member with no name is reached by the address the ticket editor labels her with.
    expect(names).toContain('ananda@example.com');
    // CONTROL, same it(): the list is FILTERED, not everybody.
    expect(names).not.toContain('Kiro');
  });

  it('18.402 typing @an in the note COMMENT composer lists the same people', async () => {
    const { container } = renderDocument();
    const { comment } = await bothEditors(container);
    typeInto(comment, '@an');
    await waitFor(() => expect(popupNames().length).toBeGreaterThan(0));
    const names = popupNames().join(' | ');
    expect(names).toContain('Anselma Marak');
    expect(names).toContain('ananda@example.com');
    expect(names).not.toContain('Kiro');
  });
});
