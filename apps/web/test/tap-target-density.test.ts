import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DENSE_FLOOR_PX,
  DENSE_IN_LIST,
  STANDALONE_FLOOR_PX,
  TAP_TARGET_ARMS,
} from '../e2e-viewport/tap-targets.js';

/**
 * Cases 13.990 and 13.991 — the tap-target split, held at the GATE rather than
 * only in the viewport suite.
 *
 * ⚠ WHY THIS FILE EXISTS AT ALL, AND IT IS NOT REDUNDANCY. The tap-target
 * assertions live in `apps/web/e2e-viewport/responsive.spec.ts` and
 * `apps/web/e2e-stack/viewport.spec.ts`, and **when this file was written,
 * neither suite was on any gate**: `pnpm turbo run build test typecheck` defined
 * no task that reached them, and `.github/workflows/ci.yml` ran
 * `test:e2e:stack` only — the string `viewport` did not appear in that file.
 * Measured 2026-09-20, with a positive control in the same invocation. The
 * consequence was not theoretical: the `/help` ratchet sat at **25 / 23 / 25
 * offenders against baselines of 10 / 16 / 16** on `main`, for as long as the
 * topic sidebar has existed, red the whole time, seen by nobody. This file put
 * the parts of that rule that a `vitest` run CAN hold — the table's integrity,
 * the two constants, and the fact that the floor has one home — on the gate.
 *
 * ⚠ **THE SENTENCE ABOVE IS PAST TENSE ON PURPOSE — case 16.59, 2026-09-20.**
 * `ci.yml` now carries a `viewport` job that runs `test:e2e:viewport`, and
 * `gate` waits on it, so the browser half is on the merge gate too. **This file
 * did not become redundant when that landed, and the distinction is the whole
 * reason both exist**: a source scan and a browser measurement fail
 * independently. This one reddens when a constant or the table is edited and no
 * browser is involved; the viewport suite reddens when the CSS stops honouring
 * the floor and no source text changes. A green here is not evidence for the
 * other, which is why `tests` above and this docblock are both kept.
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
 *
 * ⚠ AND THE MUTATION THAT FOUND A REAL DEFECT IN THIS CHANGE, kept because it is
 * the one that matters most. An independent review showed the stale-entry guard
 * (in `tap-targets.ts`, not in this file) could produce a FALSE RED on a
 * legitimate page: `help-browser.tsx` renders an unnamed help group as a bare
 * `<GroupItems>` with **no toggle**, so on the FAQ document `.gn-help__groups`
 * renders non-empty with zero `.gn-help__group-toggle`, and the guard's original
 * "container has any children" trigger convicted it. The fix is the required
 * `witness` field; the witness for it is the pair of runs recorded in the PR
 * body — the OLD predicate under a FAQ-shaped page reports
 * `stale entries=[".gn-help__group-toggle inside .gn-help__groups"]` while the
 * NEW one reports `[]`. **This is the reason the table is not enough on its own:
 * a guard that fires on a legitimate state teaches people to ignore it.**
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const UI_CSS_PATH = resolve(TEST_DIR, '../../../packages/ui/src/ui.css');

/**
 * The two suites that consume the split.
 *
 * ⚠ CORRECTED 2026-09-20: this read *"Both are off every gate; see above."* The
 * signed-out one is on CI's `gate` as of case 16.59 — see the note at the head of
 * this file. **The `see above` was the damaging part**: it made a stale sentence
 * read as though it had already been reconciled with the correction sitting a few
 * lines from it, which is why an independent review found this and the sweep that
 * made the correction did not.
 */
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
     * by name rather than somewhere inside a browser suite — which, as of case
     * 16.59, IS on CI's gate, and still needs a browser and a `next dev` to say
     * anything. This file is what a plain `vitest` run can hold without either.
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
      /**
       * The witness is REQUIRED and is checked here as well as in the type, for
       * the same reason the floors are pinned here: the guard that consumes it
       * lives in the viewport suite, which needs a browser to run. A witness
       * that emptied would not fail a type — a string is a string — and the
       * entry would fall back to firing on any non-empty container, which is
       * exactly the false red an unnamed FAQ group produced.
       *
       * ⚠ CORRECTED 2026-09-20. This sentence read "lives in a suite on no gate
       * at all", which was true when it was written and stopped being true the
       * day this suite's sibling reached CI's gate (case 16.59). The REASON for
       * the check is unchanged — a `vitest` run holds what a browser run cannot
       * be the only guard on — so the sentence is corrected rather than deleted.
       */
      expect(entry.witness.trim(), 'an entry names no witness').not.toBe('');
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

  it('13.991 — the arms reach the LISTBOX pattern, so a Select panel is in the population', () => {
    /**
     * P11 (2026-09-21). `Select` portals its panel to `document.body`, and its
     * rows are `<li role="option">` inside a `<ul role="listbox">`. Neither role
     * was an arm of the tap-target selector, so the product's most-migrated
     * shared control contributed nothing to any sweep's denominator — a control
     * `ui.css` fully styles (`.gn-select__panel`, `.gn-select__option`).
     *
     * THIS IS THE HALF A `vitest` RUN CAN HOLD, and it is a behavioural half
     * rather than a string check: it builds the elements the component builds
     * and asks the exported arms whether they match. It does NOT prove the panel
     * renders while open — that needs a browser, and no spec opened a panel
     * either, which is the finding's second independent reason.
     *
     * ⚠ AND ONE ROW WAS ALREADY REACHED, which narrows the claim rather than
     * widening it: React Aria's `useOption` gives the FOCUSED option a roving
     * `tabindex="0"`, so it matched through the `[tabindex]` arm already, and a
     * panel that opened would have judged exactly one option per listbox at the
     * standalone 44px floor. Asserted below rather than described, because it is
     * the reason this arm is not the whole story.
     */
    const selector = TAP_TARGET_ARMS.join(', ');
    const listbox = document.createElement('ul');
    listbox.setAttribute('role', 'listbox');
    const option = document.createElement('li');
    option.setAttribute('role', 'option');
    listbox.append(option);
    document.body.append(listbox);

    expect(
      option.matches(selector),
      'an option row is not in the tap-target population — the Select panel is invisible to every sweep again.',
    ).toBe(true);
    expect(
      listbox.matches(selector),
      'the listbox panel itself is not in the population, so the surface the rows live on draws no measurement.',
    ).toBe(true);

    const focused = document.createElement('li');
    focused.setAttribute('role', 'option');
    focused.setAttribute('tabindex', '0');
    expect(
      focused.matches(selector),
      'P11 recorded this row as ALREADY matching through the [tabindex] arm; if it no longer does, that ' +
        'measurement is stale and the note it supports needs re-taking.',
    ).toBe(true);

    // The negative control. Without it, "every element matched" would satisfy
    // both assertions above, which is the shape a population check fails in.
    const plain = document.createElement('li');
    expect(plain.matches(selector), 'a plain <li> with no role matched the arms').toBe(false);
    listbox.remove();
  });

  it('13.991 — every project-page VIEW is reached by the route loop, not only the default', () => {
    const stackPath = SPEC_PATHS['e2e-stack/viewport.spec.ts'] as string;
    const source = readFileSync(stackPath, 'utf8');
    const MARKER = "key: 'stack-phone-390";

    /**
     * P34 (2026-09-21). The project page draws FIVE views — Backlog, Board, List,
     * Calendar, Timeline — as `role="tab"` buttons that switch component state
     * and leave the route unchanged. The suite's population was a list of
     * ROUTES, so one visit to `/p/:projectId` rendered the DEFAULT view (`board`)
     * and measured it five times' worth of nothing for the other four.
     *
     * The half a `vitest` run can hold: each non-default view has an entry, and
     * that entry declares a `reach`. That a reach CLICKS and PROVES the view
     * changed needs a browser — the spec asserts `aria-selected` for exactly that
     * reason, and this file cannot be the only guard on either half.
     */
    const defaultAt = source.indexOf(`${MARKER}|/p/:projectId'`);
    expect(defaultAt, 'the project-page route entry is gone from the stack suite').toBeGreaterThan(-1);

    /** The text of the entry starting at `at`, up to the next entry's key. */
    const entryAt = (at: number): string => {
      const next = source.indexOf(MARKER, at + MARKER.length);
      return source.slice(at, next === -1 ? source.length : next);
    };

    // THE CONTROL, and it is the assertion that makes the loop below mean
    // something: the DEFAULT view's entry carries NO reach, because `goto`
    // renders it. If it ever declares one, this window would contain `reach:`
    // and the per-view assertions below would pass for a reason unrelated to the
    // views.
    expect(
      entryAt(defaultAt),
      'the default-view entry now sets a reach, so "has a reach" no longer distinguishes a reached ' +
        'view from the one the page renders by itself.',
    ).not.toContain('reach:');

    for (const view of ['backlog', 'list', 'calendar', 'timeline']) {
      const at = source.indexOf(`${MARKER}|/p/:projectId#${view}'`);
      expect(
        at,
        `the "${view}" view has no route entry. It is a TAB, so no route entry reaches it and ` +
          'nothing measures it — which is P34.',
      ).toBeGreaterThan(-1);
      expect(
        entryAt(at),
        `the "${view}" entry sets no \`reach\`, so the loop navigates to the project page and sweeps ` +
          `whichever view it defaults to while reporting "${view}"'s key: a board measurement wearing ` +
          'another view\'s name.',
      ).toContain('reach:');
    }
  });

  it('13.991 — the signed-in tap-target population is the ROUTE LIST, not one route', () => {
    const stackName = 'e2e-stack/viewport.spec.ts';
    const stackPath = SPEC_PATHS[stackName];
    expect(stackPath, 'the stack spec left SPEC_PATHS').toBeDefined();
    const source = readFileSync(stackPath as string, 'utf8');

    /**
     * E4-12 (2026-09-21). The finding this pins, in its own words: the signed-in
     * instrument's "tap-target population is ONE route at ONE width". Measured
     * at filing — `measureTapTargets` was called once in this file, inside its
     * `/my-work` case, and `tap-target-baseline.json` held one key
     * (`stack-phone-390|/my-work: 6`) — while the report those numbers were read
     * against measured the board, the sheet and the settings screens, none of
     * which the suite visited.
     *
     * ⚠ WHAT THIS CAN AND CANNOT SAY, because the division is the reason it
     * lives here rather than only in the spec. It is a SOURCE-STRUCTURE
     * assertion: it proves the call sits INSIDE the route loop and keys its
     * baseline on `route.key`, so the population is the route list and a route
     * joining that list joins the ratchet. It does NOT prove any route rendered
     * — only a browser can say that, and the spec's per-route `rawMatches`
     * control is what holds that half. A green here is not evidence for the
     * other, which is this file's stated position on every case it carries.
     */
    const loopStart = source.indexOf('for (const route of routes) {');
    expect(
      loopStart,
      'the route loop is gone from e2e-stack/viewport.spec.ts — every assertion below would be ' +
        'vacuous, and the tap-target population would be whatever the remaining tests measure.',
    ).toBeGreaterThan(-1);
    // The test owning the loop ends at the first `});` at column 0 after it;
    // everything inside the loop is indented further.
    const loopEnd = source.indexOf('\n});', loopStart);
    expect(loopEnd, 'the route loop has no enclosing test — the slice below would be the file').toBeGreaterThan(
      loopStart,
    );
    const loopBody = source.slice(loopStart, loopEnd);

    expect(
      loopBody,
      'the signed-in suite does not measure tap targets inside its route loop. That puts the ' +
        "ratchet's population back to a single route, which is E4-12 — and it is invisible from " +
        'the numbers, because one route reporting `offenders=6` reads like the product.',
    ).toContain('measureTapTargets(');
    expect(
      loopBody,
      'the loop measures tap targets but does not key its baseline on `route.key`, so every route ' +
        'would assert one shared number instead of its own.',
    ).toContain('readTapBaseline(');
    expect(loopBody, 'the loop reads no tap-target baseline').toContain('route.key');

    /**
     * The anti-vacuity floor, and it is the half that matters on a source
     * assertion: an EMPTIED route list makes every `toContain` above true while
     * the loop measures nothing at all. Seven entries exist at this commit; five
     * leaves room for a real removal while failing if the list is gutted.
     */
    const routeEntries = [...source.matchAll(/key: 'stack-phone-390\|/g)].length;
    expect(
      routeEntries,
      'the route list has shrunk below five entries — the loop still calls the measurement, but ' +
        'over a population too small for any count it produces to be about the product.',
    ).toBeGreaterThanOrEqual(5);
  });
});

