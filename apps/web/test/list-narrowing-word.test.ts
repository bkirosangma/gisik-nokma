import { describe, expect, it } from 'vitest';
import { listNarrowingWord } from '../src/list-narrowing-word.js';

/** 13.556 — the word `TicketList` renders as "narrowed to {word} — not the whole project" (exclude-mode spec §3). */
describe('13.556 listNarrowingWord names every narrowing in force', () => {
  it('neither → undefined, so the count reads as the project\'s own', () => {
    expect(listNarrowingWord(false, false)).toBeUndefined();
  });
  it('toggle only', () => {
    expect(listNarrowingWord(true, false)).toBe('tickets in progress');
  });
  it('filters only', () => {
    expect(listNarrowingWord(false, true)).toBe('your filters');
  });
  it('both, joined', () => {
    expect(listNarrowingWord(true, true)).toBe('tickets in progress and your filters');
  });
});
