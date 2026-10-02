import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 25.176 — the manual's search follows the keystroke by a deferred render, not in the same one (smoothness T10, spec D6; audit SM-16).
 *
 * `HelpBrowser` keeps ONE `query` for the input and hands `useDeferredValue(query)` to `searchHelp`. Observing "a render behind" under
 * jsdom's `act` is not possible (every `act` flushes the deferred render too), so the seam is pinned instead: `useDeferredValue` is
 * stubbed to hold its value back, and the input must still show every character while `searchHelp` is asked only for what the
 * deferred value returned. The control, in the same it(): with the real hook the same typing is searched.
 */
const state = vi.hoisted(() => ({ held: false, searched: [] as string[] }));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useDeferredValue: <T,>(value: T): T => (state.held ? ('' as unknown as T) : actual.useDeferredValue(value)),
  };
});
vi.mock('../../src/help/search.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/help/search.js')>();
  return {
    ...actual,
    searchHelp: (...args: Parameters<typeof actual.searchHelp>) => {
      state.searched.push(args[1]);
      return actual.searchHelp(...args);
    },
  };
});

import { HelpBrowser } from '../../src/help/help-browser.js';

afterEach(() => {
  state.held = false;
  state.searched = [];
});

describe('25.176 HelpBrowser search is deferred', () => {
  it('25.176 the input shows every keystroke at once while the results are searched from the deferred value; with the real hook the typed text is searched', () => {
    state.held = true;
    const { unmount } = render(<HelpBrowser />);
    const field = screen.getByRole('searchbox');
    for (const value of ['t', 'ti', 'tic']) fireEvent.change(field, { target: { value } });
    expect((field as HTMLInputElement).value).toBe('tic');
    expect(state.searched.filter((query) => query !== '')).toEqual([]);
    unmount();

    // Control (same it()): the real `useDeferredValue` lets the typed text through to the search.
    state.held = false;
    state.searched = [];
    render(<HelpBrowser />);
    const live = screen.getByRole('searchbox');
    act(() => {
      fireEvent.change(live, { target: { value: 'tic' } });
    });
    expect((live as HTMLInputElement).value).toBe('tic');
    expect(state.searched).toContain('tic');
  });
});
