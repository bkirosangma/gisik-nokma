import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DENSE_FLOOR_PX,
  DENSE_IN_LIST,
  STANDALONE_FLOOR_PX,
} from '../e2e-viewport/tap-targets.js';

/**
 * Cases 13.990 and 13.991 — the tap-target split, held at the GATE rather than
 * only in the viewport suite.
 *
 * ⚠ WHY THIS FILE EXISTS AT ALL, AND IT IS NOT REDUNDANCY. The tap-target
 * assertions live in `apps/web/e2e-viewport/responsive.spec.ts` and
 * `apps/web/e2e-stack/viewport.spec.ts`, and **neither suite is on any gate**:
 * `pnpm turbo run build test typecheck` defines no task that reaches them, and
 * `.github/workflows/ci.yml` runs `test:e2e:stack` only — the string `viewport`
 * does not appear in that file. Measured 2026-09-20, with a positive control in
 * the same invocation. The consequence was not theoretical: the `/help` ratchet
 * sat at **25 / 23 / 25 offenders against baselines of 10 / 16 / 16** on `main`,
 * for as long as the topic sidebar has existed, red the whole time, seen by
 * nobody. This file puts the parts of that rule that a `vitest` run CAN hold —
 * the table's integrity, the two constants, and the fact that the floor has one
 * home — on the gate.
 *
 * WHAT IT IS NOT. This is a SOURCE-LEVEL test and it does not measure a box.
 * Nothing here proves a control is 24px tall; that is the viewport suite's job
 * and it needs a browser. `members-styling.test.ts:27-42` argues the same
 * distinction for the same reason, including the half a source scan cannot see
 * (cascade loss), and the honest summary is the one it gives: a rule present and
 * doing nothing reads identically to one that works.
 *
 * MUTATION WITNESSES, run rather than reasoned — each plants a defect, observes
 * the named case redden, and restores it:
 *   * `DENSE_IN_LIST` emptied → 13.991 fails on the non-empty half.
 *   * `STANDALONE_FLOOR_PX` changed 44 → 24 — i.e. THE blanket-24 this change
 *     exists to prevent → 13.990 fails by name.
 *   * `.gn-help__pager-link` deleted from `ui.css` → 13.991 fails naming that
 *     selector as "not a rule head", which is the stale-entry direction.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const UI_CSS_PATH = resolve(TEST_DIR, '../../../packages/ui/src/ui.css');

/** The two suites that consume the split. Both are off every gate; see above. */
const SPEC_PATHS: Record<string, string> = {
  'e2e-viewport/responsive.spec.ts': resolve(TEST_DIR, '../e2e-viewport/responsive.spec.ts'),
  'e2e-stack/viewport.spec.ts': resolve(TEST_DIR, '../e2e-stack/viewport.spec.ts'),
};

/**
 * Every selector that opens a declaration block, comments removed first.
 *
 * THE COMMENT STRIP IS LOAD-BEARING AND IT WAS FOUND THE HARD WAY. `ui.css` is
 * mostly prose: it quotes its own selectors inside docblocks constantly, and
 * this change adds four more such mentions. Without the strip, a selector that
 * had been DELETED from the stylesheet but still discussed in a comment would
 * pass the liveness check below — a check passing for a reason unrelated to the
 * property it names, which is the defect class this repo keeps a catalogue of.
 */
function ruleHeads(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const heads: string[] = [];
  for (const m of withoutComments.matchAll(/([^{}]+)\{/g)) {
    const body = m[1];
    if (body === undefined) continue;
    for (const part of body.split(',')) {
      const selector = part.trim();
      if (selector !== '') heads.push(selector);
    }
  }
  return heads;
}

describe('tap-target density — case 13.990', () => {
  it('13.990 — the two floors are 24 for in-list and 44 for standalone, and 24 < 44', () => {
    /**
     * THE PIN THE DANGEROUS DIRECTION NEEDS. The failure this change was
     * dispatched to avoid is "one global constant changed to 24", which would
     * silently absolve every standalone control the owner kept at 44. That
     * failure has to edit exactly this constant to happen, so it reddens here
     * by name rather than somewhere inside a browser suite no gate runs.
     */
    expect(DENSE_FLOOR_PX).toBe(24);
    expect(STANDALONE_FLOOR_PX).toBe(44);
    expect(DENSE_FLOOR_PX).toBeLessThan(STANDALONE_FLOOR_PX);
  });
});

describe('tap-target density — case 13.991', () => {
  it('13.991 — the table is non-empty and every entry states all four members', () => {
    expect(DENSE_IN_LIST.length).toBeGreaterThan(0);
    for (const entry of DENSE_IN_LIST) {
      expect(entry.control.trim(), 'an entry names no control').not.toBe('');
      expect(entry.container.trim(), 'an entry names no container').not.toBe('');
      expect(entry.declaredAt.trim(), 'an entry names no declaring rule').not.toBe('');
      // A `why` is the membership rule applied to one control. A stub proves
      // nothing about why the control belongs, which is the whole content of
      // the decision — so it is length-guarded rather than merely present.
      expect(entry.why.trim().length, `an entry's why is a stub: ${entry.why}`).toBeGreaterThan(40);
    }
    const controls = DENSE_IN_LIST.map((e) => e.control);
    expect(new Set(controls).size, 'two entries name the same control').toBe(controls.length);
  });

  it('13.991 — every entry names a rule that still EXISTS in ui.css, and a container that scopes it', () => {
    const heads = ruleHeads(readFileSync(UI_CSS_PATH, 'utf8'));
    /**
     * The anti-vacuity floor. Measured at 745 heads on 2026-09-20; 600 leaves
     * room for real deletions while still failing loudly if the extractor
     * itself stops matching anything, which would make every `toContain` below
     * meaningless rather than failing.
     */
    expect(heads.length, 'the CSS extractor found no rules — it is broken, not the CSS').toBeGreaterThan(600);
    for (const entry of DENSE_IN_LIST) {
      expect(
        heads,
        `${entry.control} is in DENSE_IN_LIST but is not a rule head in packages/ui/src/ui.css — ` +
          `the product no longer styles it, so the 24px call it records no longer exists.`,
      ).toContain(entry.control);
      expect(heads, `${entry.declaredAt} is not a rule head in ui.css`).toContain(entry.declaredAt);
      // The container must be a styled thing too, or the entry's scope is a
      // selector that matches nothing and the control is classified never.
      expect(entry.container.startsWith('.') || entry.container.includes(' ')).toBe(true);
    }
  });

  it('13.991 — the floor has ONE home: neither viewport spec carries a private comparison', () => {
    for (const [name, path] of Object.entries(SPEC_PATHS)) {
      const source = readFileSync(path, 'utf8');
      expect(source, `${name} does not import the shared measurement`).toContain('tap-targets.js');
      /**
       * The stale-entry guard is what makes a declared table safe to keep. A
       * suite that lost it would still report confident numbers while an entry
       * quietly matched nothing — so its presence is asserted per suite rather
       * than assumed from the shared module being imported.
       */
      expect(source, `${name} does not assert the stale-entry guard`).toContain('taps.brokenEntries');
      /**
       * And the reason this file exists: a SECOND definition of the floor, free
       * to drift from the first while both files report confident numbers, is
       * the failure `tap-targets.ts`'s own header names. Measured before
       * writing this: the string appears in neither spec.
       */
      expect(
        source,
        `${name} carries its own floor comparison — the floor must live only in e2e-viewport/tap-targets.ts`,
      ).not.toMatch(/[wh]\s*<\s*(24|44)\b/);
    }
  });
});
