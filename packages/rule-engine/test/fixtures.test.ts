import { describe, expect, it } from 'vitest';
import { evaluateEvent } from '../src/index.js';
import { assertFixtureOutcome, buildInMemoryContext, completeCandidate, loadFixtures } from '../src/fixtures/harness.js';

const fixtures = loadFixtures();

/**
 * 4.34 — advisories never gate publish: a definition that trips only `rdu-bypassable` is ACCEPTED by the engine. Proven by the fixture `workflow-defined-accepts-a-def-the-advisory-warns-about.json`, which this loop executes by name — the acceptance lives here rather than in `advise-workflow.test.ts`, which only asserts that the advisory is emitted.
 */
/**
 * 5.14 — every fixture in packages/rule-engine/fixtures/ runs as its own it(fx.name) test in this one file, auditing that each refusal fixture has an accepting twin directly off the directory rather than via a single generic property test.
 */
/**
 * 4.2 — Duplicate state ids are refused at publish. Proven by the fixture `workflow-defined-refuses-duplicate-state-ids.json` (refused/workflow-structure), which this loop executes as its own it(fx.name).
 */
/**
 * 4.3 — A workflow with no terminal state is refused at publish. Proven by the fixture `workflow-defined-refuses-no-terminal-state.json` (refused/workflow-structure), which this loop executes as its own it(fx.name).
 */
/**
 * 4.4 — A transition referencing an unknown state is refused at publish. Proven by the fixture `workflow-defined-refuses-unknown-transition-state.json` (refused/workflow-structure), which this loop executes as its own it(fx.name).
 */
/**
 * 4.8 — A restrict-to naming nobody is refused at publish. Proven by the fixture `workflow-defined-refuses-empty-restrict-to.json` (refused/workflow-structure), which this loop executes as its own it(fx.name).
 */
/**
 * 4.9 — A require-different-user watching a nonexistent transition is refused at publish. Proven by the fixture `workflow-defined-refuses-rdu-unknown-state.json` (refused/workflow-structure), which this loop executes as its own it(fx.name).
 */
/**
 * 4.10 — A brand-new workflow must publish as version 1. Proven by the fixture `workflow-defined-refuses-a-first-version-other-than-1.json` (refused/workflow-version), which this loop executes as its own it(fx.name).
 */
/**
 * 4.11 — Versions are consecutive; jumps are refused. Proven by the fixture `workflow-defined-refuses-a-version-jump.json` (refused/workflow-version), which this loop executes as its own it(fx.name).
 */
/**
 * 4.12 — Dropping a state without a stateMapping entry is refused. Proven by the fixture `workflow-defined-refuses-dropped-state-without-mapping.json` (refused/workflow-state-mapping), which this loop executes as its own it(fx.name).
 */
/**
 * 4.13 — A stateMapping target must exist in the new version. Proven by the fixture `workflow-defined-refuses-mapping-to-unknown-state.json` (refused/workflow-state-mapping), which this loop executes as its own it(fx.name).
 */
/**
 * 4.14 — Only dropped states may be remapped. Proven by the fixture `workflow-defined-refuses-mapping-for-surviving-state.json` (refused/workflow-state-mapping), which this loop executes as its own it(fx.name).
 */
/**
 * 4.15 — A complete mapping publishes; a display-name-only rename needs no mapping. Proven by the fixtures `workflow-defined-accepts-a-rename-only-v2.json` (accepted), `workflow-defined-accepts-v2-with-complete-mapping.json` (accepted), which this loop executes as its own it(fx.name).
 */
/**
 * 4.16 — Envelope hygiene: wrong entity kind, entity/payload id mismatch, and unparseable payloads refuse. Proven by the fixtures `workflow-defined-refuses-entity-id-mismatch.json` (refused/malformed-payload), `workflow-defined-refuses-malformed-payload.json` (refused/malformed-payload), `workflow-defined-refuses-wrong-entity-kind.json` (refused/malformed-payload), which this loop executes as its own it(fx.name).
 */
/**
 * 4.17 — A move on an unknown ticket, an unpublished workflow, or to an unknown state refuses with the missing thing named. Proven by the fixtures `transition-refuses-unknown-target-state.json` (refused/unknown-state), `transition-refuses-unknown-ticket.json` (refused/unknown-ticket), `transition-refuses-unknown-workflow.json` (refused/unknown-workflow), which this loop executes as its own it(fx.name).
 */
