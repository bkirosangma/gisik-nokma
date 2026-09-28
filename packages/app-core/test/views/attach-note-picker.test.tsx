import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NoteSummary } from '@gisik-nokma/domain';
import { makeSubmittedFactory } from '../../src/submit.js';
import type { DataSourceQuery, NoteSearchQueryOptions, NoteSearchResult } from '../../src/data-source.js';
import type { NoteSearchHit } from '../../src/view-types.js';
import type { IngestScript } from '../helpers/fake-data-source.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { PROJECT, TICKET, WS } from '../helpers/seed.js';
import { AttachNotePicker } from '../../src/views/attach-note-picker.js';
import { ReplicaGapError } from '../../src/replica/replica-data-source.js';
import { Popover } from '@gisik-nokma/ui';
import { useRef } from 'react';

/**
 * Cases 18.247–18.252 — the Attach-note picker with the New-note row (notes
 * series, Plan 6 of 7, spec §10.3). Case ids live in `test-cases/18-notes.md`
 * §18.12.
 */

function note(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    noteId: 'note_1',
    workspaceId: WS,
    homeProjectId: PROJECT,
    authorId: 'user_kiro',
    title: 'Compressor log',
    scope: { mode: 'workspace' },
    attachedTickets: [],
    deleted: false,
    createdAt: '2026-08-18T08:00:00.000Z',
    updatedAt: '2026-08-18T08:00:00.000Z',
    ...overrides,
  };
}

function searchHit(overrides: Partial<NoteSearchHit> = {}): NoteSearchHit {
  return {
    noteId: 'note_search',
    title: 'Fridge broken',
    snippet: 'Fridge broken',
    homeProjectId: PROJECT,
    scopeMode: 'workspace',
    attachedTicketKeys: [],
    authorId: 'user_kiro',
    updatedAt: '2026-08-18T08:00:00.000Z',
    source: 'lexical',
    ...overrides,
  };
}

function makeFactory() {
  return makeSubmittedFactory({ actorId: 'user_kiro', origin: 'web' });
}

function renderPicker(overrides: {
  getNotes?: DataSourceQuery['getNotes'];
  searchNotes?: DataSourceQuery['searchNotes'];
  attachedIds?: string[];
  ingestScript?: IngestScript;
  onAttached?: () => void;
  onCreated?: (noteId: string) => void;
  onRefusal?: (r: { rule: string; reason: string }) => void;
} = {}) {
  const queryOverrides: Partial<DataSourceQuery> = { getNotes: overrides.getNotes ?? (async () => []) };
  if (overrides.searchNotes !== undefined) queryOverrides.searchNotes = overrides.searchNotes;
  const source = createFakeDataSource(queryOverrides, overrides.ingestScript);
  const onAttached = overrides.onAttached ?? vi.fn();
  const onCreated = overrides.onCreated ?? vi.fn();
  const onRefusal = overrides.onRefusal ?? vi.fn();
  render(
    <AttachNotePicker
      dataSource={source}
      workspaceId={WS}
      ticketId={TICKET}
      projectId={PROJECT}
      attachedIds={overrides.attachedIds ?? []}
      make={makeFactory()}
      onAttached={onAttached}
      onCreated={onCreated}
      onRefusal={onRefusal}
    />,
  );
  return { source, onAttached, onCreated, onRefusal };
}

afterEach(() => {
  cleanup();
});

