// The fixture harness is deliberately NOT re-exported here. It imports
// `node:fs`/`node:path`/`node:url` at module top level, and Plans 6 and 10 run
// this package in the browser entering at `evaluateEvent`. It ships instead as
// the `@gisik-nokma/rule-engine/fixtures` subpath export.
export * from './engine.js';
export { evaluateEvent } from './evaluate.js';
export { REFUSAL_RULES } from './refusal-rules.js';
export { evaluateWorkflowDefined } from './workflow-defined.js';
export { evaluateTicketTransitioned } from './transition.js';
// `ContestLookup` needs no line of its own: it is declared in `engine.ts`,
// which the `export *` above already re-exports whole.
export { CONTEST_RULES, evaluateClaimContested, evaluateClaimContestedResolved } from './contests.js';
export { resolveCurrentStateId, resolveStateIdForward } from './version-map.js';
export type { ResolvedState } from './version-map.js';
export { evaluateTransitionRules } from './rules/index.js';
export type { RuleEvaluator, TransitionRuleInput } from './rules/types.js';
