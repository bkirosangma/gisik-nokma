# Help: what a real topic-group layer would need

**Status:** IMPLEMENTED 2026-09-15, on the recommendation this note ends with —
the sidebar navigates the full document, the manual declares groups and the FAQ
does not. `packages/app-core/src/help/groups.ts` is the option-(b) map below,
and its docblock carries the decisions this note only listed as options. Two
things in this note were WRONG when written and are corrected in place: see
*Corrections* at the foot.
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
prototype's.** Counted from the generated content, across **2** documents:
**29** `h2` sections and **224** `h3` entries — the manual 16 and 77, the FAQ 13
and 147. The prototype's 14 illustrative sections in 5 groups of 2/3/1/2/2
describe a different, much smaller body of writing.

*(This paragraph first said "16 sections, 77 entries" for the whole page. That
was the MANUAL ALONE: the figure was read off a live `/help` with the manual tab
active, and the FAQ tab's 13 sections and 147 entries were simply not on the
page to be counted. See Corrections.)*

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

**(b) was built anyway, and (d) is still the destination.** The deciding fact is
that the group NAMES are an invention pending the owner's review, and reshaping
`docs/manual.md` to carry provisional copy puts a provisional decision in the
place hardest to revise. (b) plus the partition test below buys the same
drift-proofing at the cost of one file to keep in step; when the names settle,
moving them into (d) is a generator change and a deletion, not a redesign.

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

**As built it is stronger than a partition check, and the extra strength earned
its keep immediately.** Case 15.19 compares the concatenated group membership to
the document's section order as a SEQUENCE, so it also rejects a group whose
sections are not neighbours in the document. That matters because the sidebar
reads the group order and the `Next` pager reads the document's: a
non-contiguous group makes a reader following the sidebar downward and a reader
following `Next` visit the same sections in different sequences. The first draft
of the map filed `§10 — Who can see what` with "Workspaces and people", four
chapters from its place in the document, and the ordering half of that assertion
is what caught it — a set-partition check would have passed.

Reachability is additionally structural rather than test-dependent: `helpNav`
appends any section no group claims as a trailing unnamed run, so a section that
falls out of the map looks untidy in the sidebar instead of disappearing from
it. The test then asserts that run is empty, which makes the untidiness loud in
CI rather than only visible to whoever scrolls.

## The load-bearing trade-off: one section, or the whole document?

This is the real decision, and it is not a styling one.

Today `/help` renders **one searchable document**. That buys three things the
prototype's one-section-at-a-time model would cost:

1. **Browser find.** `Ctrl-F` today reaches any word in all 224 entries. With
   one section rendered, it reaches only the open one. That is an information
   loss, and the standing copy rule opens with *"reject anything that loses
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
links, and the anchors.

**THIS IS WHAT SHIPPED.** Item 3 of the new revision — one section at a time —
is the single part of its design deliberately declined, and the three costs
above are the reason. Everything else came over, and two details resolved more
simply than this note expected:

- **The section eyebrow is not a scroll-spy.** Each section renders its own,
  statically. The prototype needs a computed one because it draws a single
  section; over the full document a per-section eyebrow is both simpler and
  always right.
- **The `Next` pager is not optional, and it is per section.** It says "you have
  reached the end of THIS topic", which is a per-section fact even in a document
  that flows. Drawn as a real anchor to the next section's id, so it works with
  middle-click and the back button, and it leaves a fragment the sidebar's
  active marker then reads.
- **The active marker reads the URL, not a click handler.** Three things set the
  fragment — a sidebar link, a search result, an external deep link — and all
  three light up the same sidebar row. A search result's fragment names an
  ENTRY, so it resolves to the section that owns it; without that lookup, using
  the search would leave the sidebar marking nothing.

## What this left open, and how each was settled

- **Group names and membership over the real 16 sections.** Settled, and the
  names are MINE pending the owner's review: Getting started (4), Workspaces and
  people (2), Working with jobs (5), Permissions and setup (3), Devices and
  details (2). They are written in the product's own vocabulary — it says
  **jobs**, never "tickets" — and they sit in one array in `groups.ts` so all
  five can be rewritten in a single edit.
- **Whether the FAQ's entries group at all.** Settled: **no**, and not for want
  of effort. Its 13 sections are already topic names — "Signing in", "Workspaces
  and projects", "People and roles", "Jobs", "Privacy" — so a group layer over
  them would be a second index restating the first. Only the manual's
  `§`-numbered chapters have the shape that wants grouping. `helpNav` renders an
  ungrouped document as one flat run, which is why the sidebar needs no special
  case for it. Case 15.19 pins the absence so it has to be revisited on purpose.
  *(The prototype groups ACROSS both documents and filters to the open tab; that
  only works because its FAQ has five sections. Over 13 already-topical ones it
  would file each FAQ topic under a manual chapter's heading.)*
- **Responsive behaviour.** Settled with an explicit breakpoint rather than left
  to `flex-wrap`: below 48rem the sidebar goes full width, drops `position:
  sticky` and moves its hairline from the right edge to the bottom. Measured at
  a real 390×844: no horizontal overflow, no tap target under 24px, no text
  under the 12px floor except a PRE-EXISTING `.gn-help__code` at 11.96px (see
  Corrections). `apps/mobile` has its own help screen over the same parsed
  content and is unaffected.
- **Whether the group open/closed state persists.** Settled: **no**. Groups
  default OPEN and the collapse is per-mount. Collapsed-by-default would put
  every section behind a click and make the sidebar a strictly worse index than
  the flat row of links it replaces; and nothing else on this screen persists.

## Not in this note

Anything about Help's prose, section names or the search placeholder. Those are
settled by the copy rule above and were deliberately left untouched by the
2026-09-15 pass — including the shipped document titles, which is why the
sidebar's tabs are a STACKED column of full-width segments rather than the
reference's side-by-side pair: "Gisik Nokma — instruction manual" is 31
characters and does not fit beside its sibling in 274px, so the layout gave way
instead of the words.

## Corrections

Two errors in this note as first written, both found while implementing it.

1. **"16 `h2` sections, 77 `h3` entries" was the manual alone, not the page.**
   The true totals across both documents are **29 sections and 224 entries**.
   The figure was read off a live `/help` with the manual tab active, so the
   FAQ's 13 sections and 147 entries were never on the page to be counted — a
   measurement taken through an instrument that could only see half the subject.
   It mattered: the sentence it supported argues the prototype describes a
   smaller body of writing, and the real gap is three times what was claimed.
   Corrected above.
2. **The pager's label is `Next` plus the next section's title, not `Next →`.**
   The reference's markup has no arrow glyph — the row is a `Next` label beside
   a link carrying the following section's own name. What ships matches the
   markup.

One thing measured during implementation and NOT fixed, recorded so it is not
mistaken for something this pass verified clean: `.gn-help__code` renders at
**11.96px**, below the 12px floor `apps/web/e2e-viewport/type-scale.ts` derives.
One occurrence on the page, and it predates this change — `font-size: 0.92em`
resolves against the browser's smaller default monospace size rather than the
16px parent. `/help` carries no type-scale baseline, so nothing ratchets on it.
Fixing it is a one-line change to a rule this pass did not otherwise touch, so
it is left for the owner to call.
