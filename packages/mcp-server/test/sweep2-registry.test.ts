import { describe, expect, it } from 'vitest';
import * as pkg from '../src/index.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';
import { TOOL_NAMES } from './fixtures/tool-names.js';

/**
 * MCP sweep 2 T9, case 14.657. The five tools this plan added are in the registry exactly once, directly after the tool each
 * was placed beside, and every one has a description and an object schema. The TOTAL is not asserted here (other plans move it;
 * `register.test.ts` 14.555 pins the whole literal); only this plan's own placements are.
 */
/** [tool, the tool it follows, its input keys sorted]. The keys make "an object schema" a checkable claim: `typeof {}` is 'object' for any schema. */
const PLACED_AFTER: Array<[tool: string, after: string, keys: string[]]> = [
  ['restore_note_version', 'restore_note', ['noteId', 'versionId']],
  ['close_tickets', 'reopen_ticket', ['confirm_count', 'ticketIds', 'workspaceId']],
  ['get_notification_preferences', 'mark_notifications_read', []],
  ['set_notification_preferences', 'get_notification_preferences', ['mute', 'unmute']],
  ['list_saved_filters', 'set_notification_preferences', ['workspaceId']],
];
/** The tools of PLACED_AFTER that are not exactly once, directly after their anchor, in `names`. */
const misplaced = (names: string[]): string[] =>
  PLACED_AFTER.filter(([tool, after]) => names.filter((n) => n === tool).length !== 1 || names.indexOf(tool) !== names.indexOf(after) + 1).map(([tool]) => tool);
const fake = { userId: () => 'u', get: async () => ({}), post: async () => ({}), put: async () => ({}), postEvents: async () => ({}), ...NO_TRANSFER };

describe('14.657 the sweep-2 tools are registered', () => {
  it('14.657 each new tool appears once, right after its anchor, with a description and an object schema; the pin and the registry agree', () => {
    const live = pkg.allTools(fake);
    const names = live.map((t) => t.name);
    expect(names).toEqual(TOOL_NAMES);
    expect(misplaced(names)).toEqual([]);
    for (const [tool, , keys] of PLACED_AFTER) {
      const def = live.find((t) => t.name === tool)!;
      expect(def.description.length, tool).toBeGreaterThan(40);
      expect(Object.keys(def.inputSchema).sort(), tool).toEqual(keys);
    }
    // CONTROL, same `it`: the SAME check reports a tool that is not where it is claimed to be (close_tickets moved to the end).
    // (The old control compared two unrelated indexes and was green with list_saved_filters removed.)
    expect(misplaced([...names.filter((n) => n !== 'close_tickets'), 'close_tickets'])).toEqual(['close_tickets']);
    // The three changed tools keep their old names and places (no rename slipped in).
    for (const kept of ['get_ticket', 'assign_ticket', 'create_ticket']) expect(names, kept).toContain(kept);
  });
});
