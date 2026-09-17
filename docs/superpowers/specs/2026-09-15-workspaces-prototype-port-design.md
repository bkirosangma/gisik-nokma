# `/workspaces` — porting the desktop prototype's visual design

**Date:** 2026-09-15
**Branch:** `owner/workspace-edits`
**Reference:** `design-system/interactive/desktop.dc.html:176-230` (the `isWorkspaces` block)

## What this is

Make `apps/web/app/workspaces/page.tsx` visually match the desktop prototype:
card sizes, styling, and section ordering are the hard requirement. Function may
differ where the prototype and the built product genuinely disagree, but only
where keeping both is impossible.

The owner attached a bundled `.dc.html` export of the prototype. It was checked
against the in-repo copy and the `isWorkspaces` block is **byte-identical** —
the only difference is the bundler's `onClick` → `sc-camel-on-click` attribute
transform. So the reference is already in the tree and every measurement below
cites it by line, the same way the `/account` port cited `desktop.dc.html:1471-1529`.

## Rulings received (2026-09-15)

Two decisions were put to the owner before this spec was written.

**1(a) — chip labels: "keep what is built today."**
The prototype's chip set is `{n} tickets` · `{n} blocked` · `Restricted`. The
built set is `{n} members` · `{n} active` · `{n} blocked` · `{n} archived` ·
`Restricted`. The built set stays, unchanged, including the `active` label whose
docblock warns that it means NOT BLOCKED and is not `StateCategory.active`.

**Consequence for the meta line.** The prototype's head is two lines: name, then
a meta line reading `"5 members · 2 projects"`. Keeping the members chip *and*
adding that meta line would print "5 members" twice on one card. So the meta
line carries **the project count only** — `"2 projects"` — which preserves the
prototype's two-line head geometry, duplicates nothing, and satisfies ruling
1(b)'s requirement to say how many projects are inside.

**1(b) — the project list: "adopt the prototype, but truncate if there are lots
of projects. Also mention somewhere how many projects are there inside."**
The built `<ul>` of per-project rows (each with its own ticket count and
`project-card-<id>` testid) collapses to the prototype's single joined line plus
a chevron. Truncation and the count are specified in T5 below.

## What already matches — do not churn it

- **Page section order** is already prototype order: title → card grid →
  invitations → founding form. The ordering requirement is satisfied at page
  level. Nothing moves.
- **Founding form**: `max-width: 26.25rem` is the prototype's 420px, and
  `gap: 0.75rem` is its 12px. `test/founding.test.tsx:85` (case 13.394) asserts
  this form is a bare column and **not** a raised card — which is exactly what
  the prototype shows. A constraint already satisfied; named here so nobody
  "improves" it into a card.
- **Tap targets**: `.gn-button` and `.gn-field__input` are already
  `min-height: 2.75rem`, matching the prototype's 44px.
- **Both `<InvitationBanner />` and `<FoundingForm />` sit outside the list's
  branches.** `getMyWorkspaces` refusing is this page's normal resting state and
  both must survive it. This is load-bearing and does not change.

## Blast radius

`apps/desktop/src/main.tsx:6` imports `@gisik-nokma/ui/ui.css`, so every edit to
`.gn-card` / `.gn-chip` / `.gn-avatar` / `.gn-field__input` / `.gn-button` ships
to the desktop app too. Neither desktop nor mobile renders a workspace card, so
the `.gn-workspace-*` rules are web-only and may be changed freely.

Shared-surface edits are therefore justified individually in T2 — each is a fix
that improves the shared component rather than a page-local hack pushed upward.

## Card anatomy — prototype vs built vs target

| Row | Prototype | Built today | Target |
|---|---|---|---|
| 1 | avatar + name + meta `"5 members · 2 projects"` | avatar + name + role sentence | avatar + name + meta `"2 projects"` |
| 2 | chips `9 tickets` · `3 blocked` · `Restricted` | chips `members`/`active`/`blocked`/`archived`/`Restricted` | built chips, unchanged (ruling 1a) |
| 3 | role sentence | `<ul>` of per-project rows | role sentence |
| 4 | projectLine + chevron | `.gn-workspace-card__restricted` | projectLine (truncated) + chevron |
| 5 | — | — | `.gn-workspace-card__restricted`, unchanged |

