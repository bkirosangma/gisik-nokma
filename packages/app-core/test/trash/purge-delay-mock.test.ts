import { describe, expect, it, vi } from 'vitest';

/**
 * Case 19.210 — nothing in the product spells 15 (Plan 1's rule). A literal
 * `15` in the note would render EXACTLY like `PURGE_DELAY_DAYS` today, so the
 * only witness that the note READS the constant is to change the constant.
 * `vi.mock` is hoisted above the import below, and `src/trash/copy.ts` imports
 * `@gisik-nokma/domain` by the same specifier, so it sees 14.
 */
vi.mock('@gisik-nokma/domain', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gisik-nokma/domain')>()),
  PURGE_DELAY_DAYS: 14,
}));

import { DELETE_NOTE, deletedNotice } from '../../src/trash/copy.js';

describe('19.210 the note and the notice read PURGE_DELAY_DAYS', () => {
  it('19.210 with the constant at 14 they say 14 and never 15', () => {
    expect(DELETE_NOTE).toContain('purged for good after 14 days');
    expect(DELETE_NOTE).not.toContain('15');
    expect(deletedNotice('ticket', 'CCSO-3', true)).toContain('within 14 days');
    // CONTROL — otherwise the spec's sentence.
    expect(DELETE_NOTE.startsWith('Deleted items sit in Deleted items on your Account page')).toBe(true);
  });
});
