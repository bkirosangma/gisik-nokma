import { ERRAND_WITH_WAITS_TEMPLATE, SIMPLE_KANBAN_TEMPLATE, newUlid, type WorkflowDef } from '@gisik-nokma/domain';
import { layoutDraft } from './layout.js';
import type { WorkflowDraft } from './draft-store.js';

export type WorkflowTemplate = {
  id: 'simple-kanban' | 'errand-with-waits' | 'approval-chain';
  name: string;
  tagline: string;
  def: Omit<WorkflowDef, 'id' | 'version'>;
};

/**
 * Pre-authored, ordinary workflows (spec §4). Cloned — never referenced —
 * so an edited copy can never bleed back into the gallery.
 *
 * The Kanban and errand cards' `def`s are the domain objects themselves,
 * imported: the server founds every workspace on the Kanban template (Plan 4)
 * and the Convenience Corner seed founds the shop's workflow on the errand
 * template (Plan 11), and a gallery copy that merely resembled either would
 * diverge the first time one side was edited, silently. Only approval-chain
 * is declared here — nothing outside this package consumes it.
 */
export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    id: 'simple-kanban',
    name: 'Simple kanban',
    tagline: 'To do, doing, done. No rules — anything moves along the arrows.',
    def: SIMPLE_KANBAN_TEMPLATE,
  },
  {
    id: 'errand-with-waits',
    name: 'Errand with waits',
    tagline:
      'Real-world errands that stall on other people. The waiting state is blocked-flagged so the attention strip sees it; finishing takes a comment saying how it ended.',
    def: ERRAND_WITH_WAITS_TEMPLATE,
  },
  {
    id: 'approval-chain',
    name: 'Approval chain',
    tagline:
      'Draft, submit, approve — with four eyes: whoever submitted cannot be the one who approves.',
    def: {
      name: 'Approval chain',
      initialStateId: 'draft',
      states: [
        { id: 'draft', name: 'Draft', category: 'open' },
        { id: 'submitted', name: 'Submitted', category: 'active' },
        { id: 'approved', name: 'Approved', category: 'terminal' },
      ],
      transitions: [
        { from: 'draft', to: 'submitted', rules: [{ kind: 'restrict-to', assignee: true }] },
        { from: 'submitted', to: 'draft', rules: [{ kind: 'require-comment' }] },
        {
          // Four eyes, and no way round them: Approved is reachable only through
          // Submitted, so the rule always finds an earlier performer to differ
          // from. Adding a draft -> approved fast track would keep this def
          // valid but trip the rdu-bypassable advisory — don't.
          from: 'submitted',
          to: 'approved',
          rules: [{ kind: 'require-different-user', thanActorOf: { to: 'submitted' } }],
        },
        { from: 'approved', to: 'draft', rules: [{ kind: 'require-comment' }] },
      ],
    },
  },
];

export function cloneTemplate(template: WorkflowTemplate): WorkflowDef {
  return { ...structuredClone(template.def), id: newUlid(), version: 1 };
}

export function draftFromTemplate(template: WorkflowTemplate): WorkflowDraft {
  const def = cloneTemplate(template);
  return { def, positions: layoutDraft(def), base: null, selection: { kind: 'none' } };
}
