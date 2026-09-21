import { describe, expect, it } from 'vitest';
import { PROJECT_LINE_CAP, projectCountLine, projectLine } from '../src/workspace-viewer.js';

// Case 13.405 (test-cases/13-deployment-dogfooding.md) — projectLine's
// truncation boundary (at the cap, over the cap, the withheld suffix) and
// projectCountLine's singular/plural/zero rule. Minted by the
// workspaces-prototype-port plan's Task 10, catalogue consolidation.

describe('projectCountLine — the card meta line', () => {
  it('says "1 project" in the singular, which a plural-only implementation cannot', () => {
    expect(projectCountLine(1)).toBe('1 project');
  });

  it('pluralises above one', () => {
    expect(projectCountLine(4)).toBe('4 projects');
  });

  // Zero SAYS SO (E5-36), and the rule it used to borrow does not reach here:
  // `restrictedLine`'s zero rule is about a person with nothing withheld being
  // told about withholding, and this line carries no withholding. What `null`
  // bought was a founder's fresh card — avatar, name, chips, "You're an owner
  // here." — with no mention of projects and no pointer to the New-project form.
  // A withheld viewer never reaches this: the caller gates on it.
  it('says an absence at zero rather than omitting the line', () => {
    expect(projectCountLine(0)).toBe('No projects yet');
  });
});

describe('projectLine — names joined, then truncated', () => {
  const four = ['Delivery', 'Site readiness', 'Winter stock', 'Payroll'];

  it('joins every name when there are no more than the cap', () => {
    expect(projectLine(['Delivery', 'Site readiness'], false)).toBe('Delivery · Site readiness');
  });

  it('joins exactly the cap without a suffix — the boundary a cap-off-by-one gets wrong', () => {
    expect(projectLine(four.slice(0, PROJECT_LINE_CAP), false)).toBe(
      'Delivery · Site readiness · Winter stock',
    );
  });

  it('truncates past the cap and COUNTS the remainder', () => {
    expect(projectLine(four, false)).toBe('Delivery · Site readiness · Winter stock · +1 more');
  });

  /**
   * 13.380 is named "a guest card shows one 'Restricted' chip and no number
   * anywhere", so the suffix cannot carry a count when counts are withheld.
   * The names themselves still render — a guest sees the projects handed to
   * them by name; it is the NUMBERS that are withheld.
   */
  it('drops the number from the suffix when counts are withheld', () => {
    expect(projectLine(four, true)).toBe('Delivery · Site readiness · Winter stock · and more');
  });

  it('is unaffected by withholding when nothing is truncated', () => {
    expect(projectLine(['Delivery'], true)).toBe('Delivery');
  });

  it('renders nothing when no project can be named', () => {
    expect(projectLine([], false)).toBeNull();
    expect(projectLine([], true)).toBeNull();
  });
});
