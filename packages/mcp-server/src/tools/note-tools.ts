import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';

/** MCP-everything T7 fills this (`list_notes`, `get_note`, `create_note`, `update_note`, `link_note`, `delete_note`, `restore_note`, `get_note_history`). Composed into `allTools` by T3 so the composition never moves again. */
export function noteTools(_session: Session): ToolDefinition[] {
  return [];
}
