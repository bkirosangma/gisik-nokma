import type { HelpDocument, HelpSection } from './types.js';

/**
 * The topic groups the Help sidebar navigates by.
 *
 * ## Why this file exists at all
 *
 * The shipped content model is `document → section → entry`
 * (`./types.ts`), generated from `docs/manual.md` and `docs/faq.md` by
 * `scripts/help-content.mjs`. There is no third level to hang a group on, so a
 * sidebar of named topic groups needs one declared somewhere. The design note
 * (`docs/superpowers/specs/2026-09-15-help-group-layer-note.md`) lists four
 * places it could live; this is option **(b)**, a hand-maintained map in code,
 * chosen over (a)/(d) — a real heading level or per-section frontmatter in the
 * prose documents — for one reason: **the group NAMES below are provisional and
 * mine, not the owner's.** Reshaping `docs/manual.md` to carry copy that is
 * still awaiting review would put a provisional decision in the place hardest
 * to revise. (d) is the destination once the names settle; the note says so.
 *
 * ## The names are an invention, and deliberately all in one place
 *
 * The desktop prototype's five groups — Getting started, Tickets and views,
 * Offline and sync, Workspace configuration, Access and integrations — are
 * illustrative copy over 14 illustrative sections, and the standing ruling
 * already rejected its section prose as *"illustrative and not shipped"*
 * (`docs/superpowers/plans/2026-09-08-hig-per-screen.md:917`). So these names
 * are not ported; they are written against the 16 sections that actually exist,
 * in the product's own vocabulary — it says **jobs**, never "tickets". They sit
 * in one array so the owner can rewrite all five in a single edit.
 *
 * ## Groups are CONTIGUOUS RUNS of the document, and that is enforced
 *
 * A group may only hold sections that are already neighbours. The first draft
 * of this map was not contiguous — it filed `§10 — Who can see what` with
 * "Workspaces and people", four chapters away from its place in the document —
 * and case 15.19 reddened on the ordering half of its assertion, which is what
 * that half is for. `§10` now opens "Permissions and setup" instead, beside the
 * two configuration chapters it precedes.
 *
 * The constraint is not arbitrary. The sidebar reads this order and the `Next`
 * pager reads the document's; a non-contiguous group makes the two disagree, so
 * a reader following the sidebar downward and a reader following `Next` visit
 * the same sections in different sequences. Regrouping therefore means choosing
 * where the CUTS fall, not which chapters go together — and if a grouping is
 * only expressible by reordering, the thing to reorder is `docs/manual.md`.
 *
 * ## The FAQ declares no groups, on purpose
 *
 * Its 13 sections are ALREADY topic names — "Signing in", "Workspaces and
 * projects", "People and roles", "Jobs", "Privacy" — so a group layer over them
 * would be a second index saying what the first already says. The manual's 16
 * are `§`-numbered chapters, which is the shape that genuinely wants grouping.
 * `helpNav` renders an ungrouped document as one flat list, which is why the
 * prototype's one-shape-fits-both sidebar is not what ships here.
 *
 * Note this differs from the prototype in a second way: its groups span BOTH
 * documents (`g-work` holds `faq-delete`, `g-sync` holds `faq-offline`) and are
 * then filtered to the open tab. That only works because its FAQ has five
 * sections; over 13 already-topical ones it would file each FAQ topic under a
 * manual chapter's heading, which reads as a claim about the FAQ's structure
 * that is not true.
 */

export interface HelpGroup {
  readonly id: string;
  readonly title: string;
  /** Section ids from the owning document, in the order the sidebar shows them. */
  readonly sectionIds: readonly string[];
}

/**
 * Groups per document. A document absent from this map is rendered flat — the
 * absence is the declaration, and `helpNav` needs no special case for it.
 *
 * The sequence here is asserted against the real generated content by
 * `packages/app-core/test/help/groups.test.ts` (case 15.19): concatenating the
 * `sectionIds` must equal the document's own section order EXACTLY. That single
 * assertion catches a stray id, a duplicate, a missing section and a reordering
 * — and the reordering half matters because the `Next` pager and the sidebar
 * both read this order, so a difference would make the sidebar present a
 * reading order the document does not have.
 */
export const HELP_GROUPS: Readonly<Partial<Record<HelpDocument['id'], readonly HelpGroup[]>>> = {
  manual: [
    {
      id: 'manual-start',
      title: 'Getting started',
      sectionIds: [
        'before-you-start-five-things-that-will-save-you-an-afternoon',
        'the-words-on-the-screen',
        '1-signing-in',
        '2-finding-your-way-around',
      ],
    },
    {
      id: 'manual-people',
      title: 'Workspaces and people',
      sectionIds: ['3-workspaces-and-the-project-problem', '4-getting-your-people-in'],
    },
    {
      id: 'manual-jobs',
      title: 'Working with jobs',
      sectionIds: [
        '5-adding-a-job-and-what-you-can-change-about-it',
        '6-jobs-inside-jobs',
        '7-moving-a-job-through-its-stages',
        '8-looking-at-the-work',
        '9-what-needs-attention-and-the-inbox',
      ],
    },
    {
      id: 'manual-setup',
      title: 'Permissions and setup',
      sectionIds: [
        '10-who-can-see-what',
        '11-setting-up-your-own-stages-owners-and-admins',
        '12-setting-up-your-own-job-types-owners-and-admins',
      ],
    },
    {
      id: 'manual-devices',
      title: 'Devices and details',
      sectionIds: [
        '13-on-your-phone-or-computer-and-with-no-signal',
        '14-the-time-zone-and-other-things-worth-knowing',
      ],
    },
    {
      id: 'manual-notes',
      title: 'Notes',
      sectionIds: ['15-notes'],
    },
  ],
};

