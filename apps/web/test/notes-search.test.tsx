import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteSearchHit, ProjectRef, WorkspaceRef } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { WorkspaceNotesSection } from '../src/notes/workspace-notes-section.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 18.216–18.220 — search on the Notes page (Plan 5 of 6, spec §7.8,
 * D21–D24).
 *
 * `use-notes-search.test.tsx` already proves the HOOK's own contract — the
 * debounces, the staleness comparison, the merge order. These five are about
 * what `WorkspaceNotesSection` does with that hook's answer: groups swap for
 * results, a snippet's `**match**` markers become `<mark>`, the two copy
 * lines, and the filters actually reaching the request. Rendered through
 * `WorkspaceNotesSection` directly rather than the whole `NotesPage` — the
 * page's only job here is holding one `query`/`authorId`/`scopeMode` and
 * handing them down (its own docblock), which is not a numbered case.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/notes',
  useSearchParams: () => new URLSearchParams(),
}));

let mockSessionUser: { id: string; name: string; email?: string } = {
  id: 'u_kiro',
  name: 'Kiro',
  email: 'kiro@example.com',
};
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: mockSessionUser } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

const WS = '01J9WSLOGISTICS000000000000';
const N_A = '01J9NOTEA0000000000000000000';
const N_B = '01J9NOTEB0000000000000000000';
const N_C = '01J9NOTEC0000000000000000000';

function project(id: string, name: string): ProjectRef {
  return { id, name, prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0 };
}

const WORKSPACE: WorkspaceRef = {
  id: WS,
  name: 'Garo Hills Logistics',
  prefix: 'CC',
  role: 'owner',
  archived: false,
  memberCount: 3,
  nameRestrictedProjectCount: 0,
  projects: [project('p_cold', 'Cold room')],
};

function hit(over: Partial<NoteSearchHit> & { noteId: string; source: 'lexical' | 'meaning' }): NoteSearchHit {
  return {
    title: 'Untitled',
    snippet: '',
    homeProjectId: '',
    scopeMode: 'workspace',
    attachedTicketKeys: [],
    authorId: 'u_kiro',
    updatedAt: '2026-09-23T08:00:00.000Z',
    ...over,
  };
}

type Deferred = { resolve: (value: { notes: NoteSearchHit[]; corrected?: string[] }) => void };

/** `searchNotes` calls, captured with a deferred resolver per call, matching `use-notes-search.test.tsx`'s own harness. */
function fakeSearch(): {
  searchNotes: (
    workspaceId: string,
    text: string,
    options: { mode: 'lexical' | 'meaning'; authorId?: string; scopeMode?: string },
  ) => Promise<{ notes: NoteSearchHit[]; corrected?: string[] }>;
  calls: Array<{ text: string; mode: string; authorId?: string; scopeMode?: string; deferred: Deferred }>;
} {
  const calls: Array<{ text: string; mode: string; authorId?: string; scopeMode?: string; deferred: Deferred }> = [];
  const searchNotes = vi.fn(
    (_workspaceId: string, text: string, options: { mode: 'lexical' | 'meaning'; authorId?: string; scopeMode?: string }) =>
      new Promise<{ notes: NoteSearchHit[]; corrected?: string[] }>((resolve) => {
        calls.push({ text, mode: options.mode, authorId: options.authorId, scopeMode: options.scopeMode, deferred: { resolve } });
      }),
  );
  return { searchNotes, calls };
}

