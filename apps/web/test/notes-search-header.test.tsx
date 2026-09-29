import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NotesSearchHeader } from '../src/notes/notes-search-header.js';

/**
 * Case 18.301 — Unit 6a (owner: "in notes. the input element needs a place
 * holder. 'Search'."). Case ids live in `test-cases/18-notes.md`, block
 * `18.301`–`18.320`.
 */
afterEach(() => {
  cleanup();
});

describe('18.301 the notes search input carries a placeholder', () => {
  it('18.301 placeholder="Search", and the accessible name stays "Search notes"', () => {
    render(
      <NotesSearchHeader
        value=""
        onChange={() => {}}
        authorId=""
        onAuthor={() => {}}
        scopeMode=""
        onScope={() => {}}
        members={[]}
      />,
    );
    const input = screen.getByTestId('notes-search') as HTMLInputElement;
    expect(input.placeholder).toBe('Search');
    // Unchanged: the accessible name still comes from `aria-label`, not the
    // placeholder — a placeholder is never a substitute for a real name.
    expect(input).toHaveAccessibleName('Search notes');
  });
});
