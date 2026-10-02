# Neo refresh (rulings N1–N10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, execution is by the orchestrator's lanes (controller → dispatcher → lanes → reviewer → gate). **NEXT release, not tonight's:** cut `release/neo-refresh` from `main` once `release/prefix-groups-ux` has merged. **HELD: do not dispatch until the owner says so.**

**Goal:** Make the neo style read as neumorphic — derived shadow colours, sized pairs, inverted presses, no highlight on coloured fills, box-sized insets, a rim-less neo field and halo clearance — through the token layer, with hig and minimal byte-identical.

**Architecture:** All values change in `packages/ui/src/tokens.ts` (new `shadow*` primitives, new `ShadowRole`s, two surface remaps); CSS consumers in `packages/ui/src/ui.css` and `apps/web/app/globals.css` switch which `--gn-shadow-*` variable they read, never literals; buttons change through tokens only (13.340). Tests are the existing CSS-rule readers (`ruleExactly`/`valueOf`), `shadowValueOf`/`colorOf` pins and `contrastRatio`, plus a LOCAL browser pass with the e2e-stack.

**Tech Stack:** TypeScript monorepo; `packages/ui` (tokens, CSS, components); `apps/web` (Next 15); vitest with `packages/ui/test/helpers/{css-rules,contrast,style-patterns,colour-scan}.ts`; Playwright `apps/web/e2e-stack`; Node 22.

**Spec:** `gisik-nokma-lanes/neo-refresh-docs/2026-10-02-neo-refresh-design.md` (lands in `docs/superpowers/specs/` as the release branch's first PR, beside this plan).

## Preconditions
- **P1:** `release/neo-refresh` is cut from `main` after `release/prefix-groups-ux` has merged to `main` (its release PR number is not known yet). Line numbers below are `origin/release/prefix-groups-ux` at `b61d6e5e`; a lane re-greps each cited selector before editing (the selector is the anchor, the line a hint).
- **P2:** the spec and this plan land as the release branch's first PR, with the bucket and Features section opened empty (T9's first commit, done first).

## Global Constraints
- **Neo only.** `hig` and `minimal` render every shadow role and surface byte-identically to today (spec §6–7). T1's snapshot test is the guard.
- **Tokens, never literals:** every colour or length added to CSS is a `--gn-*` variable generated from `tokens.ts` (`token-discipline.test.ts` scans both stylesheets).
- **Every `shadow*` primitive is an 8-digit alpha hex** and never equals a `CONTRAST_PAIRS` colour (`packages/ui/test/tokens.test.ts:285–309`). Opaque line colours are written `…ff`.
- **No `[data-style]` block may touch `.gn-button`** (case 13.340, `packages/ui/test/components.test.tsx:941–947`); buttons change through tokens.
- **Every new `ShadowRole` is added to `SHADOW_ROLES` (`tokens.ts:1880`) AND to `EXPECTED_SHADOW_ROLES` in 13.411 (`tokens.test.ts:421`)**, or the role never reaches the stylesheet / the test never notices.
- **Contrast floors:** text 4.5 on every neo ground a field or well paints; non-text edges 3.0; the one-sided neo field line is asserted like a border (spec §5).
- **CSS-rule tests:** `ruleExactly(css, selectorOrList, atRule)` matches the rule's EXACT selector list — a two-selector rule is passed as an array, never a comma-joined string (`packages/ui/test/helpers/css-rules.ts:67–85`); `valueOf` returns the LAST declaration.
- **Catalogue:** bucket `test-cases/24-neo-refresh.md` (3-digit `24.001`…), Features `## 21. Neo refresh (N1–N10)`, registered in `test-cases/README.md` and `scripts/fixtures/check-case-citations-baseline.json` (`"24-neo-refresh.md": 0`). RED first, a control in the same `it`, a named mutation per case, case ids in test names.
- **Runs:** Node 22; `pnpm --filter @gisik-nokma/ui build` before suites; never pipe a run into `head`; lanes run only their affected files + typecheck + `pnpm check:citations`; whole suites are the gate's. Every run is reported as LOCAL.
- **UI work:** read `frontend-design`'s SKILL.md (plugin cache) and `artifact-design` before touching CSS; `ui-ux-pro-max` is disabled (owner, 2026-10-02).

