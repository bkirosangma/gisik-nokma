import { describe, expect, it } from 'vitest';
import * as pkg from '../src/index.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';
import { TOOL_NAMES } from './fixtures/tool-names.js';

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
    // the tools in their pinned order (`test/fixtures/tool-names.ts`, MCP-everything T3 case 14.366).
    const fake = { userId: () => 'u', get: async () => ({}), post: async () => ({}), postEvents: async () => ({}), ...NO_TRANSFER };
    expect(pkg.allTools(fake).map((t) => t.name)).toEqual(TOOL_NAMES);
  });
});
