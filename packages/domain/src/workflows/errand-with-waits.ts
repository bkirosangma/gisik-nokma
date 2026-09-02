import type { WorkflowDef } from '../workflow.js';

/**
 * The errand-with-waits template (spec §4's template gallery; spec §7's
 * dogfooding workflow). Its shape is pinned by Plan 11's checkErrandTemplate,
 * which is the ORACLE — the state ids are the frozen tracker's own lanes, so
 * the Convenience Corner seed maps records onto states one-to-one; every
 * mapped state is reachable in ONE transition from the initial state, so
 * seeding never fabricates intermediate history; and every transition into
 * done carries require-comment. Edit this only with that check green.
 */
export const ERRAND_WITH_WAITS_TEMPLATE: Omit<WorkflowDef, 'id' | 'version'> = {
  name: 'Errand with waits',
  initialStateId: 'later',
  states: [
    { id: 'later', name: 'Later', category: 'open' },
    { id: 'next', name: 'Next', category: 'open' },
    { id: 'in-progress', name: 'In progress', category: 'active' },
    { id: 'waiting', name: 'Waiting', category: 'active', blocked: true },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    // The seed's one-hop paths from the initial state — rule-free except into
    // done, so a seeded record lands on its lane without invented ceremony.
    { from: 'later', to: 'next', rules: [] },
    { from: 'later', to: 'in-progress', rules: [] },
    { from: 'later', to: 'waiting', rules: [] },
    { from: 'later', to: 'done', rules: [{ kind: 'require-comment' }] },
    // The working paths.
    { from: 'next', to: 'in-progress', rules: [] },
    { from: 'next', to: 'waiting', rules: [] },
    { from: 'in-progress', to: 'waiting', rules: [{ kind: 'require-comment' }] },
    { from: 'waiting', to: 'in-progress', rules: [] },
    { from: 'in-progress', to: 'done', rules: [{ kind: 'require-comment' }] },
    { from: 'done', to: 'in-progress', rules: [] },
  ],
};
