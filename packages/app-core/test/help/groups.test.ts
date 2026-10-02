import { describe, expect, it } from 'vitest';
import { HELP_CONTENT } from '../../src/help/content.generated.js';
import {
  HELP_GROUPS,
  helpGroupTitle,
  helpNav,
  type HelpGroup,
} from '../../src/help/groups.js';
import type { HelpDocument } from '../../src/help/types.js';

/**
 * The topic groups the Help sidebar navigates by, checked against the REAL
 * generated content rather than a fixture — the same reason `search.test.ts`
 * gives for doing so: a fixture would only prove the code works on a document
 * written to make it work, and the whole risk here is drift between a
 * hand-maintained map and documents somebody else edits.
 *
 * `HELP_GROUPS` is option (b) from the design note — a map in code — and (b)'s
 * only real cost is that it drifts silently. These cases are what makes the
 * drift loud.
 */

function document(id: HelpDocument['id']): HelpDocument {
  const found = HELP_CONTENT.find((doc) => doc.id === id);
  if (found === undefined) throw new Error(`no help document "${id}"`);
  return found;
}

/** The comparison case 15.19 makes, extracted so the control can reuse it. */
function claimedOrder(groups: readonly HelpGroup[]): readonly string[] {
  return groups.flatMap((group) => group.sectionIds);
}

describe("15.19 help groups partition their document's sections, in its own order", () => {
  /**
   * ONE assertion, chosen because a sequence comparison catches four distinct
   * defects that a count or a set comparison would each miss part of:
   *
   * - a section named in no group → missing from the left side
   * - a section named in two → duplicated
   * - an id that no longer exists (a renamed heading) → a stray
   * - a group listing its sections in a different order from the document
   *
   * The last one matters as much as the first three because BOTH the sidebar
   * and the page read an order — the sidebar from `HELP_GROUPS`, the page
   * from `document.sections` (the `Next` pager that also did is gone, 23.230) — so a difference would make the sidebar
   * present a reading order the document does not have, with nothing broken
   * enough to notice.
   */
  it('15.19 the manual: concatenating every group equals the document order exactly', () => {
    const manual = document('manual');
    const groups = HELP_GROUPS.manual;
    expect(groups).toBeDefined();
    expect(claimedOrder(groups ?? [])).toEqual(manual.sections.map((section) => section.id));
  });

  /**
   * The positive control, and it runs through the SAME comparison the case
   * above uses rather than a hand-rolled substitute — the failure shape this
   * repo has recorded is a control that does not traverse the measurement's
   * own path. Three mutations of the real group list, each a defect the
   * sequence comparison must reject.
   */
  it('15.19 control: the same comparison rejects a dropped, duplicated and reordered section', () => {
    const manual = document('manual');
    const order = manual.sections.map((section) => section.id);
    const real = HELP_GROUPS.manual ?? [];
    expect(claimedOrder(real)).toEqual(order); // the baseline this control mutates

    const withoutLast: readonly HelpGroup[] = real.map((group, i) =>
      i === real.length - 1 ? { ...group, sectionIds: group.sectionIds.slice(0, -1) } : group,
    );
    expect(claimedOrder(withoutLast)).not.toEqual(order);

    const firstId = real[0]?.sectionIds[0] ?? '';
    const withDuplicate: readonly HelpGroup[] = real.map((group, i) =>
      i === 0 ? { ...group, sectionIds: [...group.sectionIds, firstId] } : group,
    );
    expect(claimedOrder(withDuplicate)).not.toEqual(order);

    const reordered: readonly HelpGroup[] = real.map((group, i) =>
      i === 0 ? { ...group, sectionIds: [...group.sectionIds].reverse() } : group,
    );
    expect(claimedOrder(reordered)).not.toEqual(order);
  });

  /**
   * The FAQ declares NO groups, and that is a decision rather than an omission:
   * its 13 sections are already topic names ("Signing in", "Privacy"), so a
   * group layer over them would be a second index restating the first. Pinned
   * so the decision has to be made again on purpose if it changes — without
   * this, adding FAQ groups would look like filling a gap.
   */
  it('15.19 the FAQ declares no groups, because its sections are already topic names', () => {
    expect(HELP_GROUPS.faq).toBeUndefined();
    expect(document('faq').sections.map((section) => section.title)).toContain('Privacy');
  });
});

describe('15.20 every help section is reachable from the sidebar, grouped or not', () => {
  /**
   * The reachability invariant, and the reason `helpNav` appends an unclaimed
   * trailing run rather than filtering strays away: a section that falls out of
   * every group must still appear in the navigation. The plan's own rule in
   * navigation form — "keep and restyle, never delete" — and structural here
   * rather than dependent on 15.19 passing.
   */
  it('15.20 helpNav covers a grouped document exactly once per section', () => {
    const manual = document('manual');
    const flat = helpNav(manual).flatMap((group) => group.sections.map((section) => section.id));
    expect(flat).toEqual(manual.sections.map((section) => section.id));
  });

  /**
   * A document with no groups takes the SAME code path — every section is
   * unclaimed, so the whole document is one unnamed run — which is why the
   * sidebar needs no special case for the FAQ.
   */
  it('15.20 a document that declares no groups becomes one unnamed flat run', () => {
    const faq = document('faq');
    const nav = helpNav(faq);
    expect(nav).toHaveLength(1);
    expect(nav[0]?.title).toBeNull();
    expect(nav[0]?.sections.map((section) => section.id)).toEqual(
      faq.sections.map((section) => section.id),
    );
  });

  /**
   * The stray case, with a synthetic document because the real one has none —
   * this is the behaviour 15.19 exists to keep from ever being needed, and an
   * untested safety net is a claim rather than a net.
   */
  it('15.20 a section no group claims still appears, in a trailing unnamed run', () => {
    const manual = document('manual');
    const stray = { id: 'a-brand-new-chapter', title: '§15 — Something new', intro: [], entries: [] };
    const nav = helpNav({ ...manual, sections: [...manual.sections, stray] });
    const last = nav[nav.length - 1];
    expect(last?.title).toBeNull();
    expect(last?.sections.map((section) => section.id)).toEqual(['a-brand-new-chapter']);
  });
});

describe('15.21 the eyebrow reads the document, not a hand-kept list', () => {
  it('15.21 helpGroupTitle names the owning group, and null where none is declared', () => {
    const manual = document('manual');
    const faq = document('faq');
    expect(helpGroupTitle(manual, '1-signing-in')).toBe('Getting started');
    expect(helpGroupTitle(manual, '11-setting-up-your-own-stages-owners-and-admins')).toBe(
      'Permissions and setup',
    );
    expect(helpGroupTitle(manual, 'not-a-section')).toBeNull();
    expect(helpGroupTitle(faq, 'privacy')).toBeNull();
  });
});
