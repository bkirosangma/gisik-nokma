import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';

/** MCP-everything T6 fills this (`list_comments`, `edit_comment`, `delete_comment`). Composed into `allTools` by T3 so the composition never moves again. */
export function commentTools(_session: Session): ToolDefinition[] {
  return [];
}
