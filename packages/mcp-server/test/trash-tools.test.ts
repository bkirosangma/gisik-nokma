import { describe, expect, it } from 'vitest';
import type { Session } from '../src/session.js';
import { trashTools } from '../src/tools/trash-tools.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

const items = [
  { kind: 'ticket', id: 't1', workspaceId: 'w1', label: 'CCSO-4 Chiller', deletedAt: '2026-10-01T00:00:00Z' },
  { kind: 'note', id: 'n1', workspaceId: 'w1', label: 'Cold room', deletedAt: '2026-10-01T00:00:00Z' },
  { kind: 'project', id: 'p1', workspaceId: 'w2', label: 'Stock', deletedAt: '2026-10-01T00:00:00Z' },
  { kind: 'workspace', id: 'w3', workspaceId: 'w3', label: 'Old Co', deletedAt: '2026-10-01T00:00:00Z' },
];
const asked: string[] = [];
const session: Session = {
  userId: () => 'u',
  get: async (path) => {
    asked.push(path);
    return { items };
  },
  post: async () => ({}),
  postEvents: async () => ({}),
  ...NO_TRANSFER,
};
const listDeleted = trashTools(session).find((t) => t.name === 'list_deleted')!;

describe('14.551 list_deleted', () => {
  it('14.551 filters by workspace and kind and names the restoring tool', async () => {
    const all = (await listDeleted.handler({})) as { items: Array<{ id: string; restoreWith: string }> };
    expect(all.items).toHaveLength(4); // control: no filter → every item
    expect(all.items.map((i) => [i.id, i.restoreWith])).toEqual([
      ['t1', 'restore_ticket'], ['n1', 'restore_note'], ['p1', 'undelete_project'], ['w3', 'undelete_workspace'],
    ]);
    expect(await listDeleted.handler({ workspaceId: 'w1', kinds: ['note'] })).toEqual({
      items: [{ ...items[1], restoreWith: 'restore_note' }],
      nextCursor: null,
    });
    const byWorkspace = (await listDeleted.handler({ workspaceId: 'w1' })) as { items: Array<{ id: string }> };
    expect(byWorkspace.items.map((i) => i.id)).toEqual(['t1', 'n1']);
    const byKinds = (await listDeleted.handler({ kinds: ['project', 'workspace'] })) as { items: Array<{ id: string }> };
    expect(byKinds.items.map((i) => i.id)).toEqual(['p1', 'w3']);
    expect(asked.every((p) => p === '/v1/me/deleted-items')).toBe(true);
  });

  it('14.551 pages with cursor and limit', async () => {
    const first = (await listDeleted.handler({ limit: 3 })) as { items: unknown[]; nextCursor: string | null };
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    const rest = (await listDeleted.handler({ limit: 3, cursor: first.nextCursor })) as { items: unknown[]; nextCursor: string | null };
    expect(rest.items).toHaveLength(1);
    expect(rest.nextCursor).toBeNull();
  });
});
