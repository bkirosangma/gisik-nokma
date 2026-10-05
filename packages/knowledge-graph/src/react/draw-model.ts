import type { GraphItemView } from '@gisik-nokma/domain';
import type { IconSpec, Level } from '../render/node-attributes.js';
import { initialsOf } from '../render/initials.js';

/** `iconOf` (`knowledge-graph-sigma.html:813-814`): no icon in fog, at dot level, or on the centre card (a person's centre keeps its avatar). */
export function iconFor(item: GraphItemView, lv: Level | 'fog', center: boolean): IconSpec | null {
  if (lv === 'fog' || lv === 'dot' || (center && item.kind !== 'person')) return null;
  if (item.kind === 'person') return { kind: 'person', initials: initialsOf(item.label) };
  if (item.kind === 'note') return { kind: 'note' };
  if (item.kind === 'workspace' || item.kind === 'project') return { kind: 'folder' };
  return null;
}
