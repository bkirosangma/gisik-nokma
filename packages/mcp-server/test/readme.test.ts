import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** MCP sweep 2 T9, case 14.658. The README lists the tools this plan added or changed. */
const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

describe('14.658 the README names the sweep-2 tools', () => {
  it('14.658 the five new tools and the three changed ones are named, with the confirmation said in a sentence', () => {
    // `notesTotal` and `confirm_count` stand for the changed `get_ticket` and the count confirmation: the three changed tools' NAMES
    // were already in the README before this plan, so naming them proves nothing.
    for (const tool of ['restore_note_version', 'close_tickets', 'get_notification_preferences', 'set_notification_preferences', 'list_saved_filters', 'assignee_email', 'confirm_assignee', 'notesTotal', 'confirm_count']) {
      expect(README, tool).toContain(tool);
    }
    expect(README).toMatch(/added as a guest/i);
    // CONTROL, same `it`: the file read is this package's README (an absent made-up name proved nothing about which file was read).
    expect(README).toContain('## What the assistant can then do');
  });
});
