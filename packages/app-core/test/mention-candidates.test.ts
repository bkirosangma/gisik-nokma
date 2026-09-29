import { describe, expect, it } from 'vitest';
import { mentionCandidatesOf } from '../src/mention-candidates.js';

/**
 * 18.403 — ONE mention source for tickets and notes. The ticket sheet and both
 * note editors call `mentionCandidatesOf`; what it offers is what "the same
 * people the ticket editor offers" means.
 */
const ROSTER = [
  { id: 'u_kiro', name: 'Kiro' },
  { id: 'u_ana', name: 'Anselma Marak' },
  { id: 'u_magic', name: '', email: 'ananda@example.com' },
];

describe('18.403 mentionCandidatesOf', () => {
  it('an empty query offers everyone on the roster, labelled name → email → id', () => {
    expect(mentionCandidatesOf(ROSTER, '')).toEqual([
      { userId: 'u_kiro', name: 'Kiro' },
      { userId: 'u_ana', name: 'Anselma Marak' },
      { userId: 'u_magic', name: 'ananda@example.com' },
    ]);
  });

  it('matches case-insensitively on the label the list SHOWS, so a nameless member is found by their address', () => {
    expect(mentionCandidatesOf(ROSTER, '  AN ').map((p) => p.userId)).toEqual(['u_ana', 'u_magic']);
    expect(mentionCandidatesOf(ROSTER, 'example').map((p) => p.userId)).toEqual(['u_magic']);
  });

  it('a query nobody matches offers nobody, and an empty roster offers nobody', () => {
    expect(mentionCandidatesOf(ROSTER, 'zzz')).toEqual([]);
    expect(mentionCandidatesOf([], '')).toEqual([]);
  });
});