describe('AttachNotePicker', () => {
  it('18.247 lists readable notes minus the attached ones, filtered by the typed text, at most 8', async () => {
    const NOTES = [
      note({ noteId: 'note_1', title: 'Compressor log' }),
      note({ noteId: 'note_2', title: 'Fridge notes' }),
      note({ noteId: 'note_3', title: 'Unrelated title' }),
    ];
    renderPicker({ getNotes: async () => NOTES, attachedIds: ['note_1'] });
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: /Compressor log/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: `Fridge notes · ${PROJECT}` })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: `Unrelated title · ${PROJECT}` })).toBeInTheDocument();
    cleanup();

    // The cap: nine unattached notes, all matching the empty filter.
    const NINE = Array.from({ length: 9 }, (_, i) => note({ noteId: `note_many_${i}`, title: `Log ${i}` }));
    renderPicker({ getNotes: async () => NINE, attachedIds: [] });
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    // 8 candidates + the New-note row.
    expect(screen.getAllByRole('option')).toHaveLength(9);
  });

  it("18.248 with ≥ 3 characters and < 8 local hits, searchNotes is called and its hits merge by id; a ReplicaGapError leaves the local list and shows \"Search needs a connection\"", async () => {
    const user = userEvent.setup();
    const searchNotes = vi.fn(
      async (_workspaceId: string, _text: string, _options: NoteSearchQueryOptions): Promise<NoteSearchResult> => ({
        notes: [searchHit({ noteId: 'note_search', title: 'Fridge broken' })],
      }),
    );
    renderPicker({ getNotes: async () => [], searchNotes });
    const input = screen.getByRole('textbox', { name: 'Find a note' });
    await user.type(input, 'fri');
    await waitFor(() => expect(searchNotes).toHaveBeenCalledWith(WS, 'fri', { mode: 'lexical' }));
    expect(await screen.findByRole('option', { name: `Fridge broken · ${PROJECT}` })).toBeInTheDocument();
    cleanup();

    // Control: a ReplicaGapError leaves the local list intact and shows the status line.
    const gapSearch = vi.fn(
      async (_workspaceId: string, _text: string, _options: NoteSearchQueryOptions): Promise<NoteSearchResult> => {
        throw new ReplicaGapError('searchNotes', []);
      },
    );
    renderPicker({
      getNotes: async () => [note({ noteId: 'note_local', title: 'Fridge parts list' })],
      searchNotes: gapSearch,
    });
    const input2 = screen.getByRole('textbox', { name: 'Find a note' });
    await user.type(input2, 'fri');
    await waitFor(() => expect(gapSearch).toHaveBeenCalled());
    expect(await screen.findByText('Search needs a connection')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: `Fridge parts list · ${PROJECT}` })).toBeInTheDocument();
  });

  it('18.249 choosing an existing note writes one note.attached { ticketId } and closes the picker', async () => {
    const user = userEvent.setup();
    const { source, onAttached } = renderPicker({
      getNotes: async () => [note({ noteId: 'note_1', title: 'Compressor log' })],
    });
    await screen.findByRole('option', { name: `Compressor log · ${PROJECT}` });
    await user.click(screen.getByRole('option', { name: `Compressor log · ${PROJECT}` }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const event = source.ingested[0]![0]!;
    expect(event.type).toBe('note.attached');
    expect(event.entity).toEqual({ kind: 'note', id: 'note_1' });
    expect(event.payload).toEqual({ ticketId: TICKET });
    expect(onAttached).toHaveBeenCalledTimes(1);
  });

  it('18.250 "New note: <text>" writes ONE note.created with inherit scope, the ticket\'s project as home and attachTicketId, then navigates to /notes/<id>', async () => {
    const user = userEvent.setup();
    const { source, onCreated } = renderPicker({ getNotes: async () => [] });
    const newNoteButton = screen.getByRole('option', { name: /^New note:/ });
    expect(newNoteButton).toBeDisabled();
    const input = screen.getByRole('textbox', { name: 'Find a note' });
    await user.type(input, 'Compressor manual');
    const readyButton = screen.getByRole('option', { name: 'New note: Compressor manual' });
    expect(readyButton).toBeEnabled();
    await user.click(readyButton);
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(source.ingested[0]).toHaveLength(1);
    const event = source.ingested[0]![0]!;
    expect(event.type).toBe('note.created');
    expect(event.payload).toEqual({
      title: 'Compressor manual',
      homeProjectId: PROJECT,
      scope: { mode: 'inherit' },
      attachTicketId: TICKET,
    });
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith(event.entity.id);
  });

  it('18.251 keyboard: arrows move the active option, Enter chooses, Escape closes; control: typing does not choose', async () => {
    const user = userEvent.setup();
    const { source, onAttached } = renderPicker({
      getNotes: async () => [
        note({ noteId: 'note_1', title: 'Compressor log note' }),
        note({ noteId: 'note_2', title: 'Fridge notes' }),
      ],
    });
    const input = screen.getByRole('textbox', { name: 'Find a note' });
    await user.type(input, 'note');
    // Control: typing alone never chooses.
    expect(source.ingested).toHaveLength(0);
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(3); // 2 notes + New-note row
    // Control: Enter with NO active option (nothing highlighted yet) chooses nothing.
    await user.keyboard('{Enter}');
    expect(source.ingested).toHaveLength(0);
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(options[0]).toHaveAttribute('aria-selected', 'true'));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(options[1]).toHaveAttribute('aria-selected', 'true'));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const event = source.ingested[0]![0]!;
    expect(event.type).toBe('note.attached');
    expect(event.entity).toEqual({ kind: 'note', id: 'note_2' });
    expect(onAttached).toHaveBeenCalledTimes(1);
  });

  it('18.251a Escape closes (through the real Popover)', async () => {
    const user = userEvent.setup();
    const source = createFakeDataSource({ getNotes: async () => [] });
    const onClose = vi.fn();
    function Host() {
      const triggerRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={triggerRef} type="button">
            Attach note
          </button>
          <Popover triggerRef={triggerRef} open onClose={onClose} aria-label="Attach a note">
            <AttachNotePicker
              dataSource={source}
              workspaceId={WS}
              ticketId={TICKET}
              projectId={PROJECT}
              attachedIds={[]}
              make={makeFactory()}
              onAttached={vi.fn()}
              onCreated={vi.fn()}
              onRefusal={vi.fn()}
            />
          </Popover>
        </>
      );
    }
    render(<Host />);
    const input = await screen.findByRole('textbox', { name: 'Find a note' });
    input.focus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  /**
   * 9.325 — Unit 2 styling (owner screenshot, 2026-09-23: "the add note menu
   * needs better styling"): each row's title and meta render as separate,
   * separately-classed spans (so CSS can mute the meta), while the row's
   * ACCESSIBLE NAME stays byte-identical to what 18.247-18.251 already
   * assert — `${title} · ${homeProjectId}` — because those cases (and the
   * live suite) keep finding rows by that exact name.
   */
  it('9.325 an existing-note row splits into a title span and a muted meta span, with the accessible name unchanged', async () => {
    renderPicker({ getNotes: async () => [note({ noteId: 'note_1', title: 'Compressor log' })] });
    const option = await screen.findByRole('option', { name: `Compressor log · ${PROJECT}` });
    expect(option.querySelector('.gn-attach-note-picker__option-title')).toHaveTextContent('Compressor log');
    expect(option.querySelector('.gn-attach-note-picker__option-meta')).toHaveTextContent(PROJECT);
  });

  it('18.252 a refused create shows the reason inline and keeps the picker open', async () => {
    const user = userEvent.setup();
    const ingestScript: IngestScript = (events) =>
      events.map((event) => ({
        status: 'refused' as const,
        eventId: event.id,
        rule: 'note.create.locked',
        reason: 'This project is locked.',
      }));
    const { onCreated, onRefusal } = renderPicker({ getNotes: async () => [], ingestScript });
    const input = screen.getByRole('textbox', { name: 'Find a note' });
    await user.type(input, 'Compressor manual');
    await user.click(screen.getByRole('option', { name: 'New note: Compressor manual' }));
    await waitFor(() =>
      expect(onRefusal).toHaveBeenCalledWith({ rule: 'note.create.locked', reason: 'This project is locked.' }),
    );
    expect(await screen.findByText('This project is locked.')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    // The picker stays mounted with its input still present.
    expect(screen.getByRole('textbox', { name: 'Find a note' })).toBeInTheDocument();
  });
});
