import { describe, expect, it } from 'vitest';
import { readPlanSeries } from '../../src/seed/plan-series.js';

const plansDir = new URL('../../../../docs/superpowers/plans', import.meta.url).pathname;

describe('readPlanSeries — the plan documents are the record', () => {
  /**
   * 13.92 — readPlanSeries reads the full eleven-plan series (01-11),
   * skipping the 00 coordination doc.
   */
  it('reads the full series, skipping the coordination doc', () => {
    const docs = readPlanSeries(plansDir);
    expect(docs).toHaveLength(11);
    expect(docs.map((doc) => doc.planNumber)).toEqual([
      '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11',
    ]);
    expect(docs.some((doc) => doc.planNumber === '00')).toBe(false);
  });

  /**
   * 13.93 — every plan document has a non-empty verbatim H1 title, a goal,
   * and at least one non-empty task title.
   */
  it('every plan has a verbatim H1 title, a goal, and at least one task', () => {
    for (const doc of readPlanSeries(plansDir)) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.title).not.toContain('#');
      expect(doc.goal).not.toBeNull();
      expect(doc.tasks.length).toBeGreaterThan(0);
      for (const task of doc.tasks) {
        expect(task.title.length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * 13.94 — readPlanSeries reads this very plan's own tasks — plan 11's
   * title contains "Deployment" and it has at least 16 tasks.
   */
  it('reads this very plan’s tasks (the seed will hold the plan that created it)', () => {
    const docs = readPlanSeries(plansDir);
    const eleven = docs.find((doc) => doc.planNumber === '11');
    expect(eleven?.title).toContain('Deployment');
    expect(eleven?.tasks.length).toBeGreaterThanOrEqual(16);
  });
});
