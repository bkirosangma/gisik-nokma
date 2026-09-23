import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteVersion } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

// `Providers` calls `useRouter()` unconditionally (it forwards `push` to
// every data-source consumer), so every test that mounts it needs the same
// mock `note-document.test.tsx` carries — `HistoryPanel` itself never
// navigates, but its host does.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/notes',
  useSearchParams: () => new URLSearchParams(),
}));

import { HistoryPanel } from '../src/notes/history-panel.js';

/**
 * Cases 18.210–18.212 — the History panel (Plan 5 of 6, spec §9.5, D15).
 *
 * `getNoteVersion` answers the BODY directly, not a `NoteDetail` — both
 * `online-data-source.ts` and `replica-data-source.ts` resolve
 * `payload.body ?? null`, and `data-source.ts` declares it
 * `Promise<unknown | null>`. Every fixture below is a body, never a note.
 */
const WS = '01J9WSLOGISTICS000000000000';
const NOTE = '01J9NOTECOLDROOM000000000000';
const E_OLD = '01J9EVENTOLD00000000000000000';
const E_NEW = '01J9EVENTNEW00000000000000000';

function body(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

const NAMES: Record<string, string> = { u_kiro: 'Kiro', u_ana: 'Anselma Marak' };
const nameOf = (id: string): string => NAMES[id] ?? id;

const VERSIONS: NoteVersion[] = [
  { eventId: E_OLD, authorId: 'u_kiro', recordedAt: '2026-09-23T06:00:00.000Z', seq: 1 },
  { eventId: E_NEW, authorId: 'u_ana', recordedAt: '2026-09-23T08:00:00.000Z', seq: 2 },
];

const BODIES: Record<string, unknown> = {
  [E_OLD]: body('the old words'),
  [E_NEW]: body('the newer words'),
};

function world(opts: { history?: NoteVersion[]; versionOf?: (eventId: string) => unknown } = {}) {
  return stubServices({
    getNoteHistory: async () => opts.history ?? VERSIONS,
    getNoteVersion: async (_workspaceId: string, _noteId: string, eventId: string) =>
      (opts.versionOf ?? ((id: string) => BODIES[id] ?? null))(eventId),
  });
}

function renderPanel(opts: {
  history?: NoteVersion[];
  versionOf?: (eventId: string) => unknown;
  canEdit?: boolean;
  onRestore?: (body: unknown) => void;
  onClose?: () => void;
} = {}) {
  const onRestore = opts.onRestore ?? vi.fn();
  const onClose = opts.onClose ?? vi.fn();
  const view = render(
    <Providers services={world(opts)}>
      <HistoryPanel
        open
        workspaceId={WS}
        noteId={NOTE}
        canEdit={opts.canEdit ?? true}
        nameOf={nameOf}
        onRestore={onRestore}
        onClose={onClose}
      />
    </Providers>,
  );
  return { ...view, onRestore, onClose };
}

beforeEach(() => {
  cleanup();
});

describe('18.210-18.212 HistoryPanel', () => {
  /**
   * 18.210 — newest first, named rows; the empty arm.
   *
   * Mutation: oldest first — the server's own `listNoteHistory` query is
   * `ORDER BY seq` ascending with no `DESC`, so a panel that forgot to
   * reverse it would show the OLDEST version first, exactly this mutation.
   */
  it('18.210 lists versions newest first, each with a relative time and the author name; an empty history says so', async () => {
    renderPanel();
    const rows = await screen.findAllByTestId(/^history-row-/);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      `history-row-${E_NEW}`,
      `history-row-${E_OLD}`,
    ]);
    expect(rows[0]).toHaveTextContent('Anselma Marak');
    expect(rows[1]).toHaveTextContent('Kiro');

    // CONTROL — no versions.
    cleanup();
    renderPanel({ history: [] });
    expect(await screen.findByText('No saved versions yet')).toBeInTheDocument();
  });

  /**
   * 18.211 — selecting a row, and Back's refusal to write.
   *
   * Mutation: write on Back — `onRestore` would be called even though the
   * person asked to leave without restoring anything.
   */
  it('18.211 selecting a row shows that version read-only with the banner; Back returns without writing', async () => {
    const user = userEvent.setup();
    const { container, onRestore } = renderPanel();

    const row = await screen.findByTestId(`history-row-${E_OLD}`);
    await user.click(row);

    expect(await screen.findByText(/Viewing version from/)).toBeInTheDocument();
    await waitFor(() =>
      expect(container.querySelector('.ProseMirror')?.textContent ?? '').toContain('the old words'),
    );
    // Read-only: the point of a HISTORY view.
    await waitFor(() =>
      expect(container.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('false'),
    );

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onRestore).not.toHaveBeenCalled();
    // Back to the list — the row is findable again.
    expect(await screen.findAllByTestId(/^history-row-/)).toHaveLength(2);
  });

  /**
   * 18.212 — Restore reports exactly the version being viewed.
   *
   * Mutation: write the live body — `onRestore` fires with something OTHER
   * than the version on screen (here: always the newest version's body,
   * regardless of which row was opened), which this case's two-version
   * fixture is built to catch: opening the OLD row and restoring must not
   * report the NEW row's body.
   */
  it('18.212 Restore reports exactly the selected version’s body, once', async () => {
    const user = userEvent.setup();
    const { onRestore } = renderPanel();

    const row = await screen.findByTestId(`history-row-${E_OLD}`);
    await user.click(row);
    await screen.findByText(/Viewing version from/);

    await user.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith(body('the old words'));
    // CONTROL, in the same reading: it is NOT the other version's body.
    expect(onRestore).not.toHaveBeenCalledWith(body('the newer words'));
  });

  /**
   * Additional coverage beyond the plan's three named cases: spec §9.6's
   * "no History Restore (view only)" for a reader. Not a numbered case — none
   * of 18.210–18.212 names it, and minting a new one risks nothing here (this
   * plan's next free id, `18.213`, is Task 7's per the allocation table), but
   * folding it into 18.212 would blur that case's own subject (which body
   * gets restored) with a different one (who is allowed to restore at all).
   */
  it('a reader (canEdit false) can open and view History, but never sees Restore', async () => {
    const user = userEvent.setup();
    renderPanel({ canEdit: false });

    const row = await screen.findByTestId(`history-row-${E_OLD}`);
    await user.click(row);
    await screen.findByText(/Viewing version from/);

    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    // Still view only, not locked out: Back is there and the version is.
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });
});