/**
 * A short name for each document. Two callers: the section eyebrow (`MANUAL ·
 * GETTING STARTED`) and the document switch in the sidebar.
 *
 * ## The switch used to render the documents' full titles, on a rule the owner
 * has since lifted
 *
 * Until 2026-09-15 the tabs read "Gisik Nokma — instruction manual" and "Gisik
 * Nokma — frequently asked questions", because the copy rule keeps shipped
 * wording where the prototype's is *merely different* and the prototype's
 * `Manual`/`FAQ` were shorter. **The owner lifted that ruling for this control
 * in as many words** — *"forget the ruling on the information losing. make the
 * manual/faq switch like in the attached file"* — so the switch is now the
 * reference's own: two short segments side by side.
 *
 * The words are the reference's, and they were not arbitrary there either:
 * `helpTabs: [{ k: "manual", l: "Manual" }, { k: "faq", l: "FAQ" }]` in the
 * prototype's own source. They also match the shipped search label's phrasing,
 * *"Search the manual and FAQ"*, so the two controls now say the same thing.
 *
 * ONE CONSEQUENCE, named rather than left to be noticed: the documents' full
 * titles no longer appear anywhere on the screen. They are still on the
 * `HelpDocument`, so anything that wants them has them.
 *
 * Keyed by `HelpDocument['id']` rather than positionally, so a third document
 * would fail to compile here instead of rendering an `undefined` segment.
 */
export const HELP_DOCUMENT_LABELS: Readonly<Record<HelpDocument['id'], string>> = {
  manual: 'Manual',
  faq: 'FAQ',
};

/** One entry in the sidebar. `title === null` is a flat, unnamed run of sections. */
export interface HelpNavGroup {
  readonly id: string;
  readonly title: string | null;
  readonly sections: readonly HelpSection[];
}

/**
 * The sidebar model for one document: its declared groups, followed by any
 * section no group claims.
 *
 * **The trailing run is the load-bearing part, not a fallback.** It means every
 * section of every document is reachable from the nav BY CONSTRUCTION rather
 * than because a test passes — so if a new `§15` is written tomorrow and nobody
 * adds it to `HELP_GROUPS`, it appears at the foot of the sidebar looking
 * untidy instead of vanishing from the navigation while still existing in the
 * document. That distinction is the plan's own rule in navigation form:
 *
 * > **The audit's D column is binding: keep and restyle, never delete.**
 *
 * Case 15.19 then asserts the trailing run is EMPTY for the manual, so the
 * untidiness is loud in CI rather than only visible to whoever happens to
 * scroll the sidebar. A document with no groups at all (the FAQ) is the same
 * code path: every section is unclaimed, so the whole document is one flat run.
 */
export function helpNav(document: HelpDocument): readonly HelpNavGroup[] {
  const groups = HELP_GROUPS[document.id] ?? [];
  const byId = new Map(document.sections.map((section) => [section.id, section]));
  const claimed = new Set(groups.flatMap((group) => group.sectionIds));
  const named = groups.map((group) => ({
    id: group.id,
    title: group.title,
    sections: group.sectionIds
      .map((id) => byId.get(id))
      .filter((section): section is HelpSection => section !== undefined),
  }));
  const rest = document.sections.filter((section) => !claimed.has(section.id));
  return rest.length === 0
    ? named
    : [...named, { id: `${document.id}-ungrouped`, title: null, sections: rest }];
}

/** The group a section belongs to, or `null` where the document declares none. */
export function helpGroupTitle(document: HelpDocument, sectionId: string): string | null {
  const groups = HELP_GROUPS[document.id] ?? [];
  const owner = groups.find((group) => group.sectionIds.includes(sectionId));
  return owner === undefined ? null : owner.title;
}

/**
 * The section after `sectionId` in the document's own order, for the `Next`
 * pager. `null` at the last section — the pager is then not drawn at all,
 * rather than drawn pointing nowhere.
 *
 * Document order and not sidebar order, and they are the same thing: case 15.19
 * asserts it. Reading `document.sections` directly means the pager still works
 * for a document with no groups, and still works for a section that drifted out
 * of every group.
 */
export function helpNextSection(document: HelpDocument, sectionId: string): HelpSection | null {
  const at = document.sections.findIndex((section) => section.id === sectionId);
  if (at < 0 || at === document.sections.length - 1) return null;
  return document.sections[at + 1] ?? null;
}
