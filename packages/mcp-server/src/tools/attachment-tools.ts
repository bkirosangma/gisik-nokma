import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';

/** MCP-everything T8 fills this (`list_attachments`, `get_attachment`, `add_attachment`). Composed into `allTools` by T3 so the composition never moves again. */
export function attachmentTools(_session: Session): ToolDefinition[] {
  return [];
}
