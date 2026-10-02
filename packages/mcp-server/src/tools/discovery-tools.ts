import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';

/** MCP-everything T10 fills this (`list_ticket_types`, `list_workflows`, `my_work`, `get_attention`, `list_notifications`, `mark_notifications_read`, `list_my_invitations`, `respond_to_invitation`). Composed into `allTools` by T3 so the composition never moves again. */
export function discoveryTools(_session: Session): ToolDefinition[] {
  return [];
}
