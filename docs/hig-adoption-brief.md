# Apple HIG adoption — setup brief

**Status: proposal. Nothing in `packages/ui/src/tokens.ts` has been edited.**

Prepared 2026-09-08 in worktree `.claude/worktrees/design-hig` (branch
`worktree-design-hig`, based on `origin/main` @ `5df5d28`).

Every contrast number below is produced by `docs/hig-probe-verbatim.py` and
`docs/hig-probe-accessible.py`, which ship next to this file so the numbers can
be re-run rather than believed. Run them with `python3` — no dependencies.

---

## 1. What is being proposed

Re-skin every Gisik Nokma client onto Apple's Human Interface Guidelines: HIG
system colors, the HIG type ramp, HIG control metrics and corner radii, and HIG
materials in place of the current flat scrims.

## 2. What the product already has

The colour system is not a stylesheet convention — it is an enforced invariant.

| Fact | Where |
|---|---|
| 41 primitives, 28 semantic roles, two themes | `packages/ui/src/tokens.ts:12-160` |
| No colour literal is legal outside `tokens.ts` | `packages/ui/test/token-discipline.test.ts:313-320` |
| 27 self-declared contrast pairs, checked in **both** themes | `packages/ui/src/tokens.ts:167-244` |
| 326 class selectors, 7 React components | `packages/ui/src/ui.css`, `packages/ui/src/components/` |
| Font stack already Apple-first on Mac | `apps/web/app/globals.css:10` |

Three roles alias `blue600` (`focusRing`, `accent`, `categoryActive`) and two
alias `violet600` (`restricted`, `customMarker`). A primitive edit has a wider
blast radius than the role name suggests.

## 3. The headline finding

**Apple's stock system colors fail 15 of this product's 27 declared contrast
pairs. Apple's increased-contrast system colors fail 1.**

Measured, light / dark, minimum from `CONTRAST_PAIRS`:

| Pair | min | stock light | stock dark | accessible light | accessible dark |
|---|---|---|---|---|---|
| `accentText` on `accent` | 4.5 | **4.02** | **3.65** | 7.56 | 7.42 |
| `dangerText` on `danger` | 4.5 | **3.55** | **3.41** | 5.38 | 7.45 |
| `warningText` on `warning` | 4.5 | **2.20** | 10.22 | 5.20 | 11.77 |
| `successText` on `success` | 4.5 | **2.22** | 10.39 | **4.40** | 11.41 |
| `accent` on `surface` | 4.5 | **3.60** | 5.76 | 6.78 | 7.42 |
| `textMuted` on `surface` | 4.5 | **3.30** | 6.36 | 5.56 | 11.13 |
| `pending` on `surface` | 3 | **1.97** | 10.22 | 4.66 | 11.77 |
| `categoryTerminal` on `surface` | 3 | **1.99** | 10.39 | 3.94 | 11.41 |

Full tables in the two probe scripts.

Two things follow.

**Apple does not target WCAG AA for filled controls.** White on stock
`systemBlue` is 4.02:1 — Apple's own primary button does not clear 4.5. This
product declares that it does (`tokens.ts:170`). That is a real disagreement
between the two authorities, not a mistake in either.

**The colour half of this migration fails loudly, which is the good case.**
`tokens.test.ts` checks every declared pair in both themes, so a HIG palette
that breaks them turns the build red naming the pair. Contrast this with §4.

## 4. The part that fails *silently* — and needs a ruling

`CONTRAST_PAIRS` declares **no `border`-on-`surface` pair at all**. Borders are
outside the gate. So the following would ship green:

HIG's separator vocabulary cannot clear WCAG 1.4.11's 3:1 at any of its own
values. Measured against the three proposed light backgrounds:

| Candidate | vs `surface` | vs `surfaceRaised` | vs `surfaceSunken` | |
|---|---|---|---|---|
| HIG `opaqueSeparator` `#C6C6C8` | 1.53 | 1.71 | 1.36 | below 3:1 |
| `systemGray3` `#C7C7CC` | 1.51 | 1.68 | 1.34 | below 3:1 |
| `systemGray2` `#AEAEB2` | 1.98 | 2.21 | 1.76 | below 3:1 |
| `systemGray` `#8E8E93` | 2.92 | 3.26 | 2.60 | below 3:1 |
| accessible gray `#6C6C70` | 4.69 | 5.23 | 4.16 | clears — but it is a *text* grey, not a hairline |