Rows 1 and 3 swap: the role sentence moves from under the name to below the
chips, and the meta line takes its place. The sentence's text is untouched, so
case 13.357 (which asserts the sentence, not its position) survives.

## Metrics

Converted at the 16px root the product uses. Prototype value → target.

**Container** (`desktop.dc.html:177-178`)
| Property | Prototype | Built | Target |
|---|---|---|---|
| max-width | 1180px | `.gn-shell` 80rem | `73.75rem`, page-local |
| padding | 26px 24px 40px | `.gn-shell` 0 1.25rem 3rem | `1.625rem 1.5rem 2.5rem`, page-local |

`.gn-shell` is **not** changed. The prototype's width caps are per-screen (the
workspace home uses 1100px), and `.gn-shell` serves every route.
`.gn-workspace-founding` already existing separately from `.gn-project-founding`
is the precedent that page-local is an accepted answer here.

**Header** (`desktop.dc.html:179-182`)
| Element | Prototype | Built | Target |
|---|---|---|---|
| `h1` | 34px / 41px / 700 / -0.4px | **no font-size declared** (UA `2em`) | `2.125rem` / `2.5625rem` / `-0.025em` |
| summary `p` | 17px / 22px, `--label2` | absent | `1.0625rem` / `1.375rem`, `--gn-text-muted` |
| gap | 4px | — | `0.25rem` |

The summary `<p>` renders **only when `workspaces !== null`**. On a failed read
it would otherwise print "0 workspaces you belong to." — a number nobody
counted, which this codebase refuses everywhere else.

**Grid** (`desktop.dc.html:184`)
| Property | Prototype | Built | Target |
|---|---|---|---|
| tracks | `repeat(auto-fit, minmax(280px, 1fr))` | `repeat(auto-fill, minmax(18rem, 1fr))` | `repeat(auto-fit, minmax(17.5rem, 1fr))` |
| gap | 18px | 0.9rem | `1.125rem` |
| margin-top | 26px | — | `1.625rem` |

`auto-fill` keeps empty tracks, so three workspaces render at 288px with dead
space to the right; `auto-fit` stretches them to fill the row. One word, visible
effect.

**Card** (`desktop.dc.html:186`)
| Property | Prototype | Built | Target |
|---|---|---|---|
| padding | 20px | `.gn-card` 0.75rem | `1.25rem` |
| layout | flex column, gap 12px | block + per-child top margins | flex column, `gap: 0.75rem` |
| radius | `var(--cardR)` | `var(--gn-radius-card)` | unchanged |
| shadow | `var(--cardShadow)` | `var(--gn-shadow-raised)` | unchanged |

Converting to a flex column removes three per-child margin rules
(`__chips` `0.6rem`, `__projects` `0.7rem`, `__restricted` `0.55rem`).

**Two couplings this must respect:**

1. `.gn-workspace-card__door` carries `margin: -0.75rem; padding: 0.75rem` —
   exact negatives of `.gn-card`'s own padding, so the hover fill reaches the
   card edge. Move card padding to `1.25rem` and both must move in lockstep or a
   seam opens.
2. `packages/ui/test/neo-card-radius.test.ts:41` asserts **no rule exists** for
   `.gn-workspace-list .gn-card`. That selector was deleted in Task 15 and must
   not return, so the padding routes through the door or a `Card` modifier —
   never that selector.

