# UX fixes from the 2026-10-01 UI/UX audit: design

**Status:** owner-approved decisions (2026-10-02). Ships as **its own release**, after the prefix/groups release (owner sequencing: mobile → prefix/groups → UX fixes). Base: `main` once the prefix/groups release has merged.

**Sources:**
- the audit report: `gisik-nokma-lanes/audit-2026-10-01/AUDIT-REPORT.md` (194 findings);
- the nine evidence files `findings/AUDIT-*.md`;
- the neumorphism research: `audit-2026-10-01/NEO-RESEARCH.md`.

Finding ids (BRD-, PV-, NP-, SYS-, SET-, WS-, ENT-, WF-, TT-) are cited throughout; every claim below rests on a screenshot or a source line in those files.

## 1. Owner rulings

| # | Ruling (owner, 2026-10-02) |
|---|---|
| U1 | **The accent is for the action only.** Selection (the Settings rail, Help contents, a chosen segment, the current tab) uses the quiet track with bold text, never the accent fill. (SYS-04, SET-16) |
| U2 | **The work surfaces go full width** (board, timeline, calendar, workflow canvas) with a 24px gutter. **Reading pages keep the 80rem cap** (forms, settings, notes, help, legal), with prose capped at ~70ch. (BRD-04, SYS-14, SYS-16, WF-20) |
| U3 | **Tablets get the bottom bar up to 64rem (1024px).** Above it, the desktop links show in full, with their spacing tightened so they fit from 1024 to 1120px instead of collapsing into "Menu". (SYS-03) |
| U4 | **The cream ground stays.** (SYS-21: no change) |
| U5 | **Neo text fields get a 1px FULL RING:** `#927c6a` light (`#897362` once the light well step in U8 ships), `#6b7491` dark. That's ≥3.3:1 against their surface. **"Borders on buttons only" becomes "borders on buttons and text fields"**; it stays in full for cards, wells, notices and rows. (SYS-05, WS-04, NP-25, TT-14; NEO-RESEARCH (d), (e)) |
| U6 | **The neo selected segment stays sunken** (the 2026-09-15 ruling), plus a semibold label and a **2px bar in the main TEXT colour** under it (not the accent, per U1). That's ≥3:1. (SYS-06, SET-08, NP-17) |
| U7 | **Neo disabled fields are flat:** no inset and no ring, with muted text. "No depth" means "not interactive". (SYS-09, SET-12) |
| U8 | **Neo dark depth ships:** the raised surface goes `#1b2340 → #232c50` and the raised highlight 7% → 12%. The **well/track fill step ships in both themes:** `#e6dcd2` light, `#141a33` dark. The `tokens.ts:264` "mathematically incompatible" docblock is corrected; it was computed against the retired `#409cff` accent. (BRD-21, ENT-19, SYS-07) |
| U9 | **The focus ring sits 3px outside fields** (`outline-offset` 1px → 3px) so it clears the shadow. |

