import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';

/** MCP-everything T11 fills this (`manage_members`, `change_prefix`, `manage_groups`). Composed into `allTools` by T3 so the composition never moves again. */
export function memberAdminTools(_session: Session): ToolDefinition[] {
  return [];
}
