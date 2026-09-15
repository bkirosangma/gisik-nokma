# Help: what a real topic-group layer would need

**Status:** DESIGN NOTE, not an approved spec. Nothing here is scheduled.
**Date:** 2026-09-15
**Written because:** the owner supplied a newer desktop-prototype revision whose
Help screen has a sidebar of collapsible topic groups. The repo's own copy of the
prototype (`design-system/interactive/desktop.dc.html:1601`) has none of it —
`grep -c` for `helpGroups`, `HELP_GROUPS`, `helpOpenGroups`, `helpSectionGroup`
and `helpNextLabel` returns **0** for every one. So this is new design, not an
unbuilt part of an existing plan, and it needs a decision before any code.

## What the new revision asks for

1. A 274px left `aside`, with the Manual/FAQ segmented control moved into it.
2. A `TOPICS` eyebrow over **five named collapsible groups**, each with a caret
   and a count: Getting started (2), Tickets and views (3), Offline and sync (1),
   Workspace configuration (2), Access and integrations (2).
3. **One section rendered at a time**, chosen from the sidebar.
4. A section eyebrow above the `h2` — `MANUAL · GETTING STARTED`.
5. A `Next →` pager at the foot of each section.

## Why it cannot be ported as-is

**The shipped content model has no group layer, and its numbers are not the
prototype's.** Measured live on `/help`, not inferred: **16** `h2` sections,
**77** `h3` entries, 3 tables, 32 lists, across **2** documents. The prototype's
14 illustrative sections in 5 groups of 2/3/1/2/2 describe a different, smaller
body of writing.

The shipped shape is `document → section → entry`
(`packages/app-core/src/help/types.ts`), generated from `docs/manual.md` and
`docs/faq.md` by `scripts/help-content.mjs`. There is no third level to hang a
group on, and the prototype's group NAMES are illustrative copy — the same
category as its section prose, which the standing ruling already rejected:

> Help keeps its shipped section names (the prototype's differ — replacements,
> rejected); its `Working offline` prose is **illustrative and not shipped — do
> not add it**
> — `docs/superpowers/plans/2026-09-08-hig-per-screen.md:917`

So adopting the sidebar means **inventing a grouping over the real 16 sections**.
That is a content-architecture decision, not a restyle, which is why it was held
back out of the 2026-09-15 styling pass.

## Where the groups could come from

| Option | Mechanism | Cost |
|---|---|---|
| **(a) A level above `h2` in the source docs** | Restructure `docs/manual.md` so groups are real headings the generator reads | Touches the prose documents and the parser; groups can never drift from what they contain |
| **(b) A hand-maintained map in code** | `group id → section ids` beside the component | Cheapest to write, drifts the moment a section is added or renamed — needs the coverage test below or the nav silently loses sections |
| **(c) Derive from the `§` numbering** | Shipped sections are already `§1`–`§14`; ranges become groups | Bakes in an ordering assumption, and the two front-matter sections ("Before you start…", "The words on the screen") carry no `§` at all |
| **(d) Per-section frontmatter** | A `group:` key per section, read by `help-content.mjs` | Same drift-proofing as (a) without reshaping the prose; adds a schema to the source documents |

**(a) or (d) are preferable to (b)** for one reason: group membership should live
where the prose lives, so a new section cannot be written without landing in a
group.

## The invariant any option must carry

**Every shipped section belongs to exactly one group, asserted by a test.**
Without it the sidebar is a lossy index — a section that falls out of the map
becomes unreachable from the nav while still existing in the document, which is
the navigation form of the rule this plan already holds:

> **The audit's D column is binding: keep and restyle, never delete.** A
> prototype omitting a feature is not an instruction to remove it.
> — same plan, line 55

A count assertion is not enough (16 sections can map to 16 slots with one
duplicated and one missing). The test needs to be a partition check.

## The load-bearing trade-off: one section, or the whole document?

This is the real decision, and it is not a styling one.

Today `/help` renders **one searchable document**. That buys three things the
prototype's one-section-at-a-time model would cost:

1. **Browser find.** `Ctrl-F` today reaches any word in all 77 entries. With one
   section rendered, it reaches only the open one. That is an information loss,
   and the standing copy rule opens with *"reject anything that loses
   information"*.
2. **The search results already work by anchor.** `Results` in
   `help-browser.tsx` links each hit to `#${match.document}-${match.entry.id}`,
   which resolves because the target is on the page. One-section rendering
   breaks every result link unless the handler is changed to select the owning
   section first, then scroll.
3. **External deep links.** Anything pointing at a `#manual-…` anchor — from the
   source documents or elsewhere — stops resolving for the same reason.

**A middle option exists and is probably the right one:** keep the full-document
render and use the sidebar purely as navigation, scrolling to the existing
anchors. That buys the prototype's information architecture — groups, counts,
the active-item highlight — while keeping find-in-page, the working result
links, and the anchors. The `Next →` pager then becomes optional (the document
already flows), and the section eyebrow becomes a scroll-spy rather than a
render mode.

## What would still need designing

- Group names and membership over the real 16 sections — the prototype's five
  names do not describe this content and are illustrative anyway.
- Whether the FAQ's entries group at all; it has far fewer sections, and the
  prototype's sidebar shows a much shorter list under the FAQ tab.
- Responsive behaviour. The prototype is a desktop canvas; a 274px sidebar on a
  390px phone is most of the screen. `apps/mobile` has its own help screen over
  the same parsed content and is unaffected either way.
- Whether the group open/closed state persists, and where.

## Not in this note

Anything about Help's prose, section names or the search placeholder. Those are
settled by the copy rule above and were deliberately left untouched by the
2026-09-15 pass.