## 2. Already handled elsewhere (out of this release)
- **The mobile release:** BRD-08 (the toolbar clipped on phones); SYS-01 (a session error looks signed out); NP-06 (overdue labelled "Due soon").
- **The prefix/groups release:** WS-03 (the project card's Open affordance); BRD-19 (one name, "Create ticket"); the workspace home's phone header.

## 3. Scope

### 3.1 The system layer (fixed once in shared code)
- **The tablet band, 641–1120px** (SYS-03, PV-02, PV-22, WS-02, BRD-05, PV-13, SET-26, WS-07, BRD-14):
  - the bottom bar and its slots up to 64rem (U3);
  - a 24px page gutter at every width (also WS-05, SET-19);
  - the project toolbar as two rows with the primary right-aligned;
  - below 64rem, the tables (List, Backlog, Members) switch to the stacked-row form the phone already uses;
  - the ticket sheet takes the full width below 64rem rather than leaving a 128px strip.
- **One phone page-header pattern** (SYS-15, BRD-06, PV-03, TT-09, NP-07, SET-20):
  - the title on one line, at the phone title size;
  - filters and secondary controls behind ONE "Filters" button;
  - the primary in the header row, or the bottom bar's slot, never a full-width stacked pill before content;
  - first content within the first 50% of a 390×844 screen.
- **A type scale** (SYS-02, WF-05, WF-06, WF-07, SET-10, SET-17, NP-12, NP-15):
  - three title tokens (`page`, `section`, `group`), each with a phone step, used by every page;
  - exactly one h1 per page;
  - section titles always larger than the items under them.
- **Accent discipline (U1)** (SYS-04, SET-16): selection states move to track + weight.
- **One destructive treatment** (SYS-12, SET-04, SET-05, WS-11): danger is a ghost/outlined button with a danger label until the confirm dialog, whose confirm is the filled danger. Repeated row actions (Remove from workspace) go into a row overflow.
- **The neo rules (U5–U9)** as tokens: a new field-rim token per theme, the segmented bar, flat disabled, the dark depth, the well step, and `CONTRAST_PAIRS` rows for every new surface (text, textSubtle, textAccent and accent on `#e6dcd2` and `#141a33`).
- **Depth grammar** (SYS-07, SET-11, PV-17, ENT-10, NP-21, TT-04, WF-18):
  - no raised card inside a raised card (rows inside a card are flat, with hairlines);
  - notices are a tinted flat fill, not an inset;
  - group headings are not inset troughs;
  - nested radii follow layout rule 05.
- **One disabled token across styles** (SYS-09, TT-07, TT-08): nothing focus-blue, nothing that looks live. Save stays quiet on an unchanged form.
- **Hit areas in the six shared components** (SYS-10, PV-09, PV-18, ENT-13, SET-13, NP-14, TT-06, WF-03): every control ≥44px via the hit-slop technique already used (20.616). The workflow state-node checkboxes get real 44px rows.
- **Scroll cues** (SYS-14, BRD-07, ENT-13, SET-25, WF-10, PV-04): an edge fade on every horizontal and inner scroller. The phone view tabs scroll with a fade, so no tab is hidden without a cue.
- **Colour never alone** (SYS-17, BRD-22, SET-18, WF-12): state categories carry a shape or text; overdue says "Overdue"; "Waiting" stops using the danger red.
- **The full-width work surfaces (U2)** (BRD-04, WF-20): the board, timeline, calendar and canvas escape the 80rem shell; reading pages keep it, with prose at `max-width: 70ch` (SYS-16, ENT-17, NP-11, NP-23, SET-23).
- **Nav "where am I"** (SYS-20, NP-26, WS-08): the top bar separates destinations from the last-visited project, and the current item is lit the same way everywhere.

### 3.2 Screen fixes (P1, with the P2s on the same screens)
- **Board** (BRD-01, BRD-02, BRD-03, BRD-09, BRD-12):
  - the phone rail is clamped to the visible column, and the others are `inert`;
  - the card footer goes back to one row (D14);
  - "who · when" is replaced by the sheet's history wording ("Moved to In progress by Kiro on 30 Sep");
  - the new-ticket dialog gets a sticky footer, so "Create ticket" is always in view, with a reason shown while it's disabled;
  - the phone ticket sheet opens on its fields (State, Assignee, Priority), with the description collapsed until it's tapped.
- **Project views** (PV-05, PV-06, PV-10, PV-11, PV-14):
  - calendar chips name their ticket (key + title), with the date role as a tooltip, single line with an ellipsis on phones;
  - the timeline gets a today line, and bars end on their real dates rather than whole weeks;
  - the undated list speaks to the person and offers "Add dates";
  - Backlog's move controls explain or show the order they change.
- **Notes, My Work** (NP-01, NP-02, NP-04, NP-05):
  - the phone Notes tab opens on the list, with a styled "Notes" toggle and a visible "Create note";
  - the editor's dead band is removed (min-height on the visible field);
  - "Needs your attention" is capped (5, then "Show all N"), with each ticket listed once with its strongest reason.
- **Settings and account** (SET-02, SET-03, SET-04):
  - connected-assistant rows show the app's name and host, with "Disconnect <name>";
  - the ticket-types list drops the disabled arrows on built-ins, with reorder by drag or menu on phones;
  - the account page's danger actions follow §3.1.
- **Entry** (ENT-01, ENT-04, ENT-12):
  - the sign-in primary is full width at every width;
  - the dead-invite page gets a heading and a primary "Go to sign in";
  - Help's topic tree goes behind a "Contents" button on phones.
- **Workflows** (WF-02, WF-03): the editor opens fitted to the workflow, with a "Fit" control; the state-node checkboxes follow §3.1's targets.
- **Workspace and members** (WS-02, WS-13): Members follows the tablet-band rules; rename gets a visible "Rename" affordance (an icon button) for touch.

### 3.3 Copy and vocabulary (SYS-11, SYS-19, and the copy findings in every group file)
- **One glossary,** adopted everywhere, including the manual (`docs/manual.md`):
  - **ticket** (never "job"), **state** (never "stage");
  - **"Create <thing>"**, **"Move to…"** (one name for move);
  - one date format: "17 Aug", plus the year when it isn't the current one;
  - "My work" in sentence case.
- **The generic tells removed from UI strings:** middle-dot meta strings → short labelled fragments; spaced em dashes in UI copy → a full stop or a colon; no all-caps eyebrows or weekday labels.
- **Empty states give the next step** (SYS-18 and the group items).
- **System words out of user copy:** the spec citations in the System rules panel, "implications", raw lower-case role values.

### 3.4 Deferred to the backlog (not this release)
The remaining per-screen P2/P3 polish that isn't covered by §3.1–3.3 is listed with its ids in an appendix of the plan, and each line is marked "deferred". It ships later only on the owner's word.

## 4. How it's verified
- The project's standing bar for every change: RED first, a control in the same `it`, a named mutation, and the catalogue in the same commit (a new bucket `test-cases/23-ux-fixes.md`, Features `## 20`).
- **A re-audit closes the release.** Re-run `audit-2026-10-01/capture.mjs` (one paced process, a 429 check) on the release tip. Every P1 id in §3 is re-checked on the new frames by a reviewer, and each closes only with its after-screenshot. Contrast values for U5–U8 are computed from the tokens (as `CONTRAST_PAIRS`) and measured on the frames.

## 5. Out of scope
- A rebrand, or a change to the cream ground (U4).
- New features.
- MCP tools.
- The populated-Inbox audit gap: seed notifications for the re-audit, but no Inbox redesign is planned unless that pass finds something.
