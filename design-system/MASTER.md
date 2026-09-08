# Gisik Nokma — Apple HIG design system

**Status: proposal.** Nothing in `packages/ui/src/tokens.ts` or `ui.css` has been changed.
This project is the design-side statement of what an Apple HIG adoption would be.

Built 2026-09-08 from `origin/main` @ `5df5d28`, in worktree `.claude/worktrees/design-hig`.

---

## 1. Where the truth lives

| Thing | Owner |
|---|---|
| Colour, spacing, type in the shipping product | `packages/ui/src/tokens.ts` + `ui.css` — the code, always |
| What HIG adoption would make those | `tokens.json` here |
| Screens | `prototypes/*.dc.html` here |
| The argument, with measurements | `docs/hig-adoption-brief.md` in the repo |
| The measurements themselves | `docs/hig-probe-verbatim.py`, `docs/hig-probe-accessible.py` |

**No number in this project is hand-authored.** Every contrast ratio came out of a probe
script that ships beside it. If a value here disagrees with a probe, the probe is right.

## 2. The two rulings this design rests on

Both were owner decisions, because both were genuine conflicts between two authorities.

### R1 — borders are dropped; separation is carried by fill

No HIG separator value clears WCAG 1.4.11's 3:1 against any light background:

| Candidate | vs surface | vs raised | vs sunken |
|---|---|---|---|
| `opaqueSeparator` `#C6C6C8` | 1.53 | 1.71 | 1.36 |
| `systemGray3` `#C7C7CC` | 1.51 | 1.68 | 1.34 |
| `systemGray2` `#AEAEB2` | 1.98 | 2.21 | 1.76 |
| `systemGray` `#8E8E93` | 2.92 | 3.26 | 2.60 |

This codebase already carried **17 of 24 bordered classes under 3:1**. Adopting HIG
separators verbatim would have ratified that defect and given it an authority to cite —
with the build still green, because `CONTRAST_PAIRS` declares no `border` pair at all.

So the boundary is a fill: `surfaceSunken` → `surfaceRaised` → tertiary fill. This is
HIG's own preference, and the direction the codebase had already drifted (column → card →
chip already separated by fill, because their borders measured 1.34–1.61).

**Consequence for the code:** a `border`-on-`surface` pair and a `focusRing`-on-`surface`
pair must be **added** to `CONTRAST_PAIRS`. The current absence is how this went unnoticed.

### R2 — iOS metrics; the caption step is clamped

No HIG ramp satisfies both of the product's committed floors:

- **macOS HIG** (Body 13pt) reddens the 16px body floor in `responsive.spec.ts:265-270`.
- **iOS HIG** (Caption 2 at 11pt) breaks the 12px label ratchet in `type-scale-baseline.json`.

iOS wins, and Caption is clamped to 12px rather than 11. Both existing checks stay green;
the departure from HIG is one step at the smallest size, stated rather than hidden.

## 3. Where HIG cost nothing

- **Tap targets.** The repo's stated floor is already 44px (`responsive.spec.ts:28`) —
  exactly HIG's 44pt. Dense in-list rows keep 24px (WCAG 2.5.8), which is the product's
  own existing split, not a new one.
- **Radii.** Twelve ad-hoc values (`6px` ×20, `8px` ×8, `4px` ×8, `999px` ×5, `0.4rem` ×5,
  `50%` ×2, `10px` ×2, `0.25rem` ×1, plus four per-corner forms) collapse to four.
- **Font stack.** `globals.css:10` was already `system-ui, -apple-system, …`.

## 4. The palette finding

Apple's **stock** system colors fail **15 of the 27** pairs `tokens.ts` declares. White on
stock `systemBlue` is 4.02:1 — **Apple does not target WCAG AA for filled controls**, and
this product declares that it does. That is a real disagreement between two authorities,
not an error in either.

Apple's **increased-contrast** variants fail **none**. `success` uses the incumbent
`green700 #1E7A34` rather than Apple's `#248A3D`, which lands at 4.40 against a 4.5 minimum.

The colour half of this migration fails **loudly** — `tokens.test.ts` checks every declared
pair in both themes. The border half (§2, R1) fails **silently**, which is why it needed a
ruling and a new declared pair rather than a judgement call.

**One value here is not Apple's:** `textMuted`'s 0.80 opacity is a reconstruction of Apple's
increased-contrast `secondaryLabel`, not a citation. Every hex is a real Apple value.

## 5. The screens

Twenty-three artboards on three pages.

**Foundations** — `Main.dc.html`: palette, the R1 fill ladder, the iOS ramp, controls, radii.

**Web app** (1440×900) — `SignIn`, `Workspaces`, `Board`, `MyWork`, `Inbox`, `TicketSheet`,
`Calendar`, `Timeline`, `Members`, `TicketTypes`, `TicketTypeEditor`, `Workflows`,
`WorkflowBuilder`, `McpTokens`, `McpAuthorize`, `Invite`, `Help`, `NotFound`, `Legal`.

**Mobile** (390×844) — `MobileBoard`, `MobileTicket`, `MobileHelp`.

These are **static mockups**, not clickable prototypes. Component anatomy was lifted from
`packages/ui/src/ui.css` and `apps/web/app/globals.css` rather than invented: the 44px
control floor, the 24px in-list floor, the chip/dot vocabulary, the board column and card
structure, the sheet geometry, and the dashed-outline treatment for an in-transit claim
(never a different hue — recolouring it would say it means something else).

## 6. The render check, and what it caught

`seed-canvas.mjs --check` proves the canvas *parses*. It looks at no pixels, and a
fixed-size artboard whose content overruns its frame **clips silently** — no error,
no warning, just a screen that ends mid-element.

`prototypes/overflow-check.html` is the check that can see it. Serve this directory
(`python3 -m http.server 8777`) and open it: it loads every artboard at its
`canvas.json` frame size and reports both frame overflow and *inner* cuts.

It found two real defects that every other check passed:

1. **`Main.dc.html` overran its frame by 411px.** The foundations sheet was taller
   than the 1560px frame it was given. Frame and sheet are now 2080.
2. **`MobileTicket`'s field list was being compressed, not scrolled.** The grouped
   `<dl>` sits in a column flex scroller; without `flex: none` it *shrank*, and its
   own `overflow: hidden` cut 210px of rows in half. `MobileHelp` had the same
   latent bug. Both now carry `flex: none`, so the parent scrolls instead.

Five artboards still report inner overflow. Those are `overflow-y: auto` scroll
regions where content legitimately continues below the fold — the same thing the
real app does — and they are not defects.

## 7. What is deliberately not here

- **No dark-theme artboards.** `tokens.json` carries the full dark palette and every dark
  ratio is measured, but drawing 23 more artboards would double the surface without
  answering a question the light set leaves open.
- **No materials.** HIG's blur materials have no role in the roster, and `tokens.ts:167` is
  explicit that a role without a declared contrast pair is "a colour with no guarantee".
  Adding them means adding roles *with* pairs — a separate decision.
- **No code changes.** This is a proposal. Applying it means editing `tokens.ts`, re-running
  both probes, and letting `tokens.test.ts` confirm.
