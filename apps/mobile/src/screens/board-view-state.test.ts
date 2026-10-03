import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { TicketSummary } from '@gisik-nokma/app-core';
import { BOARD_EMPTY_TEXT, BOARD_NO_MATCH_TEXT, boardListState } from './board-view-state.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');
const t = { ticketId: 't1', title: 'T', stateId: 'open', pending: false, openContests: 0 } as TicketSummary;

/**
 * Smoothness T13 (spec §3.3; audit SM-13): the phone board shows a skeleton list until the first read answers and an empty state only after
 * a read answered empty. This package's vitest runs in node with no React Native renderer, so the DECISION is a pure function tested here and
 * the screen is held to it by source-text assertions (the `pressable-a11y-sweep` precedent); what it PAINTS is case 25.219 (🧪).
 */
describe('the phone board list states (spec §3.3; audit SM-13)', () => {
  it('25.215 loading until the first read answers; empty ONLY after a read answered empty; a failed read is an error, never a skeleton forever or "No tickets yet"', () => {
    const base = { tickets: null, readError: null, initError: null, query: '' };
    expect(boardListState(base), 'replica not open or first read pending').toBe('loading');
    expect(boardListState({ ...base, tickets: [] })).toBe('empty');
    expect(boardListState({ ...base, tickets: [t] })).toBe('rows');
    expect(boardListState({ ...base, tickets: [], query: 'milk' }), 'an empty SEARCH is not "no tickets yet"').toBe('no-match');
    expect(boardListState({ ...base, readError: 'disk is full' })).toBe('error');
    expect(boardListState({ ...base, initError: 'could not open the database' })).toBe('error');
    expect(boardListState({ ...base, tickets: [t], readError: 'later read failed' }), 'rows already shown stay').toBe('rows');
    expect(BOARD_EMPTY_TEXT).toBe('No tickets yet');
    expect(BOARD_NO_MATCH_TEXT).toBe('No tickets match');
    // CONTROL (same it): null and [] are different answers.
    expect(boardListState(base)).not.toBe(boardListState({ ...base, tickets: [] }));
  });

  it('25.215 the board screen holds to the decision: it starts at null, renders the skeleton list for "loading", and the empty copy only from the state', () => {
    const screen = source('screens/board-screen.tsx');
    expect(screen).toMatch(/useState<TicketSummary\[\] \| null>\(null\)/);
    expect(screen).not.toMatch(/useState<TicketSummary\[\]>\(\[\]\)/);
    expect(screen).toMatch(/boardListState\(/);
    expect(screen).toMatch(/<SkeletonList rows=\{6\}/);
    expect(screen).toMatch(/BOARD_EMPTY_TEXT/);
    expect(screen).toMatch(/BOARD_NO_MATCH_TEXT/);
    // CONTROL: the strings live in the module, not inline in the screen.
    expect(screen).not.toMatch(/>No tickets yet</);
  });
});