**Card head** (`desktop.dc.html:187-193`)
| Element | Prototype | Built | Target |
|---|---|---|---|
| head | gap 14px, `align-items: center`, `nowrap` | gap 0.6rem, `flex-start` | `0.875rem`, `center`, `nowrap` |
| avatar | 44px, radius 11px, 17px/600 | `--medium` 2rem circle, 0.8rem | new `--workspace` variant |
| titles gap | 2px, `min-width: 0` | — | `0.125rem`, `min-width: 0` |
| name | 20px / 25px / 600 | 1.05rem | `1.25rem` / `1.5625rem` / 600 |
| meta | 13px / 18px, `--label2` | — | `0.8125rem` / `1.125rem`, muted |

**Card body** (`desktop.dc.html:194-202`)
| Element | Prototype | Built | Target |
|---|---|---|---|
| chips row | gap 8px, wrap | gap 0.35rem | `0.5rem`, wrap |
| chip | 13px / 18px, radius 999px, `var(--chipPad)` | 0.8rem, `0.1rem 0.6rem` | `0.8125rem` / `1.125rem`, style-specific pad |
| chip dot | 9px | 0.55rem | `0.5625rem` |
| role line | 15px / 20px, `--label2` | 0.8rem | `0.9375rem` / `1.25rem`, muted |
| project line | 15px / 20px, `--label2`, gap 8px | — | same |
| chevron | 14px, `--label3`, stroke 2.6, `flex: none` | — | `--gn-text-subtle`, `aria-hidden` |

**Invitation banner** (`desktop.dc.html:211-224`)
| Property | Prototype | Built | Target |
|---|---|---|---|
| background | `var(--tintWarning)` | `--gn-surface-raised` | `var(--gn-tint-warning)` (new) |
| shadow | none | `--gn-shadow-raised` | none |
| left edge | none | `0.25rem solid --gn-text-accent` | none |
| margin-top | 34px | 1.1rem | `2.125rem` |
| padding | 20px | 1rem | `1.25rem` |
| row | gap 16px, `align-items: flex-start` | column, gap 0.6rem | icon row, `1rem`, `flex-start` |
| icon | 22px, stroke `--warning`, 1.8 | absent | `--gn-warning`, `aria-hidden` |
| heading | 17px / 22px / 600 | — | `1.0625rem` / `1.375rem` / 600 |
| body | 15px / 20px, `--label2` | — | `0.9375rem` / `1.25rem`, muted |
| buttons | gap 12px, margin-top 10px | — | `0.75rem`, `0.625rem` |

Behaviour is untouched: `aria-labelledby`, the `null` render on an empty list,
the `"Accept the invitation to {workspace}"` labels, and the deliberately muted
one-line failure that is **not** a `ShellRefusal`.

**Founding form** (`desktop.dc.html:221-228`)
| Property | Prototype | Built | Target |
|---|---|---|---|
| margin-top | 34px | 1.1rem | `2.125rem` |
| heading | 20px / 25px / 600 | 1.05rem | `1.25rem` / `1.5625rem` |
| label gap | 7px | 0.45rem | `0.4375rem` |
| label text | 13px / 18px | 0.8rem | `0.8125rem` / `1.125rem` |
| input | border none, `fieldShadow`, 17px, pad 0 14px | 1px border, 1rem, pad 0 0.85rem | see T2 |
| max-width | 420px | 26.25rem ✅ | unchanged |

The name is still submitted **as typed**, with no trim. That is deliberate and
is not a styling matter.

## Token work

The prototype's tinted surfaces have **no roles in the built system**. Literal
colours are banned by `packages/ui/test/token-discipline.test.ts`, and
`packages/ui/test/tokens.test.ts:119` requires every `var(--gn-…)` in `ui.css`
to name a declared role. So the tints must be *declared*, not improvised.

| Prototype | New role | Consumer |
|---|---|---|
| `--tintWarning` | `tintWarning` | invitation banner fill |
| `--tintDanger` | `tintDanger` | (reserved — see below) |
| `--tintPurple` | `tintRestricted` | (reserved — see below) |

