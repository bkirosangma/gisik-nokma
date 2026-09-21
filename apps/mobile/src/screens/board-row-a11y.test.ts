import { describe, expect, it } from 'vitest';
import { boardRowAccessibilityLabel } from './board-row-a11y.js';

/**
 * 13.1187 — E4-22: the board row's accessible name names the ticket's title
 * and state, the same pair the row's visible text already shows, so
 * VoiceOver/TalkBack announces it as a button naming the ticket rather than
 * reading unstructured text.
 */
describe('boardRowAccessibilityLabel', () => {
  it('13.1187 — names the title and state, comma-separated', () => {
    expect(boardRowAccessibilityLabel({ title: 'Fix the drain', stateId: 'open' })).toBe('Fix the drain, open');
  });
});
