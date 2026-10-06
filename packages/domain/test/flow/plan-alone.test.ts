import { describe, expect, it } from 'vitest';
import { planAlone, planFlow, type FlowNode, type NodePlan } from '../../src/index.js';
import { decision, fnode, uid } from './fixtures.js';

/**
 * 29.295 (owner ruling (c), wtg4 T1): the Timeline plans an edgeless component with `planAlone` instead of `planFlow`. The
 * two must answer the same for EVERY node shape a lone ticket can have, so this compares them over the grid of what
 * `firstPass` / `laterPass` / the `unscheduled` and `onTimeline` rules branch on: start, due (before, at and after the
 * start, across a month end), estimate, rework estimate, rounds 1-3, no / an open / a closed period, task and Decision.
 */
const STARTS = [null, '2026-10-30'];
const DUES = [null, '2026-10-29', '2026-10-30', '2026-11-02'];
const ESTIMATES = [null, 1, 4];
const REWORK = [null, 2];
const ROUNDS = [1, 2, 3];
const PERIODS: FlowNode['periods'][] = [
  [],
  [{ start: '2026-10-01T04:00:00.000Z', end: null, pass: 1 }],
  [{ start: '2026-10-01T04:00:00.000Z', end: '2026-10-04T19:00:00.000Z', pass: 1 }],
];

function grid(): FlowNode[] {
  const out: FlowNode[] = [];
  let n = 0;
  for (const explicitStart of STARTS)
    for (const explicitDue of DUES)
      for (const estimate of ESTIMATES)
        for (const reworkEstimate of REWORK)
          for (const rounds of ROUNDS)
            for (const periods of PERIODS)
              for (const asDecision of [false, true]) {
                n += 1;
                const over = { explicitStart, explicitDue, estimate, reworkEstimate, rounds, periods };
                out.push(
                  asDecision
                    ? decision(uid(n), { ...over, outcome: 'Yes', passes: [{ pass: 1, outcome: 'Yes', by: uid(900), at: '2026-10-02T04:00:00.000Z', revisions: [] }] })
                    : fnode(uid(n), over),
                );
              }
  return out;
}

describe('29.295 planAlone is planFlow for a node with no edge', () => {
  it('29.295 every shape of a lone node plans the same both ways; control: the grid reaches every reason and both onTimeline arms', () => {
    const nodes = grid();
    const pairs = nodes.map((node) => ({ node, alone: planAlone(node), flow: planFlow({ nodes: [node], edges: [] }).get(node.id) as NodePlan }));
    for (const { node, alone, flow } of pairs) expect(alone, JSON.stringify(node)).toEqual(flow);
    // CONTROL: the grid is not a set of identical quiet nodes. Each arm the rules branch on is reached:
    const plans = pairs.map((p) => p.flow);
    expect(new Set(plans.map((p) => p.unscheduled))).toEqual(new Set([null, 'start-after-due', 'no-dates']));
    expect(plans.some((p) => p.intervals.length > 0 && p.unscheduled === 'no-dates')).toBe(true); // a dated pass 1, a later pass from nothing (rounds >= 2)
    expect(plans.some((p) => p.intervals.length === 0 && p.onTimeline)).toBe(true); // drawn by its periods alone
    expect(plans.some((p) => p.intervals.length === 0 && !p.onTimeline)).toBe(true);
    expect(new Set(plans.flatMap((p) => p.intervals.map((i) => i.end)))).toContain('2026-11-02'); // a span across the month end
    expect(plans.some((p) => p.intervals.some((i) => i.start === '2026-10-30' && i.end === '2026-11-02'))).toBe(true);
  });

  it('29.295 the answer is a lone node’s own dates, never a chained day; control: the same node fed by an edge is chained', () => {
    const lone = fnode(uid(1), { estimate: 2 });
    expect(planAlone(lone)).toEqual({ intervals: [], unscheduled: 'no-dates', onTimeline: false });
    const dated = fnode(uid(2), { explicitStart: '2026-10-05', explicitDue: '2026-10-07' });
    expect(planAlone(dated)).toEqual({ intervals: [{ pass: 1, start: '2026-10-05', end: '2026-10-07', basis: 'explicit' }], unscheduled: null, onTimeline: true });
    // control: with a predecessor the estimate-only node IS planned (chained), so the empty answer above is about being alone
    const fed = planFlow({ nodes: [dated, lone], edges: [{ sourceId: dated.id, targetId: lone.id, label: null }] }).get(lone.id);
    expect(fed?.intervals).toEqual([{ pass: 1, start: '2026-10-08', end: '2026-10-09', basis: 'chained' }]);
  });
});
