import { describe, expect, it } from 'vitest';
import { OUTSIDER_JOINS_AS_GUEST, OUTSIDER_NOT_FOUND, alreadyInWorkspaceLine } from '@gisik-nokma/app-core';
import { allTools, HttpError, type Session } from '@gisik-nokma/mcp-server';

/**
 * MCP sweep 2 T7, case 14.651. The MCP keeps its own copies of the app's two product sentences (the package must not depend
 * on app-core); this compares what the TOOL says with what the APP exports, so a rewording on either side fails here.
 * Needs app-core BUILT (`pnpm --filter @gisik-nokma/app-core build`).
 */
const detail = { key: 'CCSO-4', title: 'Fix login', ticketState: { fields: {}, workflowId: 'wf' }, rollup: null };
function sessionFor(user: { userId: string; name: string; email: string; inWorkspace: boolean } | null): Session {
  const unavailable = async () => { throw new Error('not stubbed'); };
  return {
    userId: () => '01J0A5ER0000000000000000AA',
    get: async (path) => { if (path.endsWith('/tickets/T1')) return detail; throw new HttpError(404, {}); },
    post: async (path) => { if (path.endsWith('/people-lookup')) return { user }; throw new HttpError(404, {}); },
    put: unavailable, postEvents: unavailable, getBytes: unavailable, postMultipart: unavailable,
  };
}
const assign = (session: Session, extra: Record<string, unknown> = {}) =>
  allTools(session).find((t) => t.name === 'assign_ticket')!.handler({ workspaceId: 'W1', ticketId: 'T1', assignee_email: 'x@example.com', ...extra });

describe('the sentences the assistant shows are the app\'s', () => {
  it('14.651 the guest sentence, the "already in this workspace" line and the miss are byte-identical to app-core\'s exports', async () => {
    expect(OUTSIDER_JOINS_AS_GUEST.length).toBeGreaterThan(10); // the comparison is not of two empty strings
    expect(OUTSIDER_NOT_FOUND.length).toBeGreaterThan(5);
    const outside = (await assign(sessionFor({ userId: 'U9', name: 'Ravi Menon', email: 'ravi@example.com', inWorkspace: false }))) as { wouldChange: string };
    expect(outside.wouldChange.endsWith(OUTSIDER_JOINS_AS_GUEST)).toBe(true);
    const inside = (await assign(sessionFor({ userId: 'U8', name: 'Asha Rao', email: 'asha@example.com', inWorkspace: true }))) as { wouldChange: string };
    expect(inside.wouldChange.endsWith(alreadyInWorkspaceLine('Asha Rao'))).toBe(true);
    await expect(assign(sessionFor(null))).rejects.toThrow(new RegExp(`^${OUTSIDER_NOT_FOUND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    // CONTROL, same `it`: the check can fail — the tool's inside sentence is not the guest one.
    expect(inside.wouldChange.includes(OUTSIDER_JOINS_AS_GUEST)).toBe(false);
  });
});
