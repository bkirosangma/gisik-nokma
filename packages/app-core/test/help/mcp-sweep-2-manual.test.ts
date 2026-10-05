import { describe, expect, it } from 'vitest';
import { HELP_CONTENT } from '../../src/help/content.generated.js';
import { searchHelp } from '../../src/help/search.js';
import { entryText, type HelpEntry } from '../../src/help/types.js';

/**
 * MCP sweep 2 T9, case 14.658. Manual §16 names each new ability in plain words and tells the reader that assigning by email asks first and
 * that a person outside the workspace is ADDED AS A GUEST; the Help search finds it. Against the REAL generated content, like
 * `connecting-assistants.test.ts`, so a stale `pnpm help:generate` reddens here as well as in `pnpm check:help`.
 */
const SECTION_ID = '16-connecting-claude-or-chatgpt';
const section = () => {
  const manual = HELP_CONTENT.find((d) => d.id === 'manual');
  const found = manual?.sections.find((s) => s.id === SECTION_ID);
  if (found === undefined) throw new Error(`no §16 (${SECTION_ID})`);
  return found;
};
const can = (): string => {
  const e: HelpEntry | undefined = section().entries.find((x) => x.title === 'What your assistant can do');
  if (e === undefined) throw new Error('§16 has no "What your assistant can do"');
  return entryText(e).toLowerCase();
};
const connecting = (): string => {
  const e: HelpEntry | undefined = section().entries.find((x) => x.title === 'What connecting does');
  if (e === undefined) throw new Error('§16 has no "What connecting does"');
  return entryText(e).toLowerCase().replace(/\s+/g, ' ');
};

describe('14.658 the manual names what sweep 2 added', () => {
  it('14.658 notes on a ticket, restoring a note version, closing several tickets, muting notifications, saved filters, and assigning by email with the guest warning', () => {
    const text = can();
    for (const phrase of [
      // 'notes attached to it' and 'several tickets closed at once' follow Step 4's text verbatim (planner ruling 2026-10-04).
      'notes attached to it', 'earlier version', 'several tickets closed at once', 'how many', 'mute', 'saved filters',
      'by email address', 'asks you first', 'added as a guest', 'only that ticket',
      // FIX 1 (reviewer A, RA-P3): the draft exception the lane added, true at assignee-email.ts:70-71.
      'a draft is the exception', 'cannot be given to someone outside the workspace',
    ]) expect(text, phrase).toContain(phrase);
    // FIX 1 (reviewer A, RA-P1): the "recorded under your name" bullet Step 4 rewrote — the guest grant is recorded, your own
    // settings are not.
    const conn = connecting();
    for (const phrase of ['adding someone as a guest included', 'the exceptions are your own settings', 'changes a preference and leaves no history entry']) {
      expect(conn, phrase).toContain(phrase);
    }
    const found = (q: string) => {
      const r = searchHelp(HELP_CONTENT, q, 50);
      return r.kind === 'matches' && r.matches.some((m) => m.document === 'manual' && m.sectionId === SECTION_ID);
    };
    expect(found('saved filters')).toBe(true);
    expect(found('added as a guest')).toBe(true);
    // CONTROL, same `it`: a phrase the section does not carry is not found there, and the old words are still present.
    expect(found('passkey')).toBe(false);
    expect(text).toContain('exact name');
  });
});
