import type { WorkflowDef } from '@gisik-nokma/domain';

/**
 * Tracker state → errand-with-waits state. 'done' is deliberately absent:
 * the seed never emits a terminal claim (closing a ticket is a human's
 * claim, made in the product, with the comment the workflow demands).
 * The runner treats an unmapped state as a refusal, never a guess.
 */
export const TRACKER_STATE_TO_ERRAND_STATE: Record<string, string> = {
  later: 'later',
  next: 'next',
  'in-progress': 'in-progress',
  blocked: 'waiting',
};

export type TemplateCheck = { ok: true } | { ok: false; problems: string[] };

/**
 * The seed's structural requirements on Plan 8's errand-with-waits
 * template — checked at runtime before any event is built, and pinned by
 * tests against the real template. If Plan 8's payload cannot carry the
 * tracker board, the seed refuses with the problems named; it never
 * "fixes" the shortfall by fabricating intermediate transitions, because
 * each intermediate would be a claim ('was in progress') the record never
 * made.
 *
 * `template` is typed `Omit<WorkflowDef, 'id' | 'version'>` because the
 * real exported template constants (`ERRAND_WITH_WAITS_TEMPLATE`) carry no
 * id or version — only a live, cloned definition does.
 *
 * The fifth check (rule-count on the accepted one-hop transition) is
 * Ruling P29's tripwire: the seed submits a bare `ticket.transitioned {to:
 * target}` with no comment or evidence, so ANY rule on the one-hop
 * transition it relies on would make the real engine refuse the seed's
 * own event at ingest time. `errand-with-waits.ts` deliberately trips two
 * `rule-bypassable` ADVISORIES on `later -> waiting` and `next -> waiting`
 * by that same ruling — correct, and never to be "fixed" on the template
 * itself. This check is what reddens if a copy of the template ever grows
 * a rule on one of those two paths to silence the advisory.
 */
export function checkErrandTemplate(template: Omit<WorkflowDef, 'id' | 'version'>): TemplateCheck {
  const problems: string[] = [];
  const stateIds = new Set(template.states.map((state) => state.id));
  const targets = new Set(Object.values(TRACKER_STATE_TO_ERRAND_STATE));

  for (const target of targets) {
    if (!stateIds.has(target)) problems.push(`missing state '${target}'`);
  }
  for (const target of targets) {
    if (!stateIds.has(target) || target === template.initialStateId) continue;
    const oneHopTransitions = template.transitions.filter(
      (transition) =>
        (transition.from === '*' || transition.from === template.initialStateId) && transition.to === target,
    );
    if (oneHopTransitions.length === 0) {
      problems.push(
        `state '${target}' is not reachable from '${template.initialStateId}' in one transition — the seed will not fabricate intermediate claims`,
      );
      continue;
    }
    for (const transition of oneHopTransitions) {
      if (transition.rules.length !== 0) {
        problems.push(
          `state '${target}' carries rules on its one-hop seeding transition — the seed submits a bare ticket.transitioned with no comment or evidence, so any rule there would make the real engine refuse the seed's own event`,
        );
      }
    }
  }
  const waiting = template.states.find((state) => state.id === 'waiting');
  if (waiting && waiting.blocked !== true) {
    problems.push(`state 'waiting' must carry blocked: true so the attention strip sees waits`);
  }
  for (const transition of template.transitions) {
    if (transition.to === 'done' && !transition.rules.some((rule) => rule.kind === 'require-comment')) {
      problems.push(
        `transition ${transition.from}→done lacks require-comment — closing an errand must say what happened (the record's "append dated lines" discipline)`,
      );
    }
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true };
}

/** Templates are ordinary pre-authored workflows, cloned (spec §4). */
export function workflowFromTemplate(template: Omit<WorkflowDef, 'id' | 'version'>, workflowId: string): WorkflowDef {
  return { ...template, id: workflowId, version: 1 };
}