Ruling 1(a) keeps the built chip set, and the built chips are untinted. So
**only `tintWarning` has a consumer in this change.** `tintDanger` and
`tintRestricted` are **not** added: a declared role with no consumer is dead
weight, and the contrast pairs guarding them would be assertions about nothing.
If a later pass tints the chips, they get added then, with their consumers.

### The contrast trap, stated explicitly

`tintWarning` is a translucent wash. The contrast obligation is against the
**composited** ground — the tint over `surface` — not against the tint alone. A
pair declared against the bare tint is an assertion with the wrong reference
point, which is a failure mode this project has already been bitten by.

`packages/ui/src/tokens.ts:331` carries exactly this reasoning for `fillTertiary`
composited over `surface`. T1 follows that precedent and measures composites in
**both themes × all three styles**.

Text on the banner uses existing roles: `--gn-text` for the heading and
`--gn-text-muted` for the body, each measured on the composite. If
`text-muted` misses 4.5:1 on the warm composite in any of the six combinations,
the fix is `warningText` (which already exists) — never a weakened minimum.

## Tasks

### T0 — Read the prototype's style blocks
Read the hig / minimal / neo blocks in `desktop.dc.html` for the actual values of
`cardShadow`, `ctlShadow`, `chipShadow`, `fieldShadow`, `chipPad` and
`tintWarning`. The markup gives the vocabulary; only these blocks give the
values, and neo inverts several to inset. **No CSS is written before this read.**

### T1 — `tintWarning` token role
Add to `packages/ui/src/tokens.ts` across hig/minimal/neo × light/dark, with a
`CONTRAST_PAIRS` row measured on the composite per the section above.

### T2 — Shared `ui.css` (ships to desktop)
Each edit justified as a shared-component improvement:

- **`.gn-chip` background** `--gn-surface-raised` → `--gn-fill-tertiary`. Today a
  chip sitting on a card is *invisible* — card and chip are both
  `surface-raised`. This is a real defect the port fixes, not a page preference.
- **`.gn-chip` metrics** → `font-size: 0.8125rem`, `line-height: 1.125rem`,
  `gap: 0.375rem`, dot `0.5625rem`, padding from the style-specific `chipPad`.
- **`.gn-avatar--workspace`** — new variant: `2.75rem` square,
  `border-radius: 0.6875rem`, `font-size: 1.0625rem`. `--large` (3.5rem /
  0.875rem radius) is the precedent that a non-circular avatar already belongs
  in this set.
- **`.gn-field__input`** — `border: none` plus the style-specific `fieldShadow`,
  `font-size: 1.0625rem`, `padding: 0 0.875rem`. Reconcile with the existing neo
  sunken-field rule rather than duplicating it.
- **`.gn-button`** — `padding: 0 1.125rem` and `ctlShadow`.

The tone modifiers at `ui.css:91-97` colour **only the dot**. They are left
alone: ruling 1(a) keeps the untinted chips.

### T3 — Page shell and header
Page-local width cap and padding (not `.gn-shell`). `.gn-page-title` gets its
first `font-size`. Summary `<p>` added, gated on `workspaces !== null`.

### T4 — Grid and card container
Grid tracks, gap and margin. Card padding to `1.25rem` with the door's negative
margin moved in lockstep. Card becomes a flex column; three margin rules deleted.

### T5 — Card content and the project line

Head gains the meta line; the role sentence moves below the chips.

**The meta line** reads `"{m} projects"`, singular `"1 project"`, where
`m = live.length` — the named, non-archived projects this card renders.

> **Why not `live.length + nameRestrictedProjectCount`?**
> `apps/server/src/read/workspace-counts.ts:259-265` states that
> `nameRestrictedProjectCount` **is never split by `archived` and cannot be** —
> a project whose name is withheld has no `archived` flag as far as the caller is
> concerned, and splitting it would disclose a property of a project the caller
> may not name. Summing an archived-excluded count with an archived-unknown one
> produces a number that counts nothing. The name-restricted projects keep their
> own existing sentence (`restrictedLine`), which is precisely why that sentence
> exists separately.

