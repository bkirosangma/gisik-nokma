// The fixture harness is deliberately NOT re-exported here. It imports
// `node:fs`/`node:path`/`node:url` at module top level, and Plans 6 and 10 run
// this package in the browser entering at `evaluateEvent`. It ships instead as
// the `@gisik-nokma/rule-engine/fixtures` subpath export.
export * from './engine.js';
export { evaluateEvent } from './evaluate.js';
export { REFUSAL_RULES } from './refusal-rules.js';
export { DRAFT_NOT_ALLOWED_RULE } from './checks/drafts.js';
export { DRAFT_LINK_BETWEEN_DRAFTS_REASON, DRAFT_LINK_FORM_RULE } from './checks/links.js';
// wtg2 T8: the forgery guard and the flow's synthetic edge (spec AP-2, PS-11).
export { flowCauseForgery, flowExemptEdge } from './checks/flow-cause.js';
/**
 * **The refusal VOCABULARY — the exact plain-language words this engine refuses
 * with.** Added because its absence was a measured defect, not a tidiness item.
 *
 * `checks/refusals.ts` was reachable from nowhere: this index re-exported ten
 * modules and never it, and
 * `package.json` exposes only `.` and `./fixtures`. So every consumer that wanted
 * a refusal's SENTENCE had to retype it — and three files did, carrying TWO
 * wordings between them (the first two are byte-identical; the count was stated
 * as three until review compared them):
 *
 *   - `app-core/test/flows/guarded-child-event.test.ts` — *"the engine's own
 *     words, copied from `checks/hierarchy.ts`"*
 *   - `app-core/test/views/reopen-flow.test.tsx` — `SERVER_PARENT_TERMINAL_REASON`
 *   - `app-core/test/data-source.test.ts` — `'Parent is Done; …'`, the second
 *     wording, and the only one of the three claiming NO source: a bare `reason:`
 *     key, so a fake's stimulus rather than a false claim
 *
 * None was a sentence this engine can produce, and nothing could see it: each
 * file fed its own constant to a fake and read it back, so the fixture was only
 * ever compared with itself. Cases 7.238/7.239 close the WITNESS half by reading
 * the real sentence off the wire; this export closes the FIXTURE half, so a
 * client fixture cannot silently become a fabrication again.
 *
 * ## What is deliberately NOT exported, and it is the whole argument for the
 * ## shape of this line
 *
 * `refuse()` and `ACCEPT` also live in that module and stay internal. They are
 * how a CHECK constructs its return value; a consumer outside this package has
 * no business minting a `Refusal`, and exporting them would hand every client a
 * way to fabricate a verdict that looks engine-made — the precise failure this
 * export exists to end, re-introduced through the same door. The vocabulary is a
 * fact about what the engine SAYS; `refuse` is machinery for deciding.
 *
 * ## What this export does and does not buy, stated because the difference is
 * ## the one this repo keeps paying for
 *
 * It does NOT make a client test a witness. A client that imports
 * `parentTerminalRefusal` and asserts against it is comparing the function to
 * itself: reword the function and both sides move together, silently. **The
 * reword is caught only by a witness holding a LITERAL over a real round trip**
 * (7.238/7.239), and those cases deliberately keep theirs. What the import buys
 * is that the fixture now carries a value production can actually produce — it
 * removes a class of lie rather than adding a check, and the two jobs belong to
 * two different files.
 *
 * Safe in the browser, unlike `./fixtures`: this module imports two TYPES from
 * `../engine.js` and nothing else — no `node:fs`, no top-level I/O.
 */
export {
  REFUSALS,
  builtinRankRefusal,
  deepestRankParentRefusal,
  fieldKindRefusal,
  labelDuplicateRefusal,
  parentTerminalRefusal,
  rankRefusal,
  reboundSameWorkflowRefusal,
  reboundUnknownStateRefusal,
  reboundUnknownWorkflowRefusal,
  workflowStateNotCreatableRefusal,
} from './checks/refusals.js';
export { evaluateWorkflowDefined } from './workflow-defined.js';
export { evaluateTicketTransitioned } from './transition.js';
// `ContestLookup` needs no line of its own: it is declared in `engine.ts`,
// which the `export *` above already re-exports whole.
export { CONTEST_RULES, evaluateClaimContested, evaluateClaimContestedResolved } from './contests.js';
export { resolveCurrentStateId, resolveStateIdForward } from './version-map.js';
export type { ResolvedState } from './version-map.js';
export { buildMemoryContext, type MemoryContext } from './memory-context.js';
export { evaluateTransitionRules } from './rules/index.js';
export type { RuleEvaluator, TransitionRuleInput } from './rules/types.js';
