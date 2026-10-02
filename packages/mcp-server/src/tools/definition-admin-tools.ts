import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';

/** MCP-everything T12 fills this (`define_workflow`, `define_ticket_type`, `migrate_ticket_type`, `set_visibility`, `update_workspace_settings`). Composed into `allTools` by T3 so the composition never moves again. */
export function definitionAdminTools(_session: Session): ToolDefinition[] {
  return [];
}
