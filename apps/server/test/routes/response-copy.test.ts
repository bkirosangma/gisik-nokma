import { describe, expect, it } from 'vitest';
import { INVITE_NOT_OPENABLE_BODY } from '../../src/routes/invites.js';
import { INVITATION_NOT_YOURS_BODY } from '../../src/routes/my-invitations.js';
import { INVALID_TOKEN_NAME_BODY, mcpTokenNameSchema } from '../../src/routes/mcp-tokens.js';

/**
 * The words a client prints from these routes, read exactly (cases 23.361 and 23.362,
 * `test-cases/23-ux-fixes.md` §23.16). The repo-wide scan for a spaced em dash is 23.360 in
 * `packages/app-core/test/copy/ui-copy.test.ts`; these pin the replacement sentences, so a
 * reworded body fails here rather than drifting from the invite page, the FAQ and the manual.
 */
describe('23.361 the two invitation bodies say the same thing as two sentences', () => {
  it('a dead link and a not-yours invitation both end "Ask whoever invited you for a new one."', () => {
    // Control: the discriminant and the lead sentence are untouched.
    expect(INVITE_NOT_OPENABLE_BODY.error).toBe('not_found');
    expect(INVITATION_NOT_YOURS_BODY.error).toBe('not_found');
    expect(INVITE_NOT_OPENABLE_BODY.message).toBe(
      'This invitation link does not open anything. It may have been used, withdrawn, or lapsed. Ask whoever invited you for a new one.',
    );
    expect(INVITATION_NOT_YOURS_BODY.message).toBe(
      'This invitation is no longer open. It may have been accepted, declined, or withdrawn, or it may have lapsed. Ask whoever invited you for a new one.',
    );
    expect(INVITE_NOT_OPENABLE_BODY.message).not.toContain(' — ');
    expect(INVITATION_NOT_YOURS_BODY.message).not.toContain(' — ');
  });
});

describe('23.362 the token-name refusal carries a colon, not a dash', () => {
  it('a spaces-only name draws the refine message; the body a caller sees is still the fixed one', () => {
    // Control: a real name passes, and a too-long one is refused by the length rule, not the blank rule.
    expect(mcpTokenNameSchema.safeParse('CI').success).toBe(true);
    const long = mcpTokenNameSchema.safeParse('x'.repeat(61));
    expect(long.success).toBe(false);
    expect(long.error?.issues.map((issue) => issue.message)).not.toContain('must not be blank: a name of only spaces names nothing');

    const blank = mcpTokenNameSchema.safeParse('   ');
    expect(blank.error?.issues.map((issue) => issue.message)).toEqual(['must not be blank: a name of only spaces names nothing']);
    expect(INVALID_TOKEN_NAME_BODY.message).toBe('A token name must be 1 to 60 characters and cannot be only spaces.');
  });
});