## Review Focus
1. **hig or minimal drifts through a shared role rename** — a person on hig sees a changed button or card shadow. Expected: byte-identical. Pinned by T1 case 24.002 (a snapshot of every hig/minimal role string before and after).
2. **A neo field inside a dark well is invisible** — field fill = well fill (`#141a33`) and the only boundary is the 1px lip. Expected: a visible edge ≥ 3:1 against the well. Pinned by T3 case 24.044 (the lip's ratio against `surfaceWell` as well as against the fill).
3. **Keyboard focus on the primary** — the 2px ring must not merge with the 1px accent edge. Expected: one ring with a visible gap at 1×. Pinned by T2 case 24.023 (offset 3px in CSS) and T8 case 24.113 (computed `outlineOffset` in the browser).
4. **A dragged board card paints an inset** — `:active` now inverts; the drag clone must keep `lift-drag`. Expected: the clone lifts, the source card presses. Pinned by T2 case 24.026.
5. **Reduced motion hides the press** — with transitions off the shadow swap must still happen. Expected: the inset appears instantly. Pinned by T4 case 24.065 (the reduced-motion arm sets `transition: none`, not `box-shadow: none`).

## Seam map (verified 2026-10-02 against `b61d6e5e`)
`tokens.ts`: primitives `shadowNeo*` 375–399, `neoNavy`/`neoNavyRaised` 211/230, `neoWell*` 263–264, `STYLE_COLOR_OVERRIDES.neo` 1042–1074, `ShadowRole` 1295–1309, `SHADOWS` 1343–1622 (neo 1473–1621), `shadowValueOf` 1630, `CONTRAST_PAIRS` 1645–1830 (56 rows), `colorOf` 1839, `SHADOW_ROLES` 1880, `themeStylesheet` 1957. `ui.css`: `.gn-button` 75, `:focus-visible` 96, `--primary` 108/117/122, `--danger` 130/138/142, `:disabled` 159, `.gn-chip` neo 232, `.gn-card` 274, `.gn-dialog` 443, `.gn-sheet` 469, `.gn-toast` 506, `.gn-sheet__close` 959/978, `.gn-board__column` 1168, `__column-header` 1208, `__cards` 1287, `.gn-board-card` 1473, slot hover/active 1622–1623, drag clone 1642, `.gn-row-action` 2022/2037, `.gn-list__column-option` 2372, `__column-box` 2394, checked 2448, `.gn-select__panel` 4235, `.gn-popover` 4256, `.workflow-rebind-dialog` 4556, `.template-gallery__door` 4689/4707/4712, `.workflow-builder-screen__name` neo 4804, `.gn-help__search-input` neo 6289, `.gn-help__toggle:hover` 6428, `.gn-segmented` 6931, `__item` 6946, `__item--on` 6980, neo `--on` 7017, `.gn-field` 7075, `.gn-field__input` 7101, `:focus-visible` 7146, `:disabled` 7157, neo field 7176, neo disabled 7191, raised trigger 7240, `--ghost` 7252/7258, `--danger-quiet` 7268, `.gn-project__search` 7521 (neo 7535), `.gn-filters__panel` 7688, `.gn-switch` 8097, `::after` 8124, `:checked` 8136, `:checked::after` 8138, `:disabled` 8151–8153, `.gn-infotip__panel` 8216. `globals.css`: `.gn-shell__main` 169, `.gn-workspace-list` 266, door hover/active 533/538, `.gn-account__section` 793, `.gn-workspace-home__link` 1183/1210/1215, `.gn-nav` 2078, `.gn-nav a:hover` 2900, current 2915, neo current 2942, `.gn-theme-toggle` 2969, neo sign-in mark 3085, task checkbox neo 4892. Tests: `tokens.test.ts` 13.347 (359), 13.411 (414, `EXPECTED_SHADOW_ROLES` 421), 13.412 (460–484), neo-dark fill (539–546), sunken-compact pins (338–343); `styling-tokens.test.ts` 20.011 (146–152); `neo-ux-fixes.test.ts` 23.002 (80–99), 23.006 (164–186), 23.007 (188–207); `components.test.tsx` 13.289 (590), 13.291 (619), 13.339 (648), 13.340 (941); `styling-buttons.test.ts` 20.021–20.024 (25–90); `styling-board.test.ts` 20.041 (22–29), 20.046 (105–114); `styling-surfaces.test.ts` (9–24); `styling-b2-fields.test.ts` 20.213 (38–45); `apps/web/e2e-stack/viewport.spec.ts` 1093–1113; `apps/web/e2e-stack/non-text-contrast-roster.json`.

## File structure (by task)
| Task | Area | Main files |
|---|---|---|
| T1 | Token layer | `tokens.ts`; `packages/ui/test/neo-refresh.test.ts` (new); amend `tokens.test.ts`, `styling-tokens.test.ts`, `neo-ux-fixes.test.ts` |
| T2 | Press inversion + filled fills | `ui.css` buttons, board, doors; `globals.css` doors; `styling-buttons.test.ts`, `neo-refresh.test.ts` |
| T3 | Sunken family + rim-less neo field | `ui.css` fields/segmented/nav/help; `globals.css` nav, task checkbox; `components.test.tsx` 13.339, `neo-ux-fixes.test.ts` 23.002, `viewport.spec.ts` |
| T4 | Ghost and icon depth | `ui.css` `--ghost`, `.gn-sheet__close`, `.gn-row-action`; `styling-buttons.test.ts` |
| T5 | Switch and checkbox neo arms | `ui.css` `.gn-switch*`, `.gn-list__column-*`; `neo-refresh.test.ts` |
| T6 | Halo clearance | `tokens.ts` halo tokens; `ui.css` board; `globals.css` shell/account; `styling-board.test.ts` |
| T7 | Dark sweep (N4 = B) + docblocks + report | `tokens.ts` docblocks; `docs/neo-token-report.md`; `tokens.test.ts` 539 |
| T8 | Browser verification (LOCAL) | `apps/web/e2e-stack/neo-depth.spec.ts` (new), `viewport.spec.ts`, screenshots |
| T9 | Catalogue and docs | `test-cases/24-neo-refresh.md`, `Features.md` §21, `test-cases/README.md`, baseline json, spec/plan into `docs/superpowers/` |

**Case blocks:** T1 24.001–019 · T2 24.020–039 · T3 24.040–059 · T4 24.060–069 · T5 24.070–079 · T6 24.080–099 · T7 24.100–109 · T8 24.110–129 · T9 24.130–139.

---

### Task 1: The token layer — primitives, roles, surfaces, per theme

**Files:**
- Modify: `packages/ui/src/tokens.ts:375–399` (shadow primitives), `:1042–1074` (`STYLE_COLOR_OVERRIDES.neo`), `:1295–1309` (`ShadowRole`), `:1343–1622` (`SHADOWS`, all three styles), `:1880–1896` (`SHADOW_ROLES`)
- Create: `packages/ui/test/neo-refresh.test.ts`
- Modify: `packages/ui/test/tokens.test.ts:338–343` (sunken-compact pins), `:421` (`EXPECTED_SHADOW_ROLES`), `:460–484` (13.412 neo strings), `:539–546` (neo-dark fill); `packages/ui/test/styling-tokens.test.ts:146–152` (20.011); `packages/ui/test/neo-ux-fixes.test.ts:164–207` (23.006, 23.007)

**Interfaces:**
- Consumes: `shadowValueOf(style, theme, role)`, `colorOf(theme, role, style)`, `primitives`, `CONTRAST_PAIRS`, `SHADOW_ROLES`, `themeStylesheet()` (all exported from `tokens.ts`); `contrastRatio(a, b)` and `over(src, dst)` from `packages/ui/test/helpers/contrast.ts`.
- Produces: new `ShadowRole` members `'raised-lg' | 'near-lg' | 'near' | 'raised-compact' | 'recess' | 'field' | 'quiet' | 'quiet-near' | 'quiet-press' | 'action-filled' | 'action-filled-near' | 'action-filled-press' | 'danger' | 'danger-near' | 'danger-press' | 'knob-on'`, emitted as `--gn-shadow-raised-lg` … `--gn-shadow-knob-on` by `shadowVariableName`. New primitives (spec §3.1): `shadowNeoDarkLight #a89c918c`, `shadowNeoDarkDark #0000008c`, `shadowNeoDarkSunkenLight #a89c9199`, `shadowNeoBandLight #a89c91cc`, `shadowNeoBandDark #000000bf`, `shadowNeoHighlightLight #fffaf4b3` (REUSED name, new value), `shadowNeoHighlightDark #f2e9e129`, `shadowNeoHighlightCompactLight #fffaf480`, `shadowNeoHighlightCompactDark #f2e9e11f`, `shadowNeoHighlightSunkenLight #fffaf480`, `shadowNeoHighlightSunkenDark #f2e9e114`, `shadowNeoLipLight #fffaf4cc`, `shadowNeoLipDark #f2e9e159`, `shadowNeoLineLight #897362ff`, `shadowNeoLineDark #7d88a8ff`, `shadowNeoAccentPressLight #264a77ff`, `shadowNeoAccentPressDark #5f7fabff`, `shadowNeoDangerPressLight #772018ff`, `shadowNeoDangerPressDark #bf4f49ff`. Surfaces: neo `surfaceSunken` → `neoWellLight`/`neoWellDark`; neo-dark `surfaceRaised` → `neoNavy`.

- [ ] **Step 1: Snapshot hig and minimal BEFORE touching tokens (the control for 24.002)**

Run (Node 22, from `packages/ui` on the untouched release branch):
```bash
node -e "
const t = require('./dist/tokens.js');
const out = {};
for (const style of ['hig','minimal']) for (const theme of ['light','dark']) {
  out[style+'/'+theme] = Object.fromEntries(t.SHADOW_ROLES.map(r => [r, t.shadowValueOf(style, theme, r)]));
  out[style+'/'+theme].surfaces = Object.fromEntries(['surface','surfaceRaised','surfaceSunken','surfaceTrack','surfaceWell','fieldRim'].map(r => [r, t.colorOf(theme, r, style)]));
}
require('fs').writeFileSync('test/fixtures/hig-minimal-shadows.before.json', JSON.stringify(out, null, 2));
"
```
(`pnpm --filter @gisik-nokma/ui build` first so `dist/tokens.js` exists.) Commit the fixture; it is the control every later task is measured against.

- [ ] **Step 2: Write the failing tests** (`packages/ui/test/neo-refresh.test.ts`)

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers/colour-scan.js';
import { contrastRatio, over } from './helpers/contrast.js';
import {
  CONTRAST_PAIRS,
  SHADOW_ROLES,
  colorOf,
  primitives,
  shadowValueOf,
  themeStylesheet,
  type ShadowRole,
} from '../src/tokens.js';

const before = JSON.parse(readFileSync(join(REPO_ROOT, 'packages/ui/test/fixtures/hig-minimal-shadows.before.json'), 'utf8'));

describe('24.001 the neo shadow primitives are derived from the surface, one lamp per theme (spec §3.1; N5, N8, N9)', () => {
  it('24.001 every neo layer colour is pinned, 8-digit, and composites to the recorded ratio', () => {
    expect(primitives.shadowNeoDarkLight).toBe('#a89c918c');
    expect(primitives.shadowNeoDarkDark).toBe('#0000008c');
    expect(primitives.shadowNeoBandLight).toBe('#a89c91cc');
    expect(primitives.shadowNeoBandDark).toBe('#000000bf');
    expect(primitives.shadowNeoHighlightLight).toBe('#fffaf4b3');
    expect(primitives.shadowNeoHighlightDark).toBe('#f2e9e129');
    expect(primitives.shadowNeoLipLight).toBe('#fffaf4cc');
    expect(primitives.shadowNeoLipDark).toBe('#f2e9e159');
    expect(primitives.shadowNeoLineLight).toBe('#897362ff');
    expect(primitives.shadowNeoLineDark).toBe('#7d88a8ff');
    // the fall composited on paper is the same darkness as the old brown, with less chroma
    expect(contrastRatio(over('#a89c918c', '#f1eae3'), '#f1eae3')).toBeCloseTo(1.52, 1);
    // CONTROL: the retired brown is no longer mapped by any neo role
    const sheet = themeStylesheet();
    expect(sheet).not.toContain('#b098848c');
    expect(sheet).not.toContain('#fffffff2');
    expect(sheet).not.toContain('#ffffff0d');
  });
});

describe('24.002 hig and minimal are byte-identical before and after (spec §6–7)', () => {
  it('24.002 every role string and surface in hig/minimal equals the pre-refresh snapshot', () => {
    for (const style of ['hig', 'minimal'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        const snap = before[`${style}/${theme}`];
        for (const role of Object.keys(snap).filter((k) => k !== 'surfaces') as ShadowRole[]) {
          expect(shadowValueOf(style, theme, role), `${style}/${theme}/${role}`).toBe(snap[role]);
        }
        for (const [role, hex] of Object.entries(snap.surfaces)) {
          expect(colorOf(theme, role as never, style), `${style}/${theme}/${role}`).toBe(hex);
        }
      }
    }
    // CONTROL: neo did move — the same comparison fails for it on `raised`.
    expect(shadowValueOf('neo', 'light', 'raised')).not.toBe('7px 7px 16px #b098848c, -7px -7px 16px #fffffff2');
  });
});

describe('24.003 the sized pairs (spec §3.3; N7)', () => {
  it('24.003 raised-lg 7/16, raised 4/10, raised-compact 2/4, near 6/14, near-lg 10/24 in both neo themes', () => {
    const d = { light: '#a89c918c', dark: '#0000008c' };
    const h = { light: '#fffaf4b3', dark: '#f2e9e129' };
    const hc = { light: '#fffaf480', dark: '#f2e9e11f' };
    for (const theme of ['light', 'dark'] as const) {
      expect(shadowValueOf('neo', theme, 'raised-lg')).toBe(`7px 7px 16px ${d[theme]}, -7px -7px 16px ${h[theme]}`);
      expect(shadowValueOf('neo', theme, 'raised')).toBe(`4px 4px 10px ${d[theme]}, -4px -4px 10px ${h[theme]}`);
      expect(shadowValueOf('neo', theme, 'raised-compact')).toBe(`2px 2px 4px ${d[theme]}, -2px -2px 4px ${hc[theme]}`);
      expect(shadowValueOf('neo', theme, 'near')).toBe(`6px 6px 14px ${d[theme]}, -6px -6px 14px ${h[theme]}`);
      expect(shadowValueOf('neo', theme, 'near-lg')).toBe(`10px 10px 24px ${d[theme]}, -10px -10px 24px ${h[theme]}`);
      // aliases
      expect(shadowValueOf('neo', theme, 'lift')).toBe(shadowValueOf('neo', theme, 'raised'));
      expect(shadowValueOf('neo', theme, 'lift-near')).toBe(shadowValueOf('neo', theme, 'near'));
      expect(shadowValueOf('neo', theme, 'overlay')).toBe(shadowValueOf('neo', theme, 'raised-lg'));
      expect(shadowValueOf('neo', theme, 'sheet')).toBe(shadowValueOf('neo', theme, 'raised-lg'));
      expect(shadowValueOf('neo', theme, 'lift-drag')).toBe(`14px 14px 32px ${d[theme]}, -14px -14px 32px ${h[theme]}`);
    }
    // CONTROL: hig's raised-lg is its raised, minimal's is none.
    expect(shadowValueOf('hig', 'light', 'raised-lg')).toBe(shadowValueOf('hig', 'light', 'raised'));
    expect(shadowValueOf('minimal', 'dark', 'raised-lg')).toBe('none');
  });
});

describe('24.004 the inset family sized to the box (spec §3.3; N9, N1)', () => {
  it('24.004 sunken 3/6 with a half-strength highlight; recess 3/5 band + 1px lip; sunken-compact 1/3; press/selected = recess', () => {
    expect(shadowValueOf('neo', 'light', 'sunken')).toBe('inset 3px 3px 6px #a89c9199, inset -3px -3px 5px #fffaf480');
    expect(shadowValueOf('neo', 'dark', 'sunken')).toBe('inset 3px 3px 6px #0000008c, inset -3px -3px 5px #f2e9e114');
    expect(shadowValueOf('neo', 'light', 'recess')).toBe('inset 3px 3px 5px #a89c91cc, inset -1px -1px 1px #fffaf4cc');
    expect(shadowValueOf('neo', 'dark', 'recess')).toBe('inset 3px 3px 5px #000000bf, inset -1px -1px 1px #f2e9e159');
    expect(shadowValueOf('neo', 'light', 'sunken-compact')).toBe('inset 1px 1px 3px #a89c9199, inset -1px -1px 2px #fffaf480');
    expect(shadowValueOf('neo', 'dark', 'sunken-compact')).toBe('inset 1px 1px 3px #0000008c, inset -1px -1px 2px #f2e9e114');
    for (const theme of ['light', 'dark'] as const) {
      expect(shadowValueOf('neo', theme, 'track')).toBe(shadowValueOf('neo', theme, 'sunken'));
      expect(shadowValueOf('neo', theme, 'selected')).toBe(shadowValueOf('neo', theme, 'recess'));
      expect(shadowValueOf('neo', theme, 'lift-press')).toBe(shadowValueOf('neo', theme, 'recess'));
      expect(shadowValueOf('neo', theme, 'action-press')).toBe(shadowValueOf('neo', theme, 'recess'));
      expect(shadowValueOf('neo', theme, 'lift-press').startsWith('inset'), `${theme} press inverts (N1)`).toBe(true);
    }
    // CONTROL: hig's recess is its sunken (none), so a hig card still presses on its own lift-press.
    expect(shadowValueOf('hig', 'light', 'recess')).toBe('none');
    expect(shadowValueOf('hig', 'light', 'lift-press')).toBe(before['hig/light']['lift-press']);
  });
});

describe('24.005 the neo field role: one crisp line per theme at >= 3:1 (spec §3.3, §5; N10)', () => {
  it('24.005 light = line top-left + band + lip; dark = band + line bottom-right; the line clears 3.0 on the field fill', () => {
    expect(shadowValueOf('neo', 'light', 'field')).toBe('inset 1px 1px 0px #897362ff, inset 3px 3px 5px #a89c91cc, inset -1px -1px 1px #fffaf4cc');
    expect(shadowValueOf('neo', 'dark', 'field')).toBe('inset 3px 3px 5px #000000bf, inset -1px -1px 0px #7d88a8ff');
    expect(contrastRatio('#897362', colorOf('light', 'surfaceSunken', 'neo'))).toBeGreaterThanOrEqual(3.0); // 3.31
    expect(contrastRatio('#7d88a8', colorOf('dark', 'surfaceSunken', 'neo'))).toBeGreaterThanOrEqual(3.0); // 4.86
    expect(contrastRatio('#7d88a8', colorOf('dark', 'surfaceRaised', 'neo'))).toBeGreaterThanOrEqual(3.0); // vs the card
    // CONTROL: hig and minimal have no field role (they keep the rim).
    expect(shadowValueOf('hig', 'light', 'field')).toBe('none');
    expect(shadowValueOf('minimal', 'dark', 'field')).toBe('none');
  });
});

describe('24.006 filled surfaces carry no highlight (spec §4; N8)', () => {
  it('24.006 action-filled is one dark layer; its press is an inset in the fill darkened by a quarter; hig keeps its action/lift values', () => {
    expect(shadowValueOf('neo', 'light', 'action-filled')).toBe('3px 4px 10px #a89c918c');
    expect(shadowValueOf('neo', 'dark', 'action-filled')).toBe('3px 4px 10px #0000008c');
    expect(shadowValueOf('neo', 'light', 'action-filled-near')).toBe('5px 6px 14px #a89c918c');
    expect(shadowValueOf('neo', 'light', 'action-filled-press')).toBe('inset 2px 2px 5px #264a77ff');
    expect(shadowValueOf('neo', 'dark', 'action-filled-press')).toBe('inset 2px 2px 5px #5f7fabff');
    expect(shadowValueOf('neo', 'light', 'danger-press')).toBe('inset 2px 2px 5px #772018ff');
    expect(shadowValueOf('neo', 'dark', 'danger-press')).toBe('inset 2px 2px 5px #bf4f49ff');
    expect(shadowValueOf('neo', 'light', 'knob-on')).toBe('1px 2px 4px #a89c918c');
    for (const theme of ['light', 'dark'] as const) {
      for (const role of ['action-filled', 'action-filled-near', 'danger', 'danger-near'] as const) {
        expect(shadowValueOf('neo', theme, role).split(',').length, `${theme}/${role} has one layer`).toBe(1);
      }
      expect(shadowValueOf('hig', theme, 'action-filled')).toBe(before[`hig/${theme}`]['action']);
      expect(shadowValueOf('hig', theme, 'danger')).toBe(before[`hig/${theme}`]['lift']);
      expect(shadowValueOf('hig', theme, 'danger-press')).toBe(before[`hig/${theme}`]['lift-press']);
    }
    // the press shades are the fill x 0.75, stated so a palette edit recomputes them
    expect(primitives.shadowNeoAccentPressLight).toBe('#264a77ff'); // blue600 #33629f x 0.75
    expect(primitives.shadowNeoDangerPressLight).toBe('#772018ff'); // neoLightDanger #9e2a20 x 0.75
  });
});

describe('24.007 surfaces: sunken = the well, dark raised = the page hex (N2, N4 = B)', () => {
  it('24.007 neo surfaceSunken is #e6dcd2 / #141a33, neo-dark surfaceRaised is #1b2340, and the text tiers clear 4.5 on the new field ground', () => {
    expect(colorOf('light', 'surfaceSunken', 'neo')).toBe('#e6dcd2');
    expect(colorOf('dark', 'surfaceSunken', 'neo')).toBe('#141a33');
    expect(colorOf('dark', 'surfaceRaised', 'neo')).toBe('#1b2340');
    expect(colorOf('dark', 'surfaceRaised', 'neo')).toBe(colorOf('dark', 'surface', 'neo'));
    for (const theme of ['light', 'dark'] as const) {
      for (const fg of ['text', 'textMuted', 'textSubtle', 'textAccent'] as const) {
        expect(contrastRatio(colorOf(theme, fg, 'neo'), colorOf(theme, 'surfaceSunken', 'neo')), `${theme} ${fg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // the declared pairs that already guard these grounds still exist (23.007 added them for track/well)
    expect(CONTRAST_PAIRS.some((p) => p.fg === 'textAccent' && p.bg === 'surfaceWell' && p.minimum === 4.5)).toBe(true);
    // CONTROL: hig's sunken and dark raised did not move.
    expect(colorOf('light', 'surfaceSunken', 'hig')).toBe(before['hig/light'].surfaces.surfaceSunken);
    expect(colorOf('dark', 'surfaceRaised', 'hig')).toBe(before['hig/dark'].surfaces.surfaceRaised);
  });
});

describe('24.008 every new role reaches the stylesheet under every style x theme (13.411 extended)', () => {
  it('24.008 the sixteen new roles are in SHADOW_ROLES and emitted six times each', () => {
    const NEW = ['raised-lg', 'near-lg', 'near', 'raised-compact', 'recess', 'field', 'quiet', 'quiet-near', 'quiet-press', 'action-filled', 'action-filled-near', 'action-filled-press', 'danger', 'danger-near', 'danger-press', 'knob-on'] as const;
    const sheet = themeStylesheet();
    for (const role of NEW) {
      expect(SHADOW_ROLES).toContain(role);
      expect(sheet.split(`--gn-shadow-${role}:`).length - 1, role).toBe(6);
    }
  });
});
```

- [ ] **Step 3: Run to verify RED**

Run: `cd packages/ui && pnpm exec vitest run test/neo-refresh.test.ts > /tmp/neo-t1.log 2>&1; tail -40 /tmp/neo-t1.log`
Expected: FAIL — `primitives.shadowNeoDarkLight` undefined; `shadowValueOf` type errors on `'raised-lg'`.

- [ ] **Step 4: Implement the primitives** (`tokens.ts:375–399`; keep the retired names' docblocks, mark each `/** RETIRED 2026-10-02 (neo refresh N5/N8/N9) — mapped by no role; kept for the record. */`)

```ts
  shadowHigLight: '#273a6329',
  shadowHigDark: '#060a16a8',
  /** Neo refresh (owner N5, 2026-10-02): the fall is the paper's own hue at lower chroma, 55%. Composites #c9bfb6 on paper (1.52). */
  shadowNeoDarkLight: '#a89c918c',
  /** One dark layer for every dark role (finding 8): black at 55%, #0c101d on navy (1.23). */
  shadowNeoDarkDark: '#0000008c',
  shadowNeoDarkSunkenLight: '#a89c9199',
  /** The control-recess band (finding 10): 80% light, 75% dark — the dark band is at its physical cap, 1.18 on #141a33. */
  shadowNeoBandLight: '#a89c91cc',
  shadowNeoBandDark: '#000000bf',
  /** Warm white at 70% (N5), 16% cream in dark (N4 = B): the lit edge, not a halo. */
  shadowNeoHighlightLight: '#fffaf4b3',
  shadowNeoHighlightDark: '#f2e9e129',
  shadowNeoHighlightCompactLight: '#fffaf480',
  shadowNeoHighlightCompactDark: '#f2e9e11f',
  shadowNeoHighlightSunkenLight: '#fffaf480',
  shadowNeoHighlightSunkenDark: '#f2e9e114',
  /** The 1px lip on a control recess: 80% light (1.24), 35% dark (2.85). */
  shadowNeoLipLight: '#fffaf4cc',
  shadowNeoLipDark: '#f2e9e159',
  /** The neo field's crisp boundary (N10, one-sided per WCAG 1.4.11): #897362 is 3.31 on #e6dcd2; #7d88a8 is 4.86 on #141a33 and 3.85 on the page. Opaque, written as 8 digits for the shadow sweep. */
  shadowNeoLineLight: '#897362ff',
  shadowNeoLineDark: '#7d88a8ff',
  /** Press shades = the fill x 0.75 (finding 8): blue600 #33629f, blue300 #7fa9e4, neoLightDanger #9e2a20, red300 #ff6961. */
  shadowNeoAccentPressLight: '#264a77ff',
  shadowNeoAccentPressDark: '#5f7fabff',
  shadowNeoDangerPressLight: '#772018ff',
  shadowNeoDangerPressDark: '#bf4f49ff',
```

- [ ] **Step 5: Implement the roles and the neo table** (`tokens.ts:1295–1309`, `1473–1621`, `1880`)

```ts
export type ShadowRole =
  | 'raised' | 'sunken' | 'overlay' | 'sunken-compact' | 'selected'
  | 'lift' | 'lift-near' | 'lift-press' | 'lift-drag' | 'track'
  | 'action' | 'action-near' | 'action-press' | 'sheet'
  // neo refresh (2026-10-02, N1–N10)
  | 'raised-lg' | 'near-lg' | 'near' | 'raised-compact'
  | 'recess' | 'field'
  | 'quiet' | 'quiet-near' | 'quiet-press'
  | 'action-filled' | 'action-filled-near' | 'action-filled-press'
  | 'danger' | 'danger-near' | 'danger-press'
  | 'knob-on';
```

Neo, both themes, written once as helpers above `SHADOWS` so light and dark cannot drift:

```ts
type NeoLamp = { d: PrimitiveName; ds: PrimitiveName; band: PrimitiveName; h: PrimitiveName; hc: PrimitiveName; hs: PrimitiveName; lip: PrimitiveName; line: PrimitiveName; accentPress: PrimitiveName; dangerPress: PrimitiveName; lineFirst: boolean };
const NEO_LIGHT: NeoLamp = { d: 'shadowNeoDarkLight', ds: 'shadowNeoDarkSunkenLight', band: 'shadowNeoBandLight', h: 'shadowNeoHighlightLight', hc: 'shadowNeoHighlightCompactLight', hs: 'shadowNeoHighlightSunkenLight', lip: 'shadowNeoLipLight', line: 'shadowNeoLineLight', accentPress: 'shadowNeoAccentPressLight', dangerPress: 'shadowNeoDangerPressLight', lineFirst: true };
const NEO_DARK: NeoLamp = { d: 'shadowNeoDarkDark', ds: 'shadowNeoDarkDark', band: 'shadowNeoBandDark', h: 'shadowNeoHighlightDark', hc: 'shadowNeoHighlightCompactDark', hs: 'shadowNeoHighlightSunkenDark', lip: 'shadowNeoLipDark', line: 'shadowNeoLineDark', accentPress: 'shadowNeoAccentPressDark', dangerPress: 'shadowNeoDangerPressDark', lineFirst: false };
function pair(o: number, b: number, dark: PrimitiveName, light: PrimitiveName): ShadowLayer[] {
  return [{ x: o, y: o, blur: b, colour: dark }, { x: -o, y: -o, blur: b, colour: light }];
}
function neoShadows(L: NeoLamp): Record<ShadowRole, readonly ShadowLayer[]> {
  const raisedLg = pair(7, 16, L.d, L.h);
  const raised = pair(4, 10, L.d, L.h);
  const raisedCompact = pair(2, 4, L.d, L.hc);
  const near = pair(6, 14, L.d, L.h);
  const nearLg = pair(10, 24, L.d, L.h);
  const sunken: ShadowLayer[] = [{ x: 3, y: 3, blur: 6, colour: L.ds, inset: true }, { x: -3, y: -3, blur: 5, colour: L.hs, inset: true }];
  const recess: ShadowLayer[] = [{ x: 3, y: 3, blur: 5, colour: L.band, inset: true }, { x: -1, y: -1, blur: 1, colour: L.lip, inset: true }];
  const field: ShadowLayer[] = L.lineFirst
    ? [{ x: 1, y: 1, blur: 0, colour: L.line, inset: true }, ...recess]
    : [recess[0], { x: -1, y: -1, blur: 0, colour: L.line, inset: true }];
  const compact: ShadowLayer[] = [{ x: 1, y: 1, blur: 3, colour: L.ds, inset: true }, { x: -1, y: -1, blur: 2, colour: L.hs, inset: true }];
  const filled: ShadowLayer[] = [{ x: 3, y: 4, blur: 10, colour: L.d }];
  const filledNear: ShadowLayer[] = [{ x: 5, y: 6, blur: 14, colour: L.d }];
  return {
    raised, sunken, overlay: raisedLg, 'sunken-compact': compact, selected: recess,
    lift: raised, 'lift-near': near, 'lift-press': recess, 'lift-drag': pair(14, 32, L.d, L.h), track: sunken,
    action: raisedCompact, 'action-near': raised, 'action-press': recess, sheet: raisedLg,
    'raised-lg': raisedLg, 'near-lg': nearLg, near, 'raised-compact': raisedCompact,
    recess, field,
    quiet: raisedCompact, 'quiet-near': raised, 'quiet-press': recess,
    'action-filled': filled, 'action-filled-near': filledNear,
    'action-filled-press': [{ x: 2, y: 2, blur: 5, colour: L.accentPress, inset: true }],
    danger: filled, 'danger-near': filledNear,
    'danger-press': [{ x: 2, y: 2, blur: 5, colour: L.dangerPress, inset: true }],
    'knob-on': [{ x: 1, y: 2, blur: 4, colour: L.d }],
  };
}
```
and in `SHADOWS`: `neo: { light: neoShadows(NEO_LIGHT), dark: neoShadows(NEO_DARK) }`. For `hig` add to BOTH theme blocks, pointing at the existing arrays by name (extract `const higLightRaised = [...]` etc. so the alias is the same object): `'raised-lg': raised, 'near-lg': liftNear, near: liftNear, 'raised-compact': lift, recess: [], field: [], quiet: [], 'quiet-near': [], 'quiet-press': [], 'action-filled': action, 'action-filled-near': actionNear, 'action-filled-press': actionPress, danger: lift, 'danger-near': liftNear, 'danger-press': liftPress, 'knob-on': []`. For `minimal` add every new role as `[]`. Append the sixteen names to `SHADOW_ROLES` (`:1880`).

- [ ] **Step 6: Remap the surfaces** (`tokens.ts:1047`, `1063–1064`)

```ts
    light: {
      surface: 'neoPaper',
      surfaceRaised: 'neoPaper',
      surfaceSunken: 'neoWellLight',   // N2 (2026-10-02): a pressed fill is never lighter than its ground
      ...
    dark: {
      surface: 'neoNavy',
      surfaceRaised: 'neoNavy',        // N4 = B (2026-10-02): extrusion, not elevation; the 16% highlight carries the lift
      surfaceSunken: 'neoWellDark',    // N2
```
Update the `STYLE_COLOR_OVERRIDES` docblock (`:1021–1023`) and `neoNavyRaised`'s docblock (`:212–229`): `#232c50` is retired by N4 = B, kept as a primitive for the record.

- [ ] **Step 7: Amend the pinned tests that encoded the old values**
  - `tokens.test.ts:338–343` (13.347's sibling): the two `sunken-compact` strings → `'inset 1px 1px 3px #a89c9199, inset -1px -1px 2px #fffaf480'` and `'inset 1px 1px 3px #0000008c, inset -1px -1px 2px #f2e9e114'`, with a dated note.
  - `tokens.test.ts:421`: append the sixteen new names to `EXPECTED_SHADOW_ROLES`.
  - `tokens.test.ts:466–484` (13.412): neo `selected` → `'inset 3px 3px 5px #a89c91cc, inset -1px -1px 1px #fffaf4cc'` / `'inset 3px 3px 5px #000000bf, inset -1px -1px 1px #f2e9e159'`; keep the `not.toContain('4px 4px 9px')` lines.
  - `tokens.test.ts:539–546`: rename to `'neo/dark: surface, surfaceRaised are the SAME hex (N4 = B, 24.007); surfaceSunken is the well'` and assert `raised === surface`, `sunken === '#141a33'`.
  - `styling-tokens.test.ts:149–151` (20.011): the neo `sunken-compact` string → the 1/3 value above.
  - `neo-ux-fixes.test.ts:164–186` (23.006): `surfaceRaised` → `'#1b2340'`, drop the `#232c50`/`shadowNeoRaisedHighlightDark` lines, keep the text-role floors against `colorOf('dark','surfaceRaised','neo')`; add a dated note "amended by N4 = B, 24.007".
  - `neo-ux-fixes.test.ts:200–201` (23.007): the two `surfaceSunken` "unchanged" lines become the N2 values with a dated note.

- [ ] **Step 8: Run to verify GREEN**

Run: `cd packages/ui && pnpm build > /tmp/neo-build.log 2>&1; tail -3 /tmp/neo-build.log; pnpm exec vitest run test/neo-refresh.test.ts test/tokens.test.ts test/styling-tokens.test.ts test/neo-ux-fixes.test.ts test/field-placeholder-contrast.test.ts test/token-discipline.test.ts > /tmp/neo-t1.log 2>&1; tail -30 /tmp/neo-t1.log`
Expected: PASS. If `field-placeholder-contrast.test.ts` reddens on neo dark, it composites `fill-quaternary` over `surfaceRaised` (now `#1b2340`): change its neo rows to composite over `surfaceSunken` (the field's real ground) and record the new reading (`#a3a3a8` on `#141a33` = 6.82).

- [ ] **Step 9: Mutations (each must go RED, then revert)**
  - set `shadowNeoHighlightLight` back to `#fffffff2` → 24.001 and 24.003 red;
  - point `hig.light['action-filled']` at `lift` → 24.006 red (and 24.002 stays green, proving it is role-scoped);
  - drop `'recess'` from `SHADOW_ROLES` → 24.008 red and 13.411 red;
  - map neo-dark `surfaceSunken` back to `neoNavySunken` → 24.007 red.

- [ ] **Step 10: Catalogue + commit**

`test-cases/24-neo-refresh.md` §24.1 cases 24.001–24.008 flip ❌ → ✅; Features §21 bullet "⚙️ **Neo refresh token layer (N1–N10, 2026-10-02)** — `packages/ui/src/tokens.ts`: derived lamp per theme, sized pairs, recess/field/filled roles, sunken = well, dark raised = page hex".
```bash
git add packages/ui/src/tokens.ts packages/ui/test/neo-refresh.test.ts packages/ui/test/fixtures/hig-minimal-shadows.before.json packages/ui/test/tokens.test.ts packages/ui/test/styling-tokens.test.ts packages/ui/test/neo-ux-fixes.test.ts packages/ui/test/field-placeholder-contrast.test.ts test-cases/24-neo-refresh.md Features.md
git commit -m "Neo refresh T1: the token layer (24.001-24.008)"
```

---

### Task 2: Press inversion and the filled-fill rule (N1, N8)

**Files:**
- Modify: `packages/ui/src/ui.css:96–99` (`.gn-button:focus-visible`), `:108–127` (`.gn-button--primary` rest/hover/active), `:130–145` (`.gn-button--danger`), `:159–167` (`:disabled`), `:8136–8138` (`.gn-switch:checked`, `::after`)
- Modify: `packages/ui/test/styling-buttons.test.ts:25–45` (20.021–20.022 pins), `:86–90` (20.025)
- Test: `packages/ui/test/neo-refresh.test.ts`

**Interfaces:**
- Consumes: `--gn-shadow-action-filled`, `--gn-shadow-action-filled-near`, `--gn-shadow-action-filled-press`, `--gn-shadow-danger`, `--gn-shadow-danger-near`, `--gn-shadow-danger-press`, `--gn-shadow-knob-on`, `--gn-shadow-lift-press` (T1); `ruleExactly(css, selector)`, `valueOf(body, prop)`, `cssOf('ui'|'globals')` from the helpers.
- Produces: nothing new for later tasks; T8 reads the computed styles these rules produce.

- [ ] **Step 1: Write the failing tests** (append to `neo-refresh.test.ts`)

```ts
import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';
import { cssOf } from './helpers/style-patterns.js';
const ui = cssOf('ui');
const globals = cssOf('globals');

describe('24.020 the primary is a filled surface: one dark fall, a longer one on hover, a self-coloured inset on press (N8)', () => {
  it('24.020 .gn-button--primary reads action-filled / action-filled-near / action-filled-press and keeps its edge, fill and scale', () => {
    const rest = ruleExactly(ui, '.gn-button--primary');
    expect(valueOf(rest, 'box-shadow')).toBe('var(--gn-shadow-action-filled)');
    expect(valueOf(rest, 'border')).toBe('1px solid var(--gn-accent-edge)');
    expect(valueOf(rest, 'background')).toBe('var(--gn-accent)');
    const hover = ruleExactly(ui, '.gn-button--primary:hover:not(:disabled)');
    expect(valueOf(hover, 'box-shadow')).toBe('var(--gn-shadow-action-filled-near)');
    expect(valueOf(hover, 'transform')).toBe('scale(1.04)');
    const press = ruleExactly(ui, '.gn-button--primary:active:not(:disabled)');
    expect(valueOf(press, 'box-shadow')).toBe('var(--gn-shadow-action-filled-press)');
    expect(valueOf(press, 'transform')).toBe('scale(0.98)');
    // CONTROL: no rule in either sheet gives the primary the paper pair any more.
    expect(ui).not.toMatch(/\.gn-button--primary[^{]*\{[^}]*--gn-shadow-action\)/);
  });
});

describe('24.021 the confirm button takes the danger roles: a self-coloured red inset on press (N8)', () => {
  it('24.021 .gn-button--danger reads danger / danger-near / danger-press', () => {
    expect(valueOf(ruleExactly(ui, '.gn-button--danger'), 'box-shadow')).toBe('var(--gn-shadow-danger)');
    expect(valueOf(ruleExactly(ui, '.gn-button--danger:hover:not(:disabled)'), 'box-shadow')).toBe('var(--gn-shadow-danger-near)');
    expect(valueOf(ruleExactly(ui, '.gn-button--danger:active:not(:disabled)'), 'box-shadow')).toBe('var(--gn-shadow-danger-press)');
    // CONTROL: the quiet danger stays flat.
    expect(valueOf(ruleExactly(ui, '.gn-button--danger-quiet'), 'box-shadow')).toBe('none');
  });
});

describe('24.022 a disabled filled button paints no shadow ("no depth" = "not interactive", U7 extended)', () => {
  it('24.022 .gn-button:disabled sets box-shadow: none beside its opacity', () => {
    const d = ruleExactly(ui, '.gn-button:disabled');
    expect(valueOf(d, 'box-shadow')).toBe('none');
    expect(valueOf(d, 'opacity')).toBe('var(--gn-disabled-opacity)');
    // CONTROL: aria-disabled (quiet, still focusable) keeps the same look.
    expect(valueOf(ruleExactly(ui, ".gn-button[aria-disabled='true']"), 'box-shadow')).toBe('none');
  });
});

describe('24.023 the button focus ring sits 3px out, so the accent edge and the ring read as one ring with a gap', () => {
  it('24.023 .gn-button:focus-visible is outline 2px, offset 3px (the field already uses 3px, U9)', () => {
    const f = ruleExactly(ui, '.gn-button:focus-visible');
    expect(valueOf(f, 'outline')).toBe('2px solid var(--gn-focus-ring)');
    expect(valueOf(f, 'outline-offset')).toBe('3px');
    // CONTROL: the field's own offset is unchanged.
    expect(valueOf(ruleExactly(ui, '.gn-field__input:focus-visible'), 'outline-offset')).toBe('3px');
  });
});

describe('24.024 the on-switch knob carries one dark fall and no highlight (N8)', () => {
  it('24.024 .gn-switch:checked::after reads knob-on; the checked track stays a flat accent', () => {
    expect(valueOf(ruleExactly(ui, '.gn-switch:checked::after'), 'box-shadow')).toBe('var(--gn-shadow-knob-on)');
    const on = ruleExactly(ui, '.gn-switch:checked');
    expect(valueOf(on, 'background')).toBe('var(--gn-accent)');
    expect(valueOf(on, 'box-shadow')).toBe('none');
  });
});

describe('24.025 cards, doors and board cards press into the surface (N1): every :active site reads lift-press, which neo renders inset', () => {
  it('24.025 the six press sites read var(--gn-shadow-lift-press) and no card rule transforms', () => {
    const sites: Array<[string, string]> = [
      [ui, '.gn-board__card-slot:active > .gn-board-card'],
      [ui, '.template-gallery__door:active'],
      [globals, '.gn-workspace-home__link:active'],
      [globals, '.gn-card:has(> .gn-workspace-card__door:active)'],
    ];
    for (const [css, sel] of sites) {
      const body = ruleExactly(css, sel);
      expect(valueOf(body, 'box-shadow'), sel).toBe('var(--gn-shadow-lift-press)');
      expect(valueOf(body, 'transform'), sel).toBeNull();
    }
    // the rule the ruling rests on: a shadow change, not motion
    expect(valueOf(ruleExactly(ui, '.gn-board-card'), 'transition')).toContain('box-shadow');
  });
});

describe('24.026 the drag clone keeps its lift while the source card presses', () => {
  it('24.026 .gn-board-drag-image > .gn-board-card reads lift-drag, not lift-press', () => {
    expect(valueOf(ruleExactly(ui, '.gn-board-drag-image > .gn-board-card'), 'box-shadow')).toBe('var(--gn-shadow-lift-drag)');
    expect(shadowValueOf('neo', 'light', 'lift-drag').startsWith('inset')).toBe(false);
  });
});
```

- [ ] **Step 2: RED** — `cd packages/ui && pnpm exec vitest run test/neo-refresh.test.ts -t "24.02" > /tmp/neo-t2.log 2>&1; tail -30 /tmp/neo-t2.log`. Expected: 24.020–24.024 FAIL (old variables), 24.025–24.026 PASS (controls already true — note it in the commit).

- [ ] **Step 3: Implement** (`ui.css`)

```css
.gn-button:focus-visible {
  outline: 2px solid var(--gn-focus-ring);
  /* Neo refresh 24.023 (2026-10-02): 3px, not 1px — the primary's 1px accent edge and the 2px ring read as one ring with a gap. The field already sits at 3px (U9). */
  outline-offset: 3px;
}
.gn-button--primary {
  min-height: 3rem;
  padding: 0 1.5rem;
  border: 1px solid var(--gn-accent-edge);
  background: var(--gn-accent);
  color: var(--gn-accent-text);
  font-size: 1.0625rem;
  /* A FILLED surface carries no highlight (neo refresh N8, 24.020): one dark fall; hig maps action-filled to its own action, so it is unchanged there. */
  box-shadow: var(--gn-shadow-action-filled);
}
.gn-button--primary:hover:not(:disabled) {
  background: var(--gn-accent-edge);
  box-shadow: var(--gn-shadow-action-filled-near);
  transform: scale(1.04);
}
.gn-button--primary:active:not(:disabled) {
  box-shadow: var(--gn-shadow-action-filled-press);
  transform: scale(0.98);
  transition-duration: var(--gn-motion-feedback);
}
.gn-button--danger { /* ... existing lines ... */ box-shadow: var(--gn-shadow-danger); }
.gn-button--danger:hover:not(:disabled) { box-shadow: var(--gn-shadow-danger-near); transform: scale(1.04); }
.gn-button--danger:active:not(:disabled) { box-shadow: var(--gn-shadow-danger-press); transform: scale(0.98); transition-duration: var(--gn-motion-feedback); }
.gn-button:disabled { opacity: var(--gn-disabled-opacity); cursor: not-allowed; box-shadow: none; }
.gn-button[aria-disabled='true'] { opacity: var(--gn-disabled-opacity); cursor: not-allowed; box-shadow: none; }
```
and at `:8136–8138`:
```css
.gn-switch:checked { background: var(--gn-accent); box-shadow: none; }
/* Neo refresh 24.024: on the accent track the knob drops its highlight and keeps one small fall (none in hig/minimal). */
.gn-switch:checked::after { transform: translateX(1.25rem); box-shadow: var(--gn-shadow-knob-on); }
```
Amend `styling-buttons.test.ts:28/42/45` (20.021–20.022: `action` → `action-filled`, `action-near` → `action-filled-near`, `action-press` → `action-filled-press`) and `:86` (20.025: `lift` → `danger`) with a dated note; 20.023's `not.toBe(primary)` still holds (`danger` ≠ `action-filled` in hig: `lift` vs `action`).

- [ ] **Step 4: GREEN** — `pnpm exec vitest run test/neo-refresh.test.ts test/styling-buttons.test.ts test/components.test.tsx > /tmp/neo-t2.log 2>&1; tail -30 /tmp/neo-t2.log`. Expected: PASS, 13.340 included (no `[data-style]` button block was written).

- [ ] **Step 5: Mutations** — put `var(--gn-shadow-action)` back on the primary → 24.020 red; drop `box-shadow: none` from `:disabled` → 24.022 red; set `outline-offset: 1px` → 24.023 red; write `[data-style="neo"] .gn-button--primary { box-shadow: none }` → 13.340 red (the guard the lane must respect).

- [ ] **Step 6: Catalogue + commit** — cases 24.020–24.026 ✅ in §24.2; Features §21 bullet "✅ **Press inverts; filled surfaces carry one fall** (N1, N8)".
```bash
git add packages/ui/src/ui.css packages/ui/test/neo-refresh.test.ts packages/ui/test/styling-buttons.test.ts test-cases/24-neo-refresh.md Features.md
git commit -m "Neo refresh T2: press inverts, filled fills carry no highlight (24.020-24.026)"
```

---

### Task 3: The sunken family and the rim-less neo field (N2, N9, N10)

**Files:**
- Modify: `packages/ui/src/ui.css:7176–7180` (`[data-style="neo"] .gn-field__input`), `:7191–7196` (neo disabled, unchanged but asserted), `:6289–6293` (`[data-style="neo"] .gn-help__search-input`), `:7535–7537` (`[data-style="neo"] .gn-project__search`), `:4804–4808` (`[data-style="neo"] .workflow-builder-screen__name`), `:6931–6938` (`.gn-segmented`), `:6946–6978` (`.gn-segmented__item`: add a transition), `:7017–7054` (neo `--on`: `background: var(--gn-surface-track)`), `:6428` (`.gn-help__toggle:hover`)
- Modify: `apps/web/app/globals.css:2942–2945` (neo nav current → `recess`), `:2887–2899` (`.gn-nav a`: add `box-shadow` to the transition), `:4892–4897` (task checkbox → `sunken-compact`)
- Modify: `packages/ui/test/components.test.tsx:648–690` (13.339), `packages/ui/test/neo-ux-fixes.test.ts:80–99` (23.002), `packages/ui/test/styling-b2-fields.test.ts:38–45` (20.213 stays green — assert it)
- Modify: `apps/web/e2e-stack/viewport.spec.ts:1093–1113` (`assertSunkenNoBorderField`), `apps/web/e2e-stack/non-text-contrast-roster.json` (the sanctioned neo-field note)
- Test: `packages/ui/test/neo-refresh.test.ts`

**Interfaces:**
- Consumes: `--gn-shadow-field`, `--gn-shadow-recess`, `--gn-shadow-sunken-compact`, `--gn-surface-sunken` (= the well, T1), `--gn-surface-track`.
- Produces: the four neo field arms with `border: 1px solid transparent` and `box-shadow: var(--gn-shadow-field)` — T8 measures their computed `boxShadow` for the line colour.

- [ ] **Step 1: Write the failing tests**

```ts
describe('24.040 a neo text field has no rim; its recess edge is the boundary (N10; hig/minimal keep the ring)', () => {
  const NEO_FIELDS = [
    '[data-style="neo"] .gn-field__input',
    '[data-style="neo"] .gn-help__search-input',
    '[data-style="neo"] .gn-project__search',
    '[data-style="neo"] .workflow-builder-screen__name',
  ];
  it('24.040 every neo field arm is border: 1px solid transparent, background surface-sunken, box-shadow field; the base rule keeps --gn-border', () => {
    for (const sel of NEO_FIELDS) {
      const body = ruleExactly(ui, sel);
      expect(valueOf(body, 'border'), sel).toBe('1px solid transparent');
      expect(valueOf(body, 'box-shadow'), sel).toBe('var(--gn-shadow-field)');
      expect(valueOf(body, 'background'), sel).toBe('var(--gn-surface-sunken)');
    }
    // CONTROL (the style scoping): the unscoped field keeps its 1px ring; hig/minimal render the ring and no field shadow.
    expect(valueOf(ruleExactly(ui, '.gn-field__input'), 'border')).toBe('1px solid var(--gn-border)');
    expect(shadowValueOf('hig', 'light', 'field')).toBe('none');
    // and the disabled neo field stays flat (U7): transparent border, no shadow, textSubtle
    const dis = ruleExactly(ui, ['[data-style="neo"] .gn-field__input:disabled', '[data-style="neo"] .gn-select__trigger:disabled']);
    expect(valueOf(dis, 'box-shadow')).toBe('none');
    expect(valueOf(dis, 'color')).toBe('var(--gn-text-subtle)');
  });
});

describe('24.041 the control recesses read recess; wells keep sunken (N9)', () => {
  it('24.041 segmented track, current nav item and the pressed segment read recess on the track fill; board columns and trays read track/sunken', () => {
    expect(valueOf(ruleExactly(ui, '[data-style="neo"] .gn-segmented'), 'box-shadow')).toBe('var(--gn-shadow-recess)');
    const on = ruleExactly(ui, '[data-style="neo"] .gn-segmented__item--on');
    expect(valueOf(on, 'box-shadow')).toBe('var(--gn-shadow-selected)'); // selected = recess in neo (24.004)
    expect(valueOf(on, 'background')).toBe('var(--gn-surface-track)');   // N2: never lighter than its track
    const nav = ruleExactly(globals, ["[data-style=\"neo\"] .gn-nav a[aria-current='page']", "[data-style=\"neo\"] .gn-nav button[aria-current='page']"]);
    expect(valueOf(nav, 'box-shadow')).toBe('var(--gn-shadow-recess)');
    // CONTROL: wells did not move to the control inset.
    expect(valueOf(ruleExactly(ui, '.gn-board__column'), 'box-shadow')).toBe('var(--gn-shadow-track)');
    expect(valueOf(ruleExactly(ui, '.gn-ticket-sheet__fields'), 'box-shadow')).toBe('var(--gn-shadow-track)');
    expect(valueOf(ruleExactly(ui, '.gn-segmented'), 'box-shadow')).toBe('var(--gn-shadow-track)'); // hig keeps its lit-from-above track
  });
});

describe('24.042 the task checkbox takes the chip-sized inset and keeps its strong border', () => {
  it('24.042 the neo unchecked task box reads sunken-compact on surface-sunken with border-strong', () => {
    const box = ruleExactly(globals, ["[data-style='neo'] .ticket-editor__content ul[data-type='taskList'] input[type='checkbox']:not(:checked)", "[data-style='neo'] .gn-comment__task > input[type='checkbox']:not(:checked)"]);
    expect(valueOf(box, 'box-shadow')).toBe('var(--gn-shadow-sunken-compact)');
    expect(valueOf(box, 'border-color')).toBe('var(--gn-border-strong)');
  });
});

describe('24.043 hover lifts, press recesses: the help toggle no longer presses on hover', () => {
  it('24.043 .gn-help__toggle:hover reads raised-compact; the segmented item and nav links transition box-shadow', () => {
    expect(valueOf(ruleExactly(ui, '.gn-help__toggle:hover'), 'box-shadow')).toBe('var(--gn-shadow-raised-compact)');
    expect(valueOf(ruleExactly(ui, '.gn-segmented__item'), 'transition')).toContain('box-shadow');
    expect(valueOf(ruleExactly(globals, '.gn-nav a'), 'transition')).toContain('box-shadow');
  });
});

describe('24.044 a neo field inside a dark well still has a visible edge (Review Focus 2)', () => {
  it('24.044 the dark line clears 3.0 against the well AND the fill; the light line clears 3.0 against the well, paper and the raised card', () => {
    expect(contrastRatio('#7d88a8', colorOf('dark', 'surfaceWell', 'neo'))).toBeGreaterThanOrEqual(3.0);
    expect(contrastRatio('#7d88a8', colorOf('dark', 'surfaceSunken', 'neo'))).toBeGreaterThanOrEqual(3.0);
    for (const bg of ['surfaceWell', 'surface', 'surfaceRaised'] as const) {
      expect(contrastRatio('#897362', colorOf('light', bg, 'neo')), bg).toBeGreaterThanOrEqual(3.0);
    }
    // CONTROL: the soft edge is NOT claimed — the light lip and the dark band are under 3:1 and the test says so.
    expect(contrastRatio(over('#fffaf4cc', '#e6dcd2'), '#e6dcd2')).toBeLessThan(3.0);
    expect(contrastRatio(over('#000000bf', '#141a33'), '#141a33')).toBeLessThan(3.0);
  });
});
```

- [ ] **Step 2: RED** — `pnpm exec vitest run test/neo-refresh.test.ts -t "24.04" > /tmp/neo-t3.log 2>&1; tail -30 /tmp/neo-t3.log`. Expected: 24.040–24.043 FAIL; 24.044 PASS (a pure-token control; note it).

- [ ] **Step 3: Implement**

`ui.css:7176–7180`:
```css
/* OWNER RULING N10 (2026-10-02, "go with B in neumorphic"; case 24.040): a neo text field has NO uniform rim. Its boundary is the
   recess edge — a crisp 1px line at >= 3:1 on one side, as WCAG 1.4.11's partial-edge example allows (light: the dark line
   top-left, #897362, 3.31 on the fill; dark: the light lip bottom-right, #7d88a8, 4.86 on the fill, 3.85 against the page).
   The 1px border stays TRANSPARENT so the box keeps its size. hig and minimal keep the U5 ring through the base rule above;
   `fieldRim` stays mapped for them. The field ground is `surfaceSunken`, which is the well colour since N2. */
[data-style="neo"] .gn-field__input {
  border: 1px solid transparent;
  background: var(--gn-surface-sunken);
  box-shadow: var(--gn-shadow-field);
}
```
Same three lines in `[data-style="neo"] .gn-help__search-input` (`:6289`), `[data-style="neo"] .gn-project__search` (`:7535`, which today adds only the ring — give it the full three) and `[data-style="neo"] .workflow-builder-screen__name` (`:4804`). Add after `.gn-segmented` (`:6938`): `[data-style="neo"] .gn-segmented { box-shadow: var(--gn-shadow-recess); }` (the base keeps `track` for hig). In `[data-style="neo"] .gn-segmented__item--on` (`:7017`) change `background: var(--gn-surface-sunken)` → `var(--gn-surface-track)` (N2; the docblock there already anticipates a palette that separates them). `.gn-segmented__item` (`:6946`): add `transition: box-shadow var(--gn-motion-move) var(--gn-motion-ease-out);` and a reduced-motion arm `transition: none`. `.gn-help__toggle:hover` (`:6428`): `var(--gn-shadow-sunken)` → `var(--gn-shadow-raised-compact)`. `globals.css:2942`: `var(--gn-shadow-sunken)` → `var(--gn-shadow-recess)`; `.gn-nav a` (`:2887`) transition gains `box-shadow var(--gn-motion-move) var(--gn-motion-ease-out)`; `:4892` task checkbox `var(--gn-shadow-sunken)` → `var(--gn-shadow-sunken-compact)`.

Amend: `components.test.tsx:648` (13.339) → "under neo the field input is sunken on the well with the recess line and a transparent border (N10) — hig/minimal keep their border"; `neo-ux-fixes.test.ts:87–98` (23.002) → border `'1px solid transparent'`, shadow `'var(--gn-shadow-field)'`, dated "amended by N10, 24.040"; `viewport.spec.ts:1093–1113` → keep `borderStyle === 'solid'`, add `expect(style.borderColor).toBe('rgba(0, 0, 0, 0)')` and `expect(style.boxShadow).toContain(theme === 'dark' ? 'rgb(125, 136, 168)' : 'rgb(137, 115, 98)')` (the line layer, read via `getComputedStyle`), with the comment re-written: the boundary is the line layer, ≥3:1, computed from the token; `non-text-contrast-roster.json`: the sanctioned neo-field entry's note says "boundary = the `--gn-shadow-field` line layer (N10, 24.040), 3.31 light / 4.86 dark, computed in `neo-refresh.test.ts`".

- [ ] **Step 4: GREEN** — `pnpm exec vitest run test/neo-refresh.test.ts test/neo-ux-fixes.test.ts test/components.test.tsx test/styling-b2-fields.test.ts test/styling-tokens.test.ts > /tmp/neo-t3.log 2>&1; tail -30 /tmp/neo-t3.log`; then `cd ../../apps/web && pnpm exec vitest run test/sign-in-neo-restyle.test.ts > /tmp/neo-t3b.log 2>&1; tail -10 /tmp/neo-t3b.log`. Expected: PASS (20.212's `flatBoundaryOffenders` sees a transparent border, not a flat boundary — if it reddens, add the four neo field selectors to its `KEPT` list with the N10 citation).

- [ ] **Step 5: Mutations** — restore `border: 1px solid var(--gn-field-rim)` on the field arm → 24.040 red; make `--on` read `--gn-surface-sunken` → 24.041 red; swap `#7d88a8` for `#6f7997` in `shadowNeoLineDark` → 24.044 still green (3.96) but 24.005 red (the pin) — record both.

- [ ] **Step 6: Catalogue + commit** — 24.040–24.044 ✅ in §24.3; Features §21 bullet "✅ **The neo field without a rim; recesses sized to the box** (N2, N9, N10) — hig/minimal keep the ring".
```bash
git add packages/ui/src/ui.css apps/web/app/globals.css packages/ui/test/neo-refresh.test.ts packages/ui/test/neo-ux-fixes.test.ts packages/ui/test/components.test.tsx packages/ui/test/styling-b2-fields.test.ts apps/web/e2e-stack/viewport.spec.ts apps/web/e2e-stack/non-text-contrast-roster.json test-cases/24-neo-refresh.md Features.md
git commit -m "Neo refresh T3: sunken family and the rim-less neo field (24.040-24.044)"
```

---

### Task 4: Depth on ghost and icon buttons (N3)

**Files:**
- Modify: `packages/ui/src/ui.css:7252–7258` (`.gn-button--ghost`, `:hover`), `:959–981` (`.gn-sheet__close`), `:2022–2041` (`.gn-row-action`), `:148–157` (the reduced-motion arm of `.gn-button`)
- Test: `packages/ui/test/neo-refresh.test.ts`; `packages/ui/test/styling-buttons.test.ts:65–75` (20.024 stays green)

**Interfaces:**
- Consumes: `--gn-shadow-quiet`, `--gn-shadow-quiet-near`, `--gn-shadow-quiet-press` (T1; `none` in hig and minimal).
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

```ts
describe('24.060 ghost buttons keep their border and gain the quiet depth, through the base rule only (N3, 13.340)', () => {
  it('24.060 .gn-button--ghost reads quiet / quiet-near / quiet-press; the 1px --gn-border edge stays; no [data-style] block names a button', () => {
    const ghost = ruleExactly(ui, '.gn-button--ghost');
    expect(valueOf(ghost, 'box-shadow')).toBe('var(--gn-shadow-quiet)');
    expect(valueOf(ghost, 'border')).toBe('1px solid var(--gn-border)');
    expect(valueOf(ruleExactly(ui, '.gn-button--ghost:hover:not(:disabled)'), 'box-shadow')).toBe('var(--gn-shadow-quiet-near)');
    expect(valueOf(ruleExactly(ui, '.gn-button--ghost:active:not(:disabled)'), 'box-shadow')).toBe('var(--gn-shadow-quiet-press)');
    // CONTROL: hig and minimal ghosts stay flat because their quiet roles are none.
    expect(shadowValueOf('hig', 'light', 'quiet')).toBe('none');
    expect(shadowValueOf('minimal', 'dark', 'quiet-press')).toBe('none');
    expect(shadowValueOf('neo', 'light', 'quiet-press').startsWith('inset')).toBe(true);
  });
});

describe('24.061 icon buttons (the sheet close, the row actions) take the same quiet depth', () => {
  it('24.061 .gn-sheet__close and .gn-row-action read quiet at rest and quiet-press on :active, keep their hover fill, and go flat when disabled', () => {
    for (const sel of ['.gn-sheet__close', '.gn-row-action']) {
      expect(valueOf(ruleExactly(ui, sel), 'box-shadow'), sel).toBe('var(--gn-shadow-quiet)');
      expect(valueOf(ruleExactly(ui, `${sel}:active:not(:disabled)`), 'box-shadow'), sel).toBe('var(--gn-shadow-quiet-press)');
    }
    expect(valueOf(ruleExactly(ui, ['.gn-sheet__close:hover', '.gn-sheet__close:focus-visible']), 'background')).toBe('var(--gn-fill-tertiary)');
    expect(valueOf(ruleExactly(ui, ['.gn-row-action:disabled', '.gn-list__bulk-close:disabled']), 'box-shadow')).toBe('none');
  });
});

describe('24.065 reduced motion removes the transition, never the shadow (Review Focus 5)', () => {
  it('24.065 the prefers-reduced-motion arm for .gn-button sets transition: none and no box-shadow', () => {
    const arm = parseRules(ui).find((r) => r.atRule?.includes('prefers-reduced-motion') && r.selectors.includes('.gn-button'));
    expect(arm, 'the reduced-motion arm exists').toBeTruthy();
    expect(valueOf(arm!.body, 'transition')).toBe('none');
    expect(valueOf(arm!.body, 'box-shadow')).toBeNull();
  });
});
```

- [ ] **Step 2: RED** — `pnpm exec vitest run test/neo-refresh.test.ts -t "24.06" > /tmp/neo-t4.log 2>&1; tail -20 /tmp/neo-t4.log`. Expected: 24.060–24.061 FAIL; 24.065 PASS (control).

- [ ] **Step 3: Implement** (`ui.css`)

```css
.gn-button--ghost {
  background: transparent;
  border: 1px solid var(--gn-border);
  color: var(--gn-text-muted);
  font-weight: 600;
  /* Neo refresh N3 (2026-10-02, 24.060): depth on the quiet button, the border KEPT (D6). `quiet` renders none in hig and
     minimal, so this base-rule line is how neo gets its pair without a [data-style] block (13.340). */
  box-shadow: var(--gn-shadow-quiet);
}
.gn-button--ghost:hover:not(:disabled) { background: var(--gn-fill-quaternary); box-shadow: var(--gn-shadow-quiet-near); }
.gn-button--ghost:active:not(:disabled) { box-shadow: var(--gn-shadow-quiet-press); }
```
`.gn-sheet__close` (`:959`): add `box-shadow: var(--gn-shadow-quiet); transition: box-shadow var(--gn-motion-move) var(--gn-motion-ease-out), background-color var(--gn-motion-feedback) ease-out;` and a new rule `.gn-sheet__close:active:not(:disabled) { box-shadow: var(--gn-shadow-quiet-press); }`. `.gn-row-action` (`:2022`): the same two lines and `.gn-row-action:active:not(:disabled) { box-shadow: var(--gn-shadow-quiet-press); }`; `:2018` (`:disabled`) gains `box-shadow: none`. The reduced-motion arm (`:148–157`) already sets `transition: none` on `.gn-button`; add `.gn-sheet__close, .gn-row-action { transition: none; }` to it.

- [ ] **Step 4: GREEN** — `pnpm exec vitest run test/neo-refresh.test.ts test/styling-buttons.test.ts test/components.test.tsx test/styling-sheet.test.ts > /tmp/neo-t4.log 2>&1; tail -20 /tmp/neo-t4.log`. Expected: PASS; 20.024 (ghost border/fill) and 13.289 untouched.

- [ ] **Step 5: Mutations** — write `[data-style="neo"] .gn-button--ghost { box-shadow: var(--gn-shadow-quiet); }` instead of the base line → 13.340 red; remove the `border` line → 20.024 and 24.060 red; set hig `quiet` to `lift` in tokens → 24.060's control red.

- [ ] **Step 6: Catalogue + commit** — 24.060, 24.061, 24.065 ✅ in §24.4; Features §21 "✅ **Quiet depth on ghost and icon buttons** (N3)".
```bash
git add packages/ui/src/ui.css packages/ui/test/neo-refresh.test.ts test-cases/24-neo-refresh.md Features.md
git commit -m "Neo refresh T4: quiet depth on ghost and icon buttons (24.060, 24.061, 24.065)"
```

---

### Task 5: Switch and checkbox neo arms (N6)

**Files:**
- Modify: `packages/ui/src/ui.css:8097–8153` (`.gn-switch` family), `:2372–2452` (`.gn-list__column-option`, `__column-box`, checked)
- Test: `packages/ui/test/neo-refresh.test.ts`

**Interfaces:**
- Consumes: `--gn-shadow-recess`, `--gn-shadow-raised-compact`, `--gn-shadow-sunken-compact`, `--gn-surface-well`, `--gn-surface-sunken`, `--gn-border`, `--gn-border-strong`.
- Produces: `[data-style="neo"] .gn-switch` and `[data-style="neo"] .gn-list__column-box` arms (these are not `.gn-button`, so 13.340 does not apply; they are style arms like `[data-style="neo"] .gn-chip`).

- [ ] **Step 1: Write the failing tests**

```ts
describe('24.070 the neo switch: a recessed off track on the well colour, a raised knob, the accent on-track kept (N6, FD2)', () => {
  it('24.070 the neo switch arm reads well + recess; the knob reads raised-compact and keeps its border-strong ring; disabled is flat', () => {
    const track = ruleExactly(ui, '[data-style="neo"] .gn-switch');
    expect(valueOf(track, 'background')).toBe('var(--gn-surface-well)');
    expect(valueOf(track, 'box-shadow')).toBe('var(--gn-shadow-recess)');
    const knob = ruleExactly(ui, '[data-style="neo"] .gn-switch::after');
    expect(valueOf(knob, 'box-shadow')).toBe('var(--gn-shadow-raised-compact)');
    expect(valueOf(ruleExactly(ui, '.gn-switch::after'), 'border')).toBe('1px solid var(--gn-border-strong)');
    expect(valueOf(ruleExactly(ui, ['[data-style="neo"] .gn-switch:disabled', '[data-style="neo"] .gn-switch:disabled::after']), 'box-shadow')).toBe('none');
    // CONTROL: the base (hig/minimal) switch is unchanged — fill-secondary track, no shadow.
    const base = ruleExactly(ui, '.gn-switch');
    expect(valueOf(base, 'background')).toBe('var(--gn-fill-secondary)');
    expect(valueOf(base, 'box-shadow')).toBeNull();
    expect(valueOf(ruleExactly(ui, '.gn-switch:checked'), 'background')).toBe('var(--gn-accent)');
  });
});

describe('24.071 the neo column checkbox: a recessed box when off, a flat accent when on (N6)', () => {
  it('24.071 the neo box reads sunken-compact on surface-sunken with a --gn-border edge; checked stays accent with no shadow', () => {
    const box = ruleExactly(ui, '[data-style="neo"] .gn-list__column-box');
    expect(valueOf(box, 'background')).toBe('var(--gn-surface-sunken)');
    expect(valueOf(box, 'box-shadow')).toBe('var(--gn-shadow-sunken-compact)');
    expect(valueOf(box, 'border')).toBe('1px solid var(--gn-border)');
    const on = ruleExactly(ui, "[data-style=\"neo\"] .gn-list__column-option input[type='checkbox']:checked + .gn-list__column-box");
    expect(valueOf(on, 'box-shadow')).toBe('none');
    expect(valueOf(on, 'border-color')).toBe('transparent');
    // the pill around it is a 44px control: raised-compact, not the card pair
    expect(valueOf(ruleExactly(ui, '.gn-list__column-option'), 'box-shadow')).toBe('var(--gn-shadow-raised-compact)');
    // CONTROL: the base box is the flat fill hig/minimal keep.
    expect(valueOf(ruleExactly(ui, '.gn-list__column-box'), 'background')).toBe('var(--gn-fill-secondary)');
  });
});
```

- [ ] **Step 2: RED** — `pnpm exec vitest run test/neo-refresh.test.ts -t "24.07" > /tmp/neo-t5.log 2>&1; tail -20 /tmp/neo-t5.log`. Expected: FAIL (no neo arms).

- [ ] **Step 3: Implement** (append after `.gn-switch:disabled::after`, `ui.css:8153`)

```css
/* Neo refresh N6 (2026-10-02; 24.070): the switch gets a neo arm. The OFF track is a recess on the well colour, the knob is
   raised on the compact pair and keeps its border-strong ring (the 2.95 debt recorded above is untouched); the ON track
   stays the flat accent (FD2: a switch's on-state is its value), its knob carries one fall (`knob-on`, T2). Disabled is flat. */
[data-style="neo"] .gn-switch {
  background: var(--gn-surface-well);
  box-shadow: var(--gn-shadow-recess);
  transition: background 0.15s ease, box-shadow var(--gn-motion-move) var(--gn-motion-ease-out);
}
[data-style="neo"] .gn-switch::after { box-shadow: var(--gn-shadow-raised-compact); }
[data-style="neo"] .gn-switch:checked { box-shadow: none; }
[data-style="neo"] .gn-switch:disabled,
[data-style="neo"] .gn-switch:disabled::after { box-shadow: none; }
```
and after `.gn-list__column-option input[type='checkbox']:checked + .gn-list__column-box::after` (`:2451`):
```css
/* Neo refresh N6 (24.071): the box is a chip-sized recess when off; checked stays the flat accent (the tick is the cue). */
[data-style="neo"] .gn-list__column-box {
  background: var(--gn-surface-sunken);
  box-shadow: var(--gn-shadow-sunken-compact);
  border: 1px solid var(--gn-border);
}
[data-style="neo"] .gn-list__column-option input[type='checkbox']:checked + .gn-list__column-box {
  background: var(--gn-accent);
  box-shadow: none;
  border-color: transparent;
}
```
and in `.gn-list__column-option` (`:2380`): `box-shadow: var(--gn-shadow-lift)` → `var(--gn-shadow-raised-compact)` (hig maps `raised-compact` to `lift`, so hig is unchanged). The base `.gn-list__column-box` (`:2394`) gets `border: 1px solid transparent` so the neo arm's 1px does not reflow.

- [ ] **Step 4: GREEN** — `pnpm exec vitest run test/neo-refresh.test.ts test/components.test.tsx test/styling-b6-list.test.ts > /tmp/neo-t5.log 2>&1; tail -20 /tmp/neo-t5.log`. Expected: PASS (13.671's focus ring on the box is untouched; if `styling-b6-list` pins `--gn-shadow-lift` on the pill, amend it with the N6 note).

- [ ] **Step 5: Mutations** — delete `[data-style="neo"] .gn-switch::after` → 24.070 red; give the checked box `var(--gn-shadow-sunken-compact)` → 24.071 red; change the base `.gn-switch` background → 24.070's control red.

- [ ] **Step 6: Catalogue + commit** — 24.070–24.071 ✅ in §24.5; Features §21 "✅ **Switch and checkbox neo arms** (N6)".
```bash
git add packages/ui/src/ui.css packages/ui/test/neo-refresh.test.ts packages/ui/test/styling-b6-list.test.ts test-cases/24-neo-refresh.md Features.md
git commit -m "Neo refresh T5: switch and checkbox neo arms (24.070, 24.071)"
```

---

### Task 6: Halo clearance — sized pairs on cards, the 14px board, the crowding sites (N7)

**Files:**
- Modify: `packages/ui/src/tokens.ts` (new `halo` lengths beside `radii` `:1081–1095`; emitted in `declarationsFor` `:1897–1904`)
- Modify: `packages/ui/src/ui.css:1168–1178` (`.gn-board__column` gap), `:1208–1214` (`__column-header` padding), `:1287` (`__cards` gap), `:443–449` (`.gn-dialog` → `near-lg`), `:4235–4242` (`.gn-select__panel` → `near-lg`), `:4256–4263` (`.gn-popover` → `near-lg`), `:8216` (`.gn-infotip__panel` → `near-lg`), `:4556` (`.workflow-rebind-dialog` generic drop → `near-lg`), `:7688` (`.gn-filters__panel` generic drop → `sheet`)
- Modify: `apps/web/app/globals.css:169` (`.gn-shell__main` margin-top), `:793–798` (`.gn-account__section` gap), `:2078–2083` (`.gn-nav` → `raised-lg`), `:2736`, `:5368`, `:2172` (menus/popups → `near-lg`)
- Modify: `packages/ui/test/styling-board.test.ts:22–29` (20.041), `:105–114` (20.046); `packages/ui/test/styling-surfaces.test.ts:21` (dialog pin)
- Test: `packages/ui/test/neo-refresh.test.ts`

**Interfaces:**
- Consumes: `--gn-shadow-raised-lg`, `--gn-shadow-near-lg`, `--gn-shadow-sheet` (T1).
- Produces: `export const halo: Record<StyleName, { lg: string; card: string; compact: string }>` and `haloVariableName(step: 'lg' | 'card' | 'compact'): '--gn-halo-lg' | '--gn-halo' | '--gn-halo-compact'`, emitted per style like the radii. T8 measures the board gap in px.

- [ ] **Step 1: Write the failing tests**

```ts
import { halo, haloVariableName } from '../src/tokens.js';

describe('24.080 the halo tokens: offset + blur of each raised pair, per style (spec §3.4; N7)', () => {
  it('24.080 neo 23/14/6, hig 8/8/3, minimal 0, emitted under every style selector', () => {
    expect(halo.neo).toEqual({ lg: '23px', card: '14px', compact: '6px' });
    expect(halo.hig).toEqual({ lg: '8px', card: '8px', compact: '3px' });
    expect(halo.minimal).toEqual({ lg: '0px', card: '0px', compact: '0px' });
    expect(haloVariableName('card')).toBe('--gn-halo');
    expect(haloVariableName('lg')).toBe('--gn-halo-lg');
    const sheet = themeStylesheet();
    expect(sheet).toContain('[data-style="neo"] {');
    expect(sheet.match(/--gn-halo: 14px;/g)?.length).toBe(3);   // neo light, OS-dark arm, data-theme dark
    expect(sheet.match(/--gn-halo: 8px;/g)?.length).toBe(3);    // hig
  });
});

describe('24.081 the board clears the card halo: 14px in neo, 8px in hig, through one token (N7; rule 02 amended)', () => {
  it('24.081 column gap, cards gap and the column-header bottom padding read var(--gn-halo)', () => {
    expect(valueOf(ruleExactly(ui, '.gn-board__column'), 'gap')).toBe('var(--gn-halo)');
    expect(valueOf(ruleExactly(ui, '.gn-board__cards'), 'gap')).toBe('var(--gn-halo)');
    expect(valueOf(ruleExactly(ui, '.gn-board__column-header'), 'padding')).toBe('0.5rem 0.5rem var(--gn-halo)');
    // CONTROL: the column's own padding (the card-to-track inset, not text) stays 8px.
    expect(valueOf(ruleExactly(ui, '.gn-board__column'), 'padding')).toBe('0.5rem');
  });
});

describe('24.082 the listed crowding sites clear their neighbour\'s halo', () => {
  it('24.082 account sections 14px, the shell heading 24px under the nav; the workspace grid (18px) and settings gap (20px) already clear 14px', () => {
    expect(valueOf(ruleExactly(globals, '.gn-account__section'), 'gap')).toBe('max(0.75rem, var(--gn-halo))');
    expect(valueOf(ruleExactly(globals, '.gn-shell__main'), 'margin-top')).toBe('max(1.25rem, var(--gn-halo-lg))');
    expect(valueOf(ruleExactly(globals, '.gn-workspace-list'), 'gap')).toBe('1.125rem');
    expect(valueOf(ruleExactly(globals, '.gn-settings'), 'gap')).toBe('1.25rem');
  });
});

describe('24.083 large surfaces wear the large pair; floating panels the near-lg; the two generic drops are gone', () => {
  it('24.083 nav, sheet, dialog, popovers, menus, infotip read raised-lg/near-lg/sheet; no rule in either sheet uses var(--gn-shadow) as a drop', () => {
    expect(valueOf(ruleExactly(globals, '.gn-nav'), 'box-shadow')).toBe('var(--gn-shadow-raised-lg)');
    expect(valueOf(ruleExactly(ui, '.gn-sheet'), 'box-shadow')).toBe('var(--gn-shadow-sheet)');
    for (const sel of ['.gn-dialog', '.gn-select__panel', '.gn-popover', '.gn-infotip__panel', '.workflow-rebind-dialog']) {
      expect(valueOf(ruleExactly(ui, sel), 'box-shadow'), sel).toBe('var(--gn-shadow-near-lg)');
    }
    for (const sel of ['.gn-nav__menu', '.gn-card-menu__list', '.ticketref-popup']) {
      expect(valueOf(ruleExactly(globals, sel), 'box-shadow'), sel).toBe('var(--gn-shadow-near-lg)');
    }
    expect(valueOf(ruleExactly(ui, '.gn-filters__panel'), 'box-shadow')).toBe('var(--gn-shadow-sheet)');
    expect(ui).not.toMatch(/box-shadow:[^;]*var\(--gn-shadow\)/);
    expect(globals).not.toMatch(/box-shadow:[^;]*var\(--gn-shadow\)/);
    // CONTROL: cards keep the card pair.
    expect(valueOf(ruleExactly(ui, '.gn-card'), 'box-shadow')).toBe('var(--gn-shadow-lift)');
  });
});
```

- [ ] **Step 2: RED** — `pnpm exec vitest run test/neo-refresh.test.ts -t "24.08" > /tmp/neo-t6.log 2>&1; tail -30 /tmp/neo-t6.log`. Expected: FAIL (`halo` not exported; gaps are `0.5rem`).

- [ ] **Step 3: Implement**

`tokens.ts`, beside `radii`:
```ts
/** Halo clearance (neo refresh N7, 2026-10-02): offset + blur of each raised pair. Readable text outside a raised element sits at least this far from its edge; where a layout cannot open up, lift the text (`position: relative; z-index: 1`) — never clip the highlight. Lengths, like the radii: no colour discipline. */
export type HaloStep = 'lg' | 'card' | 'compact';
export const halo: Record<StyleName, Record<HaloStep, string>> = {
  hig: { lg: '8px', card: '8px', compact: '3px' },
  minimal: { lg: '0px', card: '0px', compact: '0px' },
  neo: { lg: '23px', card: '14px', compact: '6px' },
};
export function haloVariableName(step: HaloStep): string {
  return step === 'card' ? '--gn-halo' : `--gn-halo-${step}`;
}
```
and in `declarationsFor` add `const haloDecls = (['lg', 'card', 'compact'] as HaloStep[]).map((s) => `${haloVariableName(s)}: ${halo[style][s]};`);` to the joined list. Export `halo`, `haloVariableName` from `packages/ui/src/index.ts`.

`ui.css`: `.gn-board__column` `gap: 0.5rem` → `gap: var(--gn-halo);`; `.gn-board__cards` `gap: 0.5rem` → `var(--gn-halo)`; `.gn-board__column-header` `padding: 0.5rem` → `padding: 0.5rem 0.5rem var(--gn-halo);` with the comment "N7 (2026-10-02, 24.081): the title clears the first card's halo — 14px in neo, 8px in hig (rule 02's 8px becomes 14px for neo)". `.gn-dialog`, `.gn-select__panel`, `.gn-popover`, `.gn-infotip__panel`: `var(--gn-shadow-lift-near)` → `var(--gn-shadow-near-lg)`. `.workflow-rebind-dialog` `box-shadow: 0 8px 24px var(--gn-shadow)` → `var(--gn-shadow-near-lg)`; `.gn-filters__panel` `box-shadow: -0.75rem 0 2.5rem var(--gn-shadow)` → `var(--gn-shadow-sheet)`. `globals.css`: `.gn-nav` `var(--gn-shadow-lift)` → `var(--gn-shadow-raised-lg)`; `.gn-nav__menu`, `.gn-card-menu__list`, `.ticketref-popup` → `var(--gn-shadow-near-lg)`; `.gn-shell__main` `margin-top: 1.25rem` → `max(1.25rem, var(--gn-halo-lg))`; `.gn-account__section` `gap: 0.75rem` → `max(0.75rem, var(--gn-halo))`.

Amend `styling-board.test.ts:27–29` and `:107` (20.041, 20.046: `'0.5rem'` → `'var(--gn-halo)'` / `'0.5rem 0.5rem var(--gn-halo)'`, dated "N7, 24.081: rule 02's 8px is 14px in neo"), `styling-surfaces.test.ts:21` (dialog → `near-lg`), and the "8px between cards" sentence in the `.gn-board__column` docblock (`ui.css:1160–1167`).

- [ ] **Step 4: GREEN** — `pnpm build > /tmp/neo-build.log 2>&1; tail -3 /tmp/neo-build.log; pnpm exec vitest run test/neo-refresh.test.ts test/styling-board.test.ts test/styling-surfaces.test.ts test/styling-b3-floating.test.ts test/tokens.test.ts > /tmp/neo-t6.log 2>&1; tail -30 /tmp/neo-t6.log`; then `cd ../../apps/web && pnpm exec vitest run test/shared-components-ux.test.ts test/suggestion-popup-styling.test.ts > /tmp/neo-t6b.log 2>&1; tail -10 /tmp/neo-t6b.log`. Expected: PASS (amend any `lift-near` pin on a floating panel with the N7 note; `tokens.test.ts:156` "every var(--gn-…) in ui.css names a declared role" must accept `--gn-halo*` — extend its allow-list the way `--gn-radius-*` and `--gn-shadow-*` are accepted).

- [ ] **Step 5: Mutations** — set `halo.neo.card` to `'8px'` → 24.080 red; put `gap: 0.5rem` back on `.gn-board__cards` → 24.081 red and 20.041 red; restore the generic drop on `.workflow-rebind-dialog` → 24.083 red.

- [ ] **Step 6: Catalogue + commit** — 24.080–24.083 ✅ in §24.6; Features §21 "✅ **Halo clearance and sized pairs** (N7): `--gn-halo-lg/--gn-halo/--gn-halo-compact`, the 14px board in neo, rule 02 amended"; amend the rule-02 line in `docs/superpowers/plans/2026-09-29-styling-system-refresh.md:1897` with a pointer ("8px → `var(--gn-halo)`, N7 2026-10-02").
```bash
git add packages/ui/src/tokens.ts packages/ui/src/index.ts packages/ui/src/ui.css apps/web/app/globals.css packages/ui/test/neo-refresh.test.ts packages/ui/test/styling-board.test.ts packages/ui/test/styling-surfaces.test.ts packages/ui/test/tokens.test.ts docs/superpowers/plans/2026-09-29-styling-system-refresh.md test-cases/24-neo-refresh.md Features.md
git commit -m "Neo refresh T6: halo clearance tokens, the 14px board, sized pairs on large surfaces (24.080-24.083)"
```

---

### Task 7: The dark-theme sweep (N4 = B) and the docblocks

**Files:**
- Modify: `packages/ui/src/tokens.ts:212–231` (`neoNavyRaised` docblock: retired by N4 = B), `:1010–1041` (`STYLE_COLOR_OVERRIDES` docblock: the N2/N4 lines), `:1322–1342` (the `SHADOWS` docblock: the neo table is derived, not transcribed), `:365–373` (shadow-primitives docblock)
- Modify: `docs/neo-token-report.md` (regenerate the neo rows with `design-system/tools/neo_tokens_probe.py` if it still runs; otherwise append a dated section with the §5 table)
- Test: `packages/ui/test/neo-refresh.test.ts`; `packages/ui/test/tokens.test.ts:521–556` (13.341 and the neo-dark case)

**Interfaces:**
- Consumes: `colorOf`, `contrastRatio`, `over`, `shadowValueOf`.
- Produces: nothing new; this task is the proof that the dark theme holds as a set.

- [ ] **Step 1: Write the failing test**

```ts
describe('24.100 neo dark as a set (N4 = B): same-hex extrusion, one lamp, every text tier readable on every ground a field or card paints', () => {
  it('24.100 raised = surface = #1b2340; every dark role uses #0000008c as its only dark layer; the highlight ladder is 16/12/8 %; text floors hold on surface, sunken and well', () => {
    expect(colorOf('dark', 'surfaceRaised', 'neo')).toBe(colorOf('dark', 'surface', 'neo'));
    const sheet = themeStylesheet();
    const darkBlock = sheet.split('[data-style="neo"][data-theme="dark"] {')[1].split('}')[0];
    const darkLayers = [...darkBlock.matchAll(/#[0-9a-f]{8}/g)].map((m) => m[0]);
    const falls = darkLayers.filter((c) => c.startsWith('#000000'));
    expect(new Set(falls)).toEqual(new Set(['#0000008c', '#000000bf']));   // the fall and the band, nothing else
    expect(darkBlock).toContain('#f2e9e129'); expect(darkBlock).toContain('#f2e9e11f'); expect(darkBlock).toContain('#f2e9e114');
    expect(darkBlock).not.toContain('#060a169e'); expect(darkBlock).not.toContain('#ffffff0d');
    for (const bg of ['surface', 'surfaceRaised', 'surfaceSunken', 'surfaceWell'] as const) {
      for (const fg of ['text', 'textMuted', 'textSubtle', 'textAccent'] as const) {
        expect(contrastRatio(colorOf('dark', fg, 'neo'), colorOf('dark', bg, 'neo')), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // the raised highlight is what lifts a dark card now: visibly above the fall
    expect(contrastRatio(over('#f2e9e129', '#1b2340'), '#1b2340')).toBeGreaterThan(1.5);
    // CONTROL: hig dark still separates by fill (13.341's rule (c)).
    expect(colorOf('dark', 'surfaceRaised', 'hig')).not.toBe(colorOf('dark', 'surface', 'hig'));
  });
});
```

- [ ] **Step 2: RED** — expected to be GREEN already after T1 (it is a sweep, not a change); run it, record "24.100 green at T1; the docblocks are this task's deliverable". If any dark pair fails here, T1 mis-mapped and this is where it shows.

- [ ] **Step 3: Rewrite the docblocks** — `neoNavyRaised` (`:212–229`): "RETIRED by N4 = B (2026-10-02): the dark raised surface is the page hex; the 16% highlight carries the lift (finding 4). Kept as the record of U8's step." `STYLE_COLOR_OVERRIDES` docblock: replace the T1-era lines with "Neo refresh (2026-10-02): both arms' `surfaceSunken` is the well (N2); the dark arm's `surfaceRaised` is `neoNavy` again (N4 = B)". `SHADOWS` docblock: "neo's table is DERIVED by `neoShadows(lamp)` from one lamp per theme (spec §3.1/3.3), no longer transcribed from the export". Regenerate or append `docs/neo-token-report.md`.

- [ ] **Step 4: GREEN** — `pnpm exec vitest run test/neo-refresh.test.ts test/tokens.test.ts > /tmp/neo-t7.log 2>&1; tail -20 /tmp/neo-t7.log`. Expected: PASS; 13.341's neo-dark case was already amended in T1.

- [ ] **Step 5: Mutation** — map neo-dark `surfaceRaised` back to `neoNavyRaised` → 24.100 red; set `shadowNeoDarkDark` to `#060a169e` → 24.100 red.

- [ ] **Step 6: Catalogue + commit** — 24.100 ✅ in §24.7; Features §21 "⚙️ **Dark neo as one lamp** (N4 = B)".
```bash
git add packages/ui/src/tokens.ts docs/neo-token-report.md packages/ui/test/neo-refresh.test.ts test-cases/24-neo-refresh.md Features.md
git commit -m "Neo refresh T7: dark sweep, docblocks, token report (24.100)"
```

---

### Task 8: Browser verification, LOCAL, both neo themes plus hig/minimal regression

**Files:**
- Create: `apps/web/e2e-stack/neo-depth.spec.ts`
- Modify: `apps/web/e2e-stack/viewport.spec.ts:1093–1113` (already amended in T3; this task runs it)
- Output: `gisik-nokma-lanes/neo-refresh-verify/<date>/` screenshots (outside the repo)

**Interfaces:**
- Consumes: the dev stack at `http://localhost:3001` (sign-in may be needed; `/sign-in` and `/help` render signed out), `data-style`/`data-theme` on `<html>`, the computed styles T2–T6 produce.
- Produces: a LOCAL run log quoted in the PR.

- [ ] **Step 1: Write the spec** (`apps/web/e2e-stack/neo-depth.spec.ts`)

```ts
import { expect, test } from '@playwright/test';

const THEMES = ['light', 'dark'] as const;
const LINE = { light: 'rgb(137, 115, 98)', dark: 'rgb(125, 136, 168)' };

for (const theme of THEMES) {
  test(`24.110 neo-${theme}: the sign-in field's boundary is the recess line, not a border; the primary carries one fall and presses into its own blue`, async ({ page }) => {
    await page.goto('/sign-in', { waitUntil: 'networkidle' });
    await page.evaluate((t) => { document.documentElement.dataset.style = 'neo'; document.documentElement.dataset.theme = t; }, theme);
    const field = page.locator('.gn-field__input').first();
    const fieldStyle = await field.evaluate((el) => { const c = getComputedStyle(el); return { borderColor: c.borderColor, boxShadow: c.boxShadow }; });
    expect(fieldStyle.borderColor).toBe('rgba(0, 0, 0, 0)');
    expect(fieldStyle.boxShadow).toContain(LINE[theme]);
    const primary = page.locator('.gn-button--primary').first();
    const rest = await primary.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(rest.split('px,').length, 'one layer at rest').toBe(1);
    expect(rest).not.toContain('255, 250, 244'); // no highlight on a coloured fill
    await primary.hover();
    await page.mouse.down();
    const pressed = await primary.evaluate((el) => getComputedStyle(el).boxShadow);
    await page.mouse.up();
    expect(pressed).toContain('inset');
    expect(pressed).toContain(theme === 'light' ? 'rgb(38, 74, 119)' : 'rgb(95, 127, 171)');
    await page.screenshot({ path: `../../gisik-nokma-lanes/neo-refresh-verify/sign-in-neo-${theme}.png`, fullPage: true });
  });

  test(`24.111 neo-${theme}: the help segmented track and the current nav item are recesses; the ghost button is raised`, async ({ page }) => {
    await page.goto('/help', { waitUntil: 'networkidle' });
    await page.evaluate((t) => { document.documentElement.dataset.style = 'neo'; document.documentElement.dataset.theme = t; }, theme);
    const track = await page.locator('.gn-segmented').first().evaluate((el) => getComputedStyle(el).boxShadow);
    expect(track).toMatch(/inset 3px 3px 5px/);
    const current = await page.locator(".gn-nav a[aria-current='page']").first().evaluate((el) => getComputedStyle(el).boxShadow);
    expect(current).toMatch(/inset 3px 3px 5px/);
    const ghost = await page.locator('.gn-button--ghost').first().evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ghost).toMatch(/2px 2px 4px/);
    expect(ghost).not.toContain('inset');
    await page.screenshot({ path: `../../gisik-nokma-lanes/neo-refresh-verify/help-neo-${theme}.png`, fullPage: true });
  });

  test(`24.112 neo-${theme}: board cards sit 14px apart and 14px under the column title (N7)`, async ({ page }) => {
    await page.goto('/sign-in'); // sign in with the e2e-stack owner, then open the first project's board — reuse signIn() from viewport.spec.ts
    // (the helper lives in viewport.spec.ts; move `signIn` into ./helpers/session.ts in this task so both specs import it)
    const { signIn, OWNER_EMAIL } = await import('./helpers/session.js');
    await signIn(page, OWNER_EMAIL);
    await page.goto('/p/first', { waitUntil: 'networkidle' });
    await page.evaluate((t) => { document.documentElement.dataset.style = 'neo'; document.documentElement.dataset.theme = t; }, theme);
    const gap = await page.locator('.gn-board__cards').first().evaluate((el) => getComputedStyle(el).gap);
    expect(gap).toBe('14px');
    const pad = await page.locator('.gn-board__column-header').first().evaluate((el) => getComputedStyle(el).paddingBottom);
    expect(pad).toBe('14px');
  });
}

test('24.113 the primary focus ring sits 3px outside the accent edge', async ({ page }) => {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.evaluate(() => { document.documentElement.dataset.style = 'neo'; });
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const focused = page.locator('.gn-button--primary:focus-visible');
  await expect(focused).toHaveCount(1);
  expect(await focused.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe('3px');
});

for (const style of ['hig', 'minimal'] as const) {
  test(`24.114 ${style} regression: the sign-in card, field, primary and ghost render the pre-refresh shadows`, async ({ page }) => {
    await page.goto('/sign-in', { waitUntil: 'networkidle' });
    await page.evaluate((s) => { document.documentElement.dataset.style = s; document.documentElement.dataset.theme = 'light'; }, style);
    const read = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).boxShadow);
    const fieldBorder = await page.locator('.gn-field__input').first().evaluate((el) => getComputedStyle(el).borderStyle);
    expect(fieldBorder).toBe('solid'); // the rim stays outside neo
    if (style === 'hig') {
      expect(await read('.gn-card')).toContain('rgba(39, 58, 99, 0.12) 0px 1px 2px'); // hig lift, unchanged (shadowFallLight1)
      expect(await read('.gn-button--ghost')).toBe('none');
    } else {
      expect(await read('.gn-card')).toBe('none');
      expect(await read('.gn-button--ghost')).toBe('none');
    }
    await page.screenshot({ path: `../../gisik-nokma-lanes/neo-refresh-verify/sign-in-${style}.png`, fullPage: true });
  });
}
```

- [ ] **Step 2: Run it LOCAL** — `cd apps/web && pnpm exec playwright test e2e-stack/neo-depth.spec.ts e2e-stack/viewport.spec.ts > /tmp/neo-t8.log 2>&1; tail -40 /tmp/neo-t8.log`. Expected: PASS on the dev stack built from the release branch (`ctl rebuild` first). Quote the run in the PR as LOCAL.

- [ ] **Step 3: Critique the screenshots** against the bench (`gisik-nokma-lanes/neo-mockup-2026-10-02/index.html` AFTER panes) at 100% and 200%: card lift without a halo over text; field reads pressed with a flat floor and a crisp line; primary one fall, blue-on-blue press; ghost raised with its border; hig and minimal frames identical to their pre-refresh captures (`audit-ux-recheck-2026-10-02/`). Anything that differs from the bench is a defect in T1–T6, not a bench error: fix there and re-run.

- [ ] **Step 4: Catalogue + commit** — 24.110–24.114 ✅ (🧪 where the assertion is a screenshot judgement) in §24.8; Features §21 "🧪 **Browser verification of the neo refresh** (LOCAL)".
```bash
git add apps/web/e2e-stack/neo-depth.spec.ts apps/web/e2e-stack/helpers/session.ts apps/web/e2e-stack/viewport.spec.ts test-cases/24-neo-refresh.md Features.md
git commit -m "Neo refresh T8: browser verification in both neo themes and hig/minimal regression (24.110-24.114)"
```

---

### Task 9: Catalogue, Features, docs

**Files:**
- Create: `test-cases/24-neo-refresh.md` (first commit of the release branch, all cases ❌; later tasks flip them)
- Modify: `test-cases/README.md` (register §24 after the §23 paragraph), `scripts/fixtures/check-case-citations-baseline.json` (`"24-neo-refresh.md": 0`), `Features.md` (new `## 21. Neo refresh (N1–N10, 2026-10-02)` after §20, line 3649)
- Create: `docs/superpowers/specs/2026-10-02-neo-refresh-design.md` and `docs/superpowers/plans/2026-10-02-neo-refresh.md` (copied from `gisik-nokma-lanes/neo-refresh-docs/`)
- Modify: `docs/superpowers/plans/2026-09-29-styling-system-refresh.md:1897` (rule 02 pointer, done in T6)

- [ ] **Step 1: Open the bucket** (`test-cases/24-neo-refresh.md` header)

```markdown
# §24 — The neo refresh (rulings N1–N10)

**Opened 2026-10-02 by the neo refresh plan** (`docs/superpowers/plans/2026-10-02-neo-refresh.md`; spec `docs/superpowers/specs/2026-10-02-neo-refresh-design.md`; the bench the owner ruled from: `gisik-nokma-lanes/neo-mockup-2026-10-02/index.html`). Mirrors `Features.md` §21. Ships as the release after prefix/groups/UX fixes.

3-DIGIT PADDED `24.001`–`24.999`, blocks per task: T1 24.001–019 · T2 24.020–039 · T3 24.040–059 · T4 24.060–069 · T5 24.070–079 · T6 24.080–099 · T7 24.100–109 · T8 24.110–129 · T9 24.130–139.

## 24.1 The token layer (T1)
- ❌ **24.001 — the neo shadow primitives are derived from the surface …** (one line per case, the `it` title verbatim; every case names its ruling: "(N5)")
…
```
Write every case line from the `describe` titles in T1–T8 (24.001–24.008, 24.020–24.026, 24.040–24.044, 24.060/061/065, 24.070–071, 24.080–083, 24.100, 24.110–114) starting ❌, each with its control named in a trailing sentence.

- [ ] **Step 2: Features §21** — one bullet per task (the texts given in each task's last step), legend ✅/⚙️/🧪, each with its file path; a lead paragraph naming the ten rulings and the bench.

- [ ] **Step 3: Checks** — `pnpm check:citations > /tmp/neo-t9.log 2>&1; tail -5 /tmp/neo-t9.log` (the baseline key must exist; the count is 0 until a task flips a case and cites it) and `pnpm check:tasks` if the repo's task check reads plans.

- [ ] **Step 4: Commit** (this commit lands FIRST on the release branch, before T1)
```bash
git add test-cases/24-neo-refresh.md test-cases/README.md scripts/fixtures/check-case-citations-baseline.json Features.md docs/superpowers/specs/2026-10-02-neo-refresh-design.md docs/superpowers/plans/2026-10-02-neo-refresh.md
git commit -m "Neo refresh: spec, plan, bucket 24 and Features §21 opened"
```

---

## Appendix A — the per-site consumer map (what reads which role after this plan)

| Consumer | Before | After | Task |
|---|---|---|---|
| `.gn-card`, `.gn-account__section`, `.gn-members`, `.gn-groups__box`, `.gn-settings__sidebar`, `.gn-list__table-wrap`, builder panels, `.gn-calendar__legend`, `.gn-notfound__tile`, `.gn-mcp-tokens__row`, `.gn-invite-pending`, `.gn-group-picker__list`, `.gn-theme-toggle`, `.gn-workspace-home__link`, `.template-gallery__door`, `.gn-board-card` | `lift` (7/16 in neo) | `lift` (= `raised` 4/10 in neo) | T1 (token) |
| `.gn-nav`, `.gn-sheet`, `.gn-toast` | `lift` / `sheet` / `overlay` | `raised-lg` / `sheet` (= raised-lg) / `overlay` (= raised-lg) | T6 (nav), T1 |
| `.gn-dialog`, `.gn-select__panel`, `.gn-popover`, `.gn-infotip__panel`, `.gn-nav__menu`, `.gn-card-menu__list`, `.ticketref-popup`, `.wikilink-preview`, `.table-toolbar`, `.gn-toc-launcher__*`, `.gn-skip` | `lift-near` (10/24) | `near-lg` (10/24) | T6 |
| hover on cards/doors/board cards | `lift-near` | `lift-near` (= `near` 6/14) | T1 |
| press on cards/doors/board cards | `lift-press` (outset 4/10) | `lift-press` (= `recess`, inset) | T1, T2 |
| `.gn-button--primary` | `action*` | `action-filled*` | T2 |
| `.gn-button--danger` | `lift*` | `danger*` | T2 |
| `.gn-button--ghost`, `.gn-sheet__close`, `.gn-row-action` | none | `quiet*` | T4 |
| neo fields (4 arms) | `sunken` + rim | `field`, transparent border | T3 |
| `.gn-segmented` (neo arm), nav current (neo), `--on` | `track` / `sunken` / `selected` | `recess` / `recess` / `selected` (= recess) | T3 |
| wells: `.gn-board__column`, trays, `.gn-help__results`, timeline/calendar grids, `.gn-saved-filters__name`, `.gn-contest-banner`, `.gn-notfound__why` | `track` / `sunken` (4/9) | `track` / `sunken` (3/6) | T1 |
| chips, badges, `.workflow-list__state`, `.gn-board__column-empty-icon` | `sunken-compact` (2/4) | `sunken-compact` (1/3) | T1 |
| task checkbox, `.gn-list__column-box` (neo) | `sunken` / flat | `sunken-compact` | T3, T5 |
| `.gn-switch` (neo) | flat | `recess` track, `raised-compact` knob, `knob-on` | T2, T5 |
| `.workflow-rebind-dialog`, `.gn-filters__panel` | generic `var(--gn-shadow)` drops | `near-lg` / `sheet` | T6 |

## Self-review (run 2026-10-02 against the spec)
1. **Spec coverage:** §3.1 primitives → T1; §3.2 surfaces → T1 (+ T7 docblocks); §3.3 roles → T1, consumers → T2–T6 (Appendix A); §3.4 halo → T6; §3.5 focus/transitions → T2 (buttons), T3 (segmented, nav), T4 (icon buttons), T5 (switch); §4 rules → T2 (filled), T1/T2 (press), T3 (N2 fill, N10 field); §5 floors → 24.005, 24.007, 24.044, 24.100; §6 unchanged → 24.002 and the controls in every case; §7 scoping → 24.002, 24.060, 13.340; §8 risks → risk 2 handled in T1 step 8, risk 5 in T3, risk 6 in T3, risk 4 measured in T8 (24.112; the phone clamp 23.120 is re-run by the gate), risk 1 and 3 are stated for the reviewer. No gap found.
2. **Placeholder scan:** none ("sign in … reuse signIn()" in T8 names the helper to extract, with its new path).
3. **Type consistency:** `ShadowRole` names used in CSS variables match T1's union (`--gn-shadow-action-filled-press`, `--gn-shadow-quiet-near`, `--gn-shadow-knob-on`, `--gn-shadow-near-lg`, `--gn-shadow-recess`, `--gn-shadow-field`); `halo`/`haloVariableName` defined in T6 and used only there and in T8's px reading; `neoShadows(lamp)` is internal to `tokens.ts`.
4. **Review Focus:** 1 → 24.002 (T1); 2 → 24.044 (T3); 3 → 24.023 (T2) + 24.113 (T8); 4 → 24.026 (T2); 5 → 24.065 (T4).