This repo already carries **17 of 24 bordered classes below 3:1**, with nested
containers (column → card → chip) separating by fill because those borders
measure 1.34–1.61. Adopting HIG separators verbatim does not fix that defect —
**it ratifies it, and hands it an authority to cite.** And no gate would object.

**→ RULING R1: when HIG and WCAG 1.4.11 disagree about separators, which wins?**

- **(a) HIG verbatim** — 1.5–1.7:1 hairlines, defect entrenched, gate silent.
- **(b) HIG palette, separators promoted** to `#6C6C70` — clears 3:1 but reads
  as a heavy rule, visibly un-Apple.
- **(c) Drop borders; separate by fill and spacing** — this is HIG's *own*
  preference, it is the direction this codebase already drifted, and it removes
  the failing pixels rather than recolouring them. **My recommendation**, but
  it is a visual-identity decision and therefore yours.

Whichever wins, a `border`-on-`surface` pair should be **added** to
`CONTRAST_PAIRS`, because the current gap is how this got to 17/24 unnoticed.

**`focusRing` sits in the same gap.** It has no `CONTRAST_PAIRS` entry either,
and WCAG 1.4.11 holds focus indicators to 3:1 exactly as it does borders. §8
maps it to `accent` (`#0040DD` / `#409CFF`), which measures well clear — but
that is untested by anything, so it should get a declared pair in the same
change as `border` rather than being assumed safe because it happens to share
`accent`'s value today.

## 5. The type ramp cannot take both HIG platforms

Enforced today: **no body text under 16px**
(`apps/web/e2e-viewport/responsive.spec.ts:265-270, 328`) and a label ratchet
pinned at **0 elements under 12px** (`e2e-viewport/type-scale-baseline.json`).

Today's ui.css is a macOS-shaped ramp — the three commonest sizes are `0.85rem`
(×27), `0.8rem` (×22), `0.75rem` (×20): 13.6px, 12.8px, 12px.

- **macOS HIG** — Body 13pt, Footnote 10pt. Reddens the 16px body floor across
  the app and drives the label ratchet off 0.
- **iOS HIG** — Body 17pt, Footnote 13pt, Caption 2 11pt. Body clears the floor
  comfortably; Caption 2 breaks the 12px label ratchet.

No HIG ramp satisfies both existing checks unchanged. A moved baseline must be
an explicit decision, not a regenerated file.

**→ RULING R2: iOS metrics (larger type, relayout everything) or macOS metrics
(lower the committed 16px body floor)?** The web app is desktop-first, which
argues macOS; the accessibility floor already committed to argues iOS.

## 6. Where HIG costs nothing

- **Tap targets.** The repo's stated floor is "no tap target under 44px"
  (`responsive.spec.ts:28`) — exactly HIG's 44pt. Baselines hold known
  violations at 16 (desktop/tablet `/help`), 10 (phone `/help`), 6
  (`/sign-in`); they ratchet a violation *count*, so HIG metrics can only push
  them down. Free win.
- **Radii.** Twelve distinct values today (`6px` ×20, `8px` ×8, `4px` ×8,
  `999px` ×5, `0.4rem` ×5, `50%` ×2, `10px` ×2, `0.25rem` ×1, plus four
  per-corner forms), enforced by nothing. HIG's continuous-corner scale
  collapses this to about four steps.
- **Font stack.** `globals.css:10` is already `system-ui, -apple-system, …`.

## 7. Materials need new roles, not new colours

HIG's blur materials (ultraThin → chrome) have no role here; the roster carries
only `surfaceOverlay` and `shadow`. Adopting them means **adding** roles — and
`tokens.ts:167` is explicit that a role without a `CONTRAST_PAIRS` entry is "a
colour with no guarantee". New roles arrive with declared pairs or they do not
arrive.

## 8. Recommended mapping (Apple increased-contrast)

One pair still fails: `successText` on `success` at **4.40 vs 4.5**, missing by
0.10. Note the incumbent `green700` `#1E7A34` already clears 4.5 and is within a
hair of Apple's `#248A3D` — the cheapest resolution is to keep it.

| Role | Light | Dark |
|---|---|---|
| `surface` | `#F2F2F7` | `#000000` |
| `surfaceRaised` | `#FFFFFF` | `#1C1C1E` |
| `surfaceSunken` | `#E5E5EA` | `#2C2C2E` |
| `text` | `#000000` | `#FFFFFF` |
| `textMuted` | `#3C3C43` @ 80% ⚠ | `#EBEBF5` @ 80% ⚠ |
| `border` / `borderStrong` | **blocked on R1** | **blocked on R1** |
| `accent` / `categoryActive` / `focusRing` | `#0040DD` | `#409CFF` |
| `danger` / `blocked` | `#D70015` | `#FF6961` |
| `warning` / `pending` | `#B25000` | `#FFB340` |
| `success` / `categoryTerminal` | `#248A3D` (or keep `#1E7A34`) | `#30DB5B` |
| `categoryOpen` | `#6C6C70` | `#98989D` |
| `restricted` / `customMarker` | `#8944AB` | `#DA8FFF` |
| `contested` | `#D30F45` | `#FF6482` |