/**
 * 4.18 — A move along an edge the workflow lacks refuses naming both states; declared edges accept. Proven by the fixtures `transition-accepts-a-declared-edge.json` (accepted), `transition-refuses-an-edge-the-workflow-lacks.json` (refused/illegal-transition), which this loop executes as its own it(fx.name).
 */
/**
 * 4.19 — A from-any edge is usable from every state. Proven by the fixture `transition-accepts-a-from-any-edge.json` (accepted), which this loop executes as its own it(fx.name).
 */
/**
 * 4.20 — A ticket from an older version follows stateMappings forward; with no covering mapping it refuses as stranded rather than guessing. Proven by the fixtures `transition-accepts-across-versions-via-mapping.json` (accepted), `transition-refuses-a-stranded-ticket.json` (refused/stranded-state), which this loop executes as its own it(fx.name).
 */
/**
 * 4.21 — Transition envelope hygiene: wrong entity kind and unparseable payloads refuse. Proven by the fixtures `transition-refuses-malformed-payload.json` (refused/malformed-payload), `transition-refuses-wrong-entity-kind.json` (refused/malformed-payload), which this loop executes as its own it(fx.name).
 */
/**
 * 4.22 — Event types the engine does not handle pass through untouched. Proven by the fixture `pass-through-accepts-unhandled-event-types.json` (accepted), which this loop executes as its own it(fx.name).
 */
/**
 * 4.23 — A parent cannot enter a terminal state while any child is non-terminal — open or active alike; it may once every child is terminal. Proven by the fixtures `invariant-accepts-terminal-parent-when-children-are-terminal.json` (accepted), `invariant-refuses-terminal-parent-with-active-child.json` (refused/parent-terminal-with-open-children), `invariant-refuses-terminal-parent-with-open-child.json` (refused/parent-terminal-with-open-children), which this loop executes as its own it(fx.name).
 */
/**
 * 4.29 — Rules run in authored order and the first refusal wins — proven with the same violated pair in both orders. Proven by the fixtures `rules-first-refusal-wins.json` (refused/require-comment), `rules-order-comes-from-the-definition.json` (refused/require-evidence), which this loop executes as its own it(fx.name).
 */
/**
 * 4.35 — Four-eyes survives a state being dropped and remapped in a later version: a log entry written under the old vocabulary is resolved forward before comparison, so the same person cannot make both moves. Proven by the fixture `rule-rdu-refuses-across-a-remap.json` (refused/require-different-user), which this loop executes as its own it(fx.name).
 */
/**
 * 4.37 — A transition-log entry recorded under a workflow the ticket has since been migrated off is ignored, even when both workflows spell the watched state the same way — four-eyes answers only for the workflow the ticket is on. Proven by the fixture `rule-rdu-ignores-an-entry-from-a-workflow-the-ticket-has-left.json` (accepted), which this loop executes as its own it(fx.name).
 */
/**
 * 4.49 — Advisories still never gate publish under the generalised code: a definition that trips only `rule-bypassable` is accepted by the engine. Proven by the fixture `workflow-defined-accepts-a-def-the-guard-advisory-warns-about.json` (accepted), which this loop executes as its own it(fx.name).
 */
/**
 * 4.50 — Rules on a from-any edge are enforced, not merely legal: with no exact edge to the target the wildcard edge is the one that resolves, and its own restrict-to refuses the move. The suite's first witness of wildcard-edge rule enforcement. Proven by the fixture `rule-restrict-to-refuses-through-a-from-any-edge.json` (refused/restrict-to), which this loop executes as its own it(fx.name).
 */
describe('planted-defect fixtures', () => {
  // The count gate `loadFixtures` names as its compensating control for the
  // non-recursive scan: a fixture filed into a subdirectory, or saved with the
  // wrong extension, is silently skipped, and only an exact count catches it.
  // Bump this number in the SAME COMMIT as any fixture addition or removal —
  // a gate that lags its directory is a gate that has been turned off.
  it('every fixture in the directory loads — exactly 86', () => {
    expect(fixtures).toHaveLength(86);
  });

  for (const fx of fixtures) {
    it(fx.name, async () => {
      const result = await evaluateEvent(completeCandidate(fx), buildInMemoryContext(fx));
      assertFixtureOutcome(result, fx);
    });
  }
});
