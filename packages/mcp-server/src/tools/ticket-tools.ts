import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';

/** MCP-everything T9 fills this (`update_ticket`, `close_ticket`, `reopen_ticket`, `delete_ticket`, `restore_ticket`, `get_ticket_history`, `rank_ticket`). Composed into `allTools` by T3 so the composition never moves again. */
export function ticketTools(_session: Session): ToolDefinition[] {
  return [];
}
