import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';

/** MCP-everything T13 fills this (`list_deleted`). Composed into `allTools` by T3 so the composition never moves again. */
export function trashTools(_session: Session): ToolDefinition[] {
  return [];
}
