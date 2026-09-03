import type { WorkflowDef } from '../workflow.js';

/**
 * The errand-with-waits template (spec §4's template gallery; spec §7's
 * dogfooding workflow). Its shape is pinned by Plan 11's checkErrandTemplate,
 * which is the ORACLE — the state ids are the frozen tracker's own lanes, so
 * the Convenience Corner seed maps records onto states one-to-one; every
 * mapped state is reachable in ONE transition from the initial state, so
 * seeding never fabricates intermediate history; and every transition into
 * done carries require-comment. Edit this only with that check green.
 *
 * IT TRIPS `rule-bypassable` TWICE, AND THAT IS EXPECTED — RULING P29
 * (owner-approved, 2026-09-03). `require-comment` guards `in-progress -> waiting`
 * while `later -> waiting` and `next -> waiting` enter the same state carrying no
 * such rule, so `adviseWorkflowDef` reports two bypasses. **Do not "fix" this
 * template, and do not weaken `adviseWorkflowDef` or `checkErrandTemplate` to
 * silence it.** Both are correct: the advisory is right that the guard is
 * skippable, and the template is right to keep those paths rule-free, because
 * they are the one-hop seeding paths the oracle pins.
 *
 * The ruling's reasoning, recorded here because the next reader will meet the
 * warning before they meet the ruling: `rule-bypassable` is ADVISORY ONLY and
 * never blocks publishing, so this costs nothing functionally. And this template
 * exists to digitize a real shop's actual workflow, warts included — Plan 11
 * Task 8's framing is "frozen record in, events out, nothing invented".
 * Sanitizing it to clear an advisory panel would mean inventing a cleaner
 * reality than the one being recorded, which is precisely what importing it by
 * identity exists to prevent. **Scoped to this one frozen template — it is not a
 * carve-out for `rule-bypassable` anywhere else.**
 *
 * A LIVE WORKFLOW IS NEVER THIS CONSTANT, so an admin is not stuck with the
 * warning. The type says so: `Omit<WorkflowDef, 'id' | 'version'>` lacks exactly
 * the two fields a real definition needs, so nothing can publish this object —
 * every live def is a COPY that acquired its own id and version.
 * `cloneTemplate` (app-core) does it with `structuredClone` + `newUlid()` +
 * `version: 1`, and Plan 11's seed emits a `workflow.defined` whose payload
 * carries its own id. So the shop's admin can edit their own live copy in the
 * builder later — guard the two paths, or accept them — and neither this
 * constant nor the oracle is touched by that.
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