**⚠ The one row that is not Apple's number.** Every hex in this table is a real
Apple increased-contrast system color. `textMuted` is not: Apple's
`secondaryLabel` is an alpha over the background, and the probes model the
increased-contrast case at **80% — a reconstruction, not a citation.** Its four
measured rows (§3 `textMuted on surface`, and the two `surfaceRaised` /
`surfaceSunken` rows) inherit that assumption. Look up Apple's documented
increased-contrast `secondaryLabel` opacity and re-run before relying on them;
the margins are wide (5.14–11.13 against 4.5) so the conclusion is unlikely to
move, but the number is mine and should not be quoted as Apple's.

**Arity note.** HIG is richer than this roster on the background/label/fill axes
and poorer on the meaning axis — it has no `contested`, `restricted` or
`blocked`. Those keep their meanings and borrow HIG hues; they are not HIG
concepts and should not be documented as if they were.

## 9. What happens next

1. ~~You run `/design-sync`~~ — **done, and it was never the gate.** The
   `design-sync` *skill* is `disable-model-invocation`, but the `DesignSync`
   *tool* is separate and was already authorized on this machine (the gate, when
   there is one, is `/design-login`). The screens are built and pushed:
   - Canvas — <https://claude.ai/code/artifact/0bd70467-9c16-4a0e-b335-5f16df5b1e03>
   - Design project — `Gisik Nokma — Apple HIG UI`, `74709f67-353f-447e-96f9-05c6cb98682c`
   - Bundle — `design-system/` in this worktree
2. **R1 and R2 were ruled on 2026-09-08:** borders dropped in favour of fill;
   iOS metrics with the caption step clamped to 12px. The artboards are built on
   those rulings.
3. ~~**Still to do:** apply §8 to `tokens.ts`, add the `border`-on-`surface` and
   `focusRing`-on-`surface` pairs to `CONTRAST_PAIRS`, re-run both probes, and
   let `tokens.test.ts` confirm.~~ **SPLIT IN TWO on 2026-09-08, and the split is
   not cosmetic — see below.**

Step 3 is the only one that touches shipping code, and it is where the 326
selectors and two ratcheted baselines get moved.

### Step 3a — the palette (DONE, 2026-09-08)

§8 applied to `packages/ui/src/tokens.ts`; both probes re-run; `tokens.test.ts`
confirms every declared pair in both themes. Four values deliberately are not
Apple's and the file says why at each: `green700` kept by owner ruling (Apple's
`#248A3D` is the one pair that fails, `successText` at **4.40** vs 4.5, against
the incumbent's **5.40**); the border primitives untouched (step 3b); the dark
status inks untouched (§8 is silent on them and all clear); and `textMuted`
solid rather than the alpha this brief flags as *"a reconstruction, not a
citation"*. `categoryOpen` also stopped sharing a primitive with `textMuted` —
Apple's accessible grey is right for a chip dot at 3:1 and **fails the text job
at 4.16 on `surfaceSunken`**, so one grey could not hold both. Cases
**13.281–13.282** pin the two departures against the tidy-up that would undo
each.

### Step 3b — the border story, ATOMIC (not yet done)

**The `border` remap and the two new `CONTRAST_PAIRS` rows must land in the SAME
change as the removal of the border declarations**, and must NOT land with the
palette. Ruling R1(c) drops borders in favour of fill, so the `border` role has
to be remapped to a grey that clears 3:1 — it must be honest if used — while the
declarations that would paint it are removed. Doing only the first would give
every card, chip, table cell and column a heavy dark rule and **no gate would
object, because a *darker* border fails nothing.** That state would sit on
`main` between two PRs while the product is being tested by hand.

The measurement that sweep starts from, taken at the palette change: `border` on
`surface` is **1.34** light and **1.49** dark, against the 3:1 WCAG 1.4.11 holds
a non-text UI component to. Adding the pair without the remap is a red gate;
adding the remap without the sweep is a visibly broken product; doing both at
once closes the gap that hid 17 of 24 bordered classes.
