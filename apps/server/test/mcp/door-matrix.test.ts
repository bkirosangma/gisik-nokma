import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOT_A_MEMBER_REASON, WORKSPACE_RENAME_REASON } from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildDoorWorld, runDoorMatrix, type DoorWorld } from './helpers/door-matrix.js';

/** MCP-everything T3. Case 14.370: the door-matrix helper over three EXISTING tools. */
let db: TestDatabase;
let w: DoorWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  w = await buildDoorWorld(db, '2370');
});
afterAll(async () => {
  await w.app.close();
  await db.drop();
});

describe('14.370 runDoorMatrix', () => {
  it('14.370 a read, a write and a confirm tool: the stranger, the member and the owner are each answered as the spec says', async () => {
    await runDoorMatrix(w, [
      { tool: 'get_project', args: (x) => ({ projectId: x.projectId }), stranger: 'project not found or not visible to you', allowed: { caller: 'member' } },
      {
        tool: 'rename_workspace',
        args: (x) => ({ workspaceId: x.workspaceId, name: 'Door matrix renamed' }),
        stranger: `refused by permission.role: ${NOT_A_MEMBER_REASON}`,
        forbidden: { text: `refused by permission.role: ${WORKSPACE_RENAME_REASON}` },
        allowed: { caller: 'owner', eventType: 'workspace.renamed' },
      },
      {
        tool: 'archive_project',
        args: (x) => ({ projectId: x.projectId, confirm_name: 'Matrix' }),
        stranger: 'project not found or not visible to you',
        allowed: { caller: 'owner', eventType: 'project.archived' },
      },
    ]);
    // CONTROL, same `it`: a row expecting the wrong stranger sentence must fail the helper itself — the wrong
    // sentence is a SUBSTRING of the real one, so a lenient `toContain` comparison would let it through.
    await expect(
      runDoorMatrix(w, [{ tool: 'get_project', args: (x) => ({ projectId: x.projectId }), stranger: 'project not found' }]),
    ).rejects.toThrow();
  });
});