/**
 * Case `13.1141` — E4-3 — the board card's provenance disclosure (then `who · when`, now "Moved to … by … on …") is declared
 * at the 24-px in-list floor, and the table that classifies it says so.
 *
 * Every board card carried `button.gn-board-card__provenance` at **66×21** with
 * no `min-width`/`min-height` anywhere in its rule, so the glyph row was the
 * target on all 24 cards. It is not the card's open control
 * (`.gn-board__card-slot` is), so nothing larger performs its function.
 *
 * **The two halves are asserted together, and for the reason `tap-targets.ts`
 * gives for the table existing at all:** a floor in the CSS with no
 * classification is judged at 44 the day a sweep reaches the board, and a
 * classification with no floor in the CSS absolves a control that does not meet
 * 24. `ruleHeads` is the same comment-stripped extractor the liveness check
 * uses — not a second one — because `ui.css` is mostly prose and a selector
 * discussed in a comment would answer for a rule that had been deleted.
 */
describe('tap-target density — case 13.1141', () => {
  const PROVENANCE = '.gn-board-card__provenance';

  it('13.1141 the rule declares the in-list floor', () => {
    const heads = ruleHeads(readFileSync(UI_CSS_PATH, 'utf8'));
    expect(heads, 'the CSS extractor found no rules — it is broken, not the CSS').toContain(
      PROVENANCE,
    );
    const withoutComments = readFileSync(UI_CSS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const m = withoutComments.match(
      new RegExp(`${PROVENANCE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`),
    );
    expect(m, `no declaration block for ${PROVENANCE}`).not.toBeNull();
    // Amended 2026-09-29 (styling refresh Plan A, 20.059): 44px, above the 24px in-list floor the table still declares.
    expect(m?.[1]).toMatch(/min-height:\s*2\.75rem/);
  });

  it('13.1141 and the table classifies it as in-list, naming this protocol', () => {
    const entry = DENSE_IN_LIST.find((e) => e.control === PROVENANCE);
    expect(entry, `${PROVENANCE} is not in DENSE_IN_LIST`).toBeDefined();
    expect(entry?.declaredAt).toBe(PROVENANCE);
    expect(entry?.container).toBe('.gn-board__cards');
    expect(entry?.witness).toBe('.gn-board__card-slot');
    // The witness must be a rule head too, or the stale-entry guard's
    // "container rendered but the witness is absent" arm can never fire.
    expect(ruleHeads(readFileSync(UI_CSS_PATH, 'utf8'))).toContain('.gn-board__card-slot');
  });
});
