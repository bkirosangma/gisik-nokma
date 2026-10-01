import { describe, expect, it } from 'vitest';
import * as pkg from '../src/index.js';

/**
 * Hosted MCP plan, Task 6. Case 14.250.
 *
 * The hosted `/mcp` route (`apps/server/src/routes/mcp-http.ts`) imports the
 * tool registration from the PACKAGE ROOT, so the stdio server and the hosted
 * one run the same tools from the same code. Anything the route needs
 * that the index does not export would force a deep import or a second copy.
 */
describe('14.250 package exports', () => {
  it('14.250 registerTools, allTools, lazySession are exported', () => {
    expect(typeof pkg.registerTools).toBe('function');
    expect(typeof pkg.allTools).toBe('function');
    expect(typeof pkg.lazySession).toBe('function');
    // CONTROL, same `it`: the export is not merely present, it is THE registry —
    // the tools in their pinned order (the order `register.test.ts` pins).
    const fake = { userId: () => 'u', get: async () => ({}), post: async () => ({}), postEvents: async () => ({}) };
    expect(pkg.allTools(fake).map((t) => t.name)).toEqual([
      'search_tickets',
      'list_tickets',
      'get_ticket',
      'create_ticket',
      'transition_ticket',
      'add_comment',
      'assign_ticket',
      'list_workspaces',
      'get_workspace',
      'create_workspace',
      'rename_workspace',
      'archive_workspace',
      'restore_workspace',
      'delete_workspace',
      'undelete_workspace',
      'list_projects',
      'get_project',
      'create_project',
      'update_project',
      'archive_project',
      'restore_project',
      'delete_project',
      'undelete_project',
    ]);
  });
});
