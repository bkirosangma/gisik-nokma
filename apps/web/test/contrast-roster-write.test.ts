import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

/**
 * Cases 23.357-23.359 (neo F-11). The non-text-contrast roster is a MEASUREMENT stamped with the commit that made it,
 * so the sweep must not rewrite it as a side effect of a run: a run on a dirty tree, or on a stack built from another
 * branch, would leave it modified with the wrong `headSha`. `viewport.spec.ts` needs a live stack, so this reads its
 * syntax tree: where `writeFileSync` sits, and what the branch that does not write does instead.
 */
const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

type Placement = 'unguarded' | 'then-of-flag' | 'else-of-flag';

/** Every `writeFileSync(<first arg>)` in the source, and whether an `UPDATE_ROSTER` `if` decides it. */
function writePlacements(source: string): { arg: string; placement: Placement }[] {
  const sf = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: { arg: string; placement: Placement }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(sf) === 'writeFileSync') {
      let placement: Placement = 'unguarded';
      for (let child: ts.Node = node, up = node.parent; up; child = up, up = up.parent) {
        if (ts.isIfStatement(up) && up.expression.getText(sf).includes('UPDATE_ROSTER')) {
          placement = up.thenStatement === child ? 'then-of-flag' : up.elseStatement === child ? 'else-of-flag' : 'unguarded';
          break;
        }
      }
      out.push({ arg: node.arguments[0]?.getText(sf) ?? '', placement });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const SPEC = read('../e2e-stack/viewport.spec.ts');

describe('23.357 the roster is written only under UPDATE_ROSTER=1', () => {
  it('control: the placement reader tells a bare write, a flagged write and a write in the flag\'s else apart', () => {
    const flag = "process.env['UPDATE_ROSTER'] === '1'";
    expect(writePlacements('writeFileSync(u, s);')).toEqual([{ arg: 'u', placement: 'unguarded' }]);
    expect(writePlacements(`if (${flag}) { writeFileSync(u, s); }`)).toEqual([{ arg: 'u', placement: 'then-of-flag' }]);
    expect(writePlacements(`if (${flag}) { a(); } else { writeFileSync(u, s); }`)).toEqual([{ arg: 'u', placement: 'else-of-flag' }]);
    expect(writePlacements("if (process.env['OTHER'] === '1') { writeFileSync(u, s); }")).toEqual([{ arg: 'u', placement: 'unguarded' }]);
  });

  it('the spec writes the roster in the flag\'s then-branch and nowhere else', () => {
    const roster = writePlacements(SPEC).filter((w) => w.arg === 'rosterUrl');
    expect(roster).toEqual([{ arg: 'rosterUrl', placement: 'then-of-flag' }]);
    expect(SPEC).toContain("const rosterUrl = new URL('./non-text-contrast-roster.json', import.meta.url);");
  });
});

describe('23.358 without the flag the run compares, and a difference fails with the way out', () => {
  it('control: the else-branch is the one that reads the file; the failure names the flag and says what differs; UPDATE_ROSTER writes the whole measurement', () => {
    expect(SPEC).toContain("readFileSync(rosterUrl, 'utf8')");
    expect(SPEC).toContain('roster differs, ');
    expect(SPEC).toContain('re-run with UPDATE_ROSTER=1 on a clean tree and COMMIT the file');
    // `measured` is what UPDATE_ROSTER=1 writes: every key, never the stamp that differs on every run.
    const from = SPEC.indexOf('const measured = {');
    const compared = SPEC.slice(from, SPEC.indexOf('\n  };', from));
    for (const key of ['belowCount', 'exemptions', 'totalClasses', 'examined', 'highestReading', 'routes', 'roster', 'sanctionedWaivers']) {
      expect(compared).toContain(key);
    }
    for (const stamp of ['headSha', 'producedAt', 'treeWasClean']) expect(compared).not.toContain(stamp);
  });

  it('only the data-independent VERDICT keys can fail the compare; examined, totalClasses and the full roster cannot (F-11 FIX 1)', () => {
    // Control: the slice is the real `verdictOf` body, so a key named in it is a key compared.
    const from = SPEC.indexOf('const verdictOf = (');
    expect(from).toBeGreaterThan(0);
    const verdict = SPEC.slice(from, SPEC.indexOf('\n    });', from));
    expect(verdict).toContain('belowCount: m.belowCount');
    for (const key of ['belowCount', 'below:', 'exemptions', 'routes', 'sanctionedWaivers']) expect(verdict).toContain(key);
    // The below-3:1 entries come from the roster by a filter; the whole roster is not a key.
    expect(verdict).toContain('m.roster.filter((r) => r.ratio < 3)');
    for (const key of ['examined', 'totalClasses', 'highestReading', 'roster:']) expect(verdict).not.toContain(key);
    // Their drift is reported, not failed.
    expect(SPEC).toContain("type: 'roster-drift'");
  });
});

describe('23.359 CI does not rely on the write', () => {
  it('control: ci.yml runs the stack suite; it names neither the roster file nor the flag, so nothing there needs the write', () => {
    const ci = read('../../../.github/workflows/ci.yml');
    expect(ci).toContain('pnpm run test:e2e:stack');
    expect(ci).not.toContain('non-text-contrast-roster');
    expect(ci).not.toContain('UPDATE_ROSTER');
  });

  it('the roster file\'s provenance text (the writer\'s) says it is regenerated only under UPDATE_ROSTER=1', () => {
    expect(SPEC).toContain("'under `UPDATE_ROSTER=1`. '");
  });
});