async function renderSection(
  searchNotes: ReturnType<typeof fakeSearch>['searchNotes'],
  props: { searchQuery?: string; authorId?: string; scopeMode?: 'private' | 'workspace' | 'project' | 'inherit' | 'explicit' } = {},
) {
  const services = stubServices({
    getNotes: async () => [],
    getDeletedNotes: async () => [],
    searchNotes,
  });
  const view = render(
    <Providers services={services}>
      <WorkspaceNotesSection workspace={WORKSPACE} {...props} />
    </Providers>,
  );
  // Flushes `getNotes`/`getDeletedNotes` (plain microtasks — unaffected by
  // `vi.useFakeTimers()`, which only fakes the macrotask timer APIs) inside
  // `act()`, so their `setNotes`/`setDeleted` land before the test's own
  // assertions rather than warning as an update outside `act()`.
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

/** Resolve every call of a mode still pending, in order, with the same answer. */
async function settleAll(
  calls: Array<{ mode: string; deferred: Deferred }>,
  mode: 'lexical' | 'meaning',
  notes: NoteSearchHit[],
  corrected?: string[],
): Promise<void> {
  await act(async () => {
    for (const call of calls) {
      if (call.mode === mode) call.deferred.resolve(corrected === undefined ? { notes } : { notes, corrected });
    }
    await Promise.resolve();
  });
}

beforeEach(() => {
  cleanup();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('18.216-18.220 search on the Notes page', () => {
  /**
   * 18.216 — typing swaps the groups for results; clearing swaps back.
   *
   * Mutation: keep the groups visible — the section would render BOTH the
   * (empty, since `getNotes` is stubbed `[]`) groups and the results, or the
   * groups instead of the results.
   */
  it('18.216 a non-empty search query replaces the groups with results; clearing restores the groups', async () => {
    const { searchNotes, calls } = fakeSearch();
    const { rerender } = await renderSection(searchNotes, { searchQuery: 'cold' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await settleAll(calls, 'lexical', [hit({ noteId: N_A, source: 'lexical', title: 'Cold room log' })]);
    await settleAll(calls, 'meaning', []);

    expect(screen.getByTestId(`notes-results-${WS}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`notes-home-${WS}`)).toBeNull();
    expect(screen.queryByTestId('notes-container-p_cold')).toBeNull();

    // CONTROL — clearing the query returns to the groups. `p_cold` always
    // draws its own heading (18.186), even with no notes in it.
    rerender(
      <Providers services={stubServices({ getNotes: async () => [], getDeletedNotes: async () => [], searchNotes })}>
        <WorkspaceNotesSection workspace={WORKSPACE} searchQuery="" />
      </Providers>,
    );
    // Synchronous: `rerender` itself is wrapped in `act()`, and fake timers
    // are active for this test — `waitFor`/`findBy*` poll with `setTimeout`,
    // which a faked clock never advances on its own, so they would hang
    // rather than see this render.
    expect(screen.queryByTestId(`notes-results-${WS}`)).toBeNull();
    expect(screen.getByTestId('notes-container-p_cold')).toBeInTheDocument();
  });

  /**
   * 18.217 — the Author and Scope props reach `searchNotes`'s own options.
   *
   * Mutation: ignore the scope select — `scopeMode` would never appear in the
   * request even when the prop is set.
   */
  it('18.217 authorId and scopeMode reach searchNotes; control: neither prop sends neither filter', async () => {
    const { searchNotes, calls } = fakeSearch();
    await renderSection(searchNotes, { searchQuery: 'cold', authorId: 'u_ana', scopeMode: 'private' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.authorId).toBe('u_ana');
      expect(call.scopeMode).toBe('private');
    }

    // CONTROL — neither prop set: neither filter travels.
    cleanup();
    const { searchNotes: searchNotes2, calls: calls2 } = fakeSearch();
    await renderSection(searchNotes2, { searchQuery: 'cold' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(calls2.length).toBeGreaterThan(0);
    for (const call of calls2) {
      expect(call.authorId).toBeUndefined();
      expect(call.scopeMode).toBeUndefined();
    }
  });

  /**
   * 18.218 — `**match**` becomes `<mark>`.
   *
   * Mutation: render the asterisks — the snippet would show the literal
   * `**` characters instead of a `<mark>` element.
   */
  it('18.218 a **match** snippet renders <mark> around the matched word', async () => {
    const { searchNotes, calls } = fakeSearch();
    await renderSection(searchNotes, { searchQuery: 'cold' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await settleAll(calls, 'lexical', [
      hit({ noteId: N_A, source: 'lexical', title: 'Cold room log', snippet: 'The **cold** room compressor failed' }),
    ]);
    await settleAll(calls, 'meaning', []);

    const mark = screen.getByText('cold', { selector: 'mark' });
    expect(mark).toBeInTheDocument();
    expect(mark.textContent).toBe('cold');
    // CONTROL — the asterisks themselves are not in the rendered text.
    expect(screen.getByTestId(`notes-result-${N_A}`).textContent).not.toContain('**');
  });

  /**
   * 18.219 — `corrected` and the empty-results copy, and they are NOT
   * interchangeable.
   *
   * Mutation: swap the two — "Showing results for …" would appear over an
   * empty list, or "No notes match" would appear beside a correction.
   */
  it('18.219 corrected shows "Showing results for …"; empty results show "No notes match"', async () => {
    const { searchNotes, calls } = fakeSearch();
    await renderSection(searchNotes, { searchQuery: 'compresor' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await settleAll(calls, 'lexical', [hit({ noteId: N_A, source: 'lexical', title: 'A' })], ['compressor']);
    await settleAll(calls, 'meaning', []);
    expect(screen.getByText('Showing results for compressor')).toBeInTheDocument();
    expect(screen.queryByText('No notes match')).toBeNull();

    // CONTROL — no hits, no correction: "No notes match" and nothing else.
    cleanup();
    const { searchNotes: searchNotes2, calls: calls2 } = fakeSearch();
    await renderSection(searchNotes2, { searchQuery: 'nothing here' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await settleAll(calls2, 'lexical', []);
    await settleAll(calls2, 'meaning', []);
    expect(screen.getByText('No notes match')).toBeInTheDocument();
    expect(screen.queryByText(/Showing results for/)).toBeNull();
  });

  /**
   * 18.220 — the merge order survives the page: this asserts the SCREEN does
   * not re-sort what the hook already ordered.
   *
   * Mutation: sort results by title — with titles chosen so alphabetical
   * order ("Alpha", "Beta", "Charlie") DIFFERS from the merge order
   * (lexical [Beta, Alpha] then meaning appends [Charlie]).
   */
  it('18.220 the page renders lexical [A,B] then meaning [C] in that order, not re-sorted', async () => {
    const { searchNotes, calls } = fakeSearch();
    await renderSection(searchNotes, { searchQuery: 'note' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await settleAll(calls, 'lexical', [
      hit({ noteId: N_B, source: 'lexical', title: 'Beta' }),
      hit({ noteId: N_A, source: 'lexical', title: 'Alpha' }),
    ]);
    await settleAll(calls, 'meaning', [hit({ noteId: N_C, source: 'meaning', title: 'Charlie' })]);

    const rows = screen.getAllByTestId(/^notes-result-/);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      `notes-result-${N_B}`,
      `notes-result-${N_A}`,
      `notes-result-${N_C}`,
    ]);
  });
});