**The project line** joins live project names with `" · "`, capped at **3
names**. Beyond that it appends a truncation suffix. A trailing 14px chevron sits
at the end, `aria-hidden`, decorative only.

The cap is a count, not a CSS clamp: a `-webkit-line-clamp` could truncate the
"+N more" suffix itself, hiding the very number ruling 1(b) asked for.

**The withholding gate applies to both.** `test/workspaces-cards.test.tsx`
case 13.380 is named *"a guest card shows one 'Restricted' chip and no number
anywhere"*, so:

| | counts permitted | `countsWithheld` |
|---|---|---|
| meta line | `"2 projects"` | not rendered |
| truncation suffix | `" · +2 more"` | `" · and more"` |

A guest still sees named project names (13.380 asserts the card still names the
project), so the line renders — but its suffix carries no number. Both forms
read `viewer.countsWithheld`, the single gate, with no second source.

**What is lost:** per-project ticket counts and the `project-card-<id>` testids.
Per-project detail remains one click away at `/w/<id>`. This is ruling 1(b).

### T6 — Invitation banner
Flat `tintWarning` fill; shadow and accent edge removed; icon row layout.

### T7 — Founding form
`margin-top` and heading size. Everything else already matches.

### T8 — Docs
`Features.md` and the owning `test-cases/` file, in this change set — never a
follow-up.

## Test impact

| File | Change |
|---|---|
| `workspaces-cards.test.tsx` 3.154 | per-project testids removed with the rows |
| `workspaces-cards.test.tsx` 13.379 | new meta line; per-project count assertions removed |
| `workspaces-cards.test.tsx` 13.380 | guest sees no meta line and a number-free suffix |
| `workspaces-cards.test.tsx` 13.381 | unchanged — still gates on role |
| `workspaces-cards.test.tsx` 13.357 | expected to pass untouched (asserts text, not position) — verified, not assumed |
| `workspaces-invitation-banner.test.tsx` | any assertion on the old raised-card treatment |
| `founding.test.tsx` 13.394 | expected to pass untouched — verified, not assumed |
| `neo-card-radius.test.ts` | re-confirm the absent selector stays absent |
| `packages/ui/test/tokens.test.ts` | `tintWarning` composite contrast, 6 combinations |

New cases are needed for the truncation rule (at the cap, over the cap, and the
withheld suffix) and for the summary `<p>`'s absence on a failed read. Those go
into `test-cases/` at the next free numbers in the owning section; **existing IDs
are never renumbered.**

## Verification

**Baseline the viewport E2E suite before touching anything.** It is *already*
red on the tap-target ratchet from the `/help` work (3 failed / 28 passed).
Without a recorded baseline, a new `/workspaces` offender gets filed under "the
known `/help` failures" and never surfaces.

Then: `packages/ui` suite, `apps/web` suite, typecheck, the token-discipline
gate, and a live read of `/workspaces` in all three styles × both themes.

**No test run is piped into `head`.** Use `| tail -N` or redirect to a file.

## Stated divergences

Named here rather than discovered in review.

- **Avatar colour.** The prototype uses per-workspace brand hexes (`#EE7733`,
  `#3A6DB0`, `#273A63`). The built 4-tint contrast-paired system stays: a
  monogram is read text and owes 4.5:1. **Geometry matches; the colour source
  does not.** The tint key also stays the workspace **id**, not its name — two
  workspaces sharing a name must still be distinguishable, and a rename must not
  change a colour someone has learned.
- **Chip labels.** Ruling 1(a). The prototype's `{n} tickets` is not adopted.
- **Empty state.** The prototype has none — its seed data always has three
  workspaces. The built sentence ("No workspaces yet. Ask an admin for an invite
  link — or create your own.") stays.

## Out of scope

The prototype also collapses the nav to 4 items plus a "No workspace selected"
scope note. That is a shared component with its own 20.5K test file and it would
change every route. **Recommended as a separate pass.** Not included here.
