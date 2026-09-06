import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AttachmentListItem,
  describeDriveReachability,
  type AttachmentListEntry,
} from '../src/components/AttachmentListItem.js';

const UPLOAD: AttachmentListEntry = {
  kind: 'upload',
  attachmentId: '01J9GATA000000000000000000',
  filename: 'receipt.pdf',
  mime: 'application/pdf',
  size: 1024,
  sha256: 'a'.repeat(64),
};

const REFERENCE: AttachmentListEntry = {
  kind: 'drive-reference',
  attachmentId: '01J9GATD000000000000000000',
  driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
  name: 'GST filing Aug 2026.pdf',
  mimeType: 'application/pdf',
  webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
  capturedAt: '2026-08-20T10:00:00.000Z',
};

/**
 * The same reference fixture, re-dated. Declared with a guard rather than a
 * cast: `REFERENCE` is union-typed, and `as never` (the first spelling here)
 * is not an object type, so the spread did not compile. A thrown fixture error
 * is also the only thing that would tell a later reader the fixture stopped
 * being a Drive reference, which a cast would have silently absorbed.
 *
 * NOT A PLAN DEFECT — `a409a2e`'s message said it was, and that is the one
 * thing wrong here. That message blamed the plan text for the TS2698 spread
 * failure; the paragraph above is accurate, because "here" means this file,
 * but the commit message was not. SWEPT: the plan's step-1 test
 * (`docs/superpowers/plans/2026-08-20-07-editor-attachments.md` lines
 * 5344-5584) is four `it` blocks over UPLOAD, REFERENCE and FORBIDDEN — it
 * re-dates no fixture, spreads `REFERENCE` nowhere, and contains no
 * `as never`. The whole plan file's four `as never` hits sit at lines 760,
 * 2375 and 5002 plus one prose false positive at 7136, none inside this range
 * and none about `REFERENCE`. Positive control for both nulls, from the same
 * runs: `REFERENCE` appears 5 times inside 5344-5584, so the greps were
 * reaching content. This fixture exists only to feed the zone block below,
 * which is itself an addition beyond the plan, so the construct that failed
 * typecheck was this file's own first spelling. The cost of leaving that
 * uncorrected is specific: a plan-defect ledger entry pointing at plan text
 * that compiles sends a later reader on a search that cannot terminate.
 */
function referenceCapturedAt(capturedAt: string): AttachmentListEntry {
  if (REFERENCE.kind !== 'drive-reference') throw new Error('REFERENCE is not a Drive reference');
  return { ...REFERENCE, capturedAt };
}

/** Words that would claim knowledge this product does not have. */
const FORBIDDEN = ['deleted', 'missing', 'no longer', 'available', 'verified', 'up to date'];

/**
 * 9.60 — ROLLUP, not a distinct assertion — the attachment list surface as a whole, including a Drive reference rendering as a link rather than an embed. Covered by the cases in this file (9.131–9.139) plus 3.76, the app-core `AttachmentList` consuming the same union.
 */
describe('AttachmentListItem', () => {
  /**
   * 9.131 — an upload renders as a file this board holds: `data-attachment-kind="upload"`, class `attachment-item--upload`, an `<a>` pointed at `/v1/attachments/:id`, filename on the surface.
   */
  it('an upload renders as a file the board holds, downloadable from the board', () => {
    const view = render(
      <ul>
        <AttachmentListItem entry={UPLOAD} />
      </ul>,
    );
    const item = view.container.querySelector('.attachment-item')!;
    expect(item.getAttribute('data-attachment-kind')).toBe('upload');
    expect(item.className).toContain('attachment-item--upload');
    expect(item.querySelector('a')!.getAttribute('href')).toBe(
      '/v1/attachments/01J9GATA000000000000000000',
    );
    expect(item.textContent).toContain('receipt.pdf');
    view.unmount();
  });

  /**
   * 9.132 — planted defect: a Drive reference renders as external and last-seen, never as a held file — distinct kind attribute and class, the link is the Drive `webViewLink` and never contains `/v1/attachments/`.
   */
  it('planted defect: a Drive reference renders as external and last-seen, never as a held file', () => {
    const view = render(
      <ul>
        <AttachmentListItem entry={REFERENCE} />
      </ul>,
    );
    const item = view.container.querySelector('.attachment-item')!;
    // Distinct kind, distinct class — a reader can tell them apart.
    expect(item.getAttribute('data-attachment-kind')).toBe('drive-reference');
    expect(item.className).toContain('attachment-item--drive-reference');
    expect(item.className).not.toContain('attachment-item--upload');
    // It is a link into Drive, never a download from this board.
    const href = item.querySelector('a')!.getAttribute('href')!;
    expect(href).toBe(REFERENCE.kind === 'drive-reference' ? REFERENCE.webViewLink : '');
    expect(href).not.toContain('/v1/attachments/');
    // Last-seen name AND capture date are both on the surface.
    expect(item.textContent).toContain('GST filing Aug 2026.pdf');
    expect(item.textContent).toContain('last seen');
    expect(item.textContent).toContain('2026-08-20');
    expect(item.textContent).toContain('Google Drive');
    view.unmount();
  });

  /**
   * 9.133 — planted defect: an unreachable link reads as unknown, never absent and never fine — checked both unchecked and after a failed reachability check, and none of the forbidden words appears in either state, which nonetheless read as two different sentences.
   */
  it('planted defect: an unreachable link is unknown — never absent, never fine', () => {
    const unchecked = render(
      <ul>
        <AttachmentListItem entry={REFERENCE} />
      </ul>,
    );
    const failed = render(
      <ul>
        <AttachmentListItem entry={REFERENCE} linkCheck="unreachable" />
      </ul>,
    );
    for (const view of [unchecked, failed]) {
      const text = view.container.querySelector('.attachment-item__reachability')!.textContent!;
      expect(text.toLowerCase()).toContain('unknown');
      for (const word of FORBIDDEN) expect(text.toLowerCase()).not.toContain(word);
    }
    // The two states say different things, and neither of them settles anything.
    expect(unchecked.container.textContent).not.toBe(failed.container.textContent);
    unchecked.unmount();
    failed.unmount();
  });

  /**
   * 9.134 — an upload carries no reachability language at all — the `.attachment-item__reachability` element does not exist for an upload, because the board holds the file.
   */
  it('an upload never carries reachability language at all — the board holds it', () => {
    const view = render(
      <ul>
        <AttachmentListItem entry={UPLOAD} />
      </ul>,
    );
    expect(view.container.querySelector('.attachment-item__reachability')).toBeNull();
    view.unmount();
  });

  /**
   * The sentence a user reads is asserted against the exported function, not
   * retyped: `describeDriveReachability` is the one place either sentence
   * exists, in the pattern `EVIDENCE_DRIVE_REFERENCE_REASON` sets in the
   * domain. Retyping the copy here would let the two drift and leave both
   * green.
   */
  /**
   * 9.135 — the reachability sentence rendered is exactly what the exported `describeDriveReachability` returns, for both `not-checked` and `unreachable`, asserted against the function rather than a retyped copy.
   */
  it('renders the reachability sentence the exported describer returns, both states', () => {
    for (const check of ['not-checked', 'unreachable'] as const) {
      const view = render(
        <ul>
          <AttachmentListItem entry={REFERENCE} linkCheck={check} />
        </ul>,
      );
      expect(view.container.querySelector('.attachment-item__reachability')!.textContent).toBe(
        describeDriveReachability(check),
      );
      view.unmount();
    }
    expect(describeDriveReachability('not-checked')).not.toBe(describeDriveReachability('unreachable'));
  });
});

/**
 * THE CAPTURE DATE, AND WHAT A TZ LOOP HERE CAN AND CANNOT PROVE.
 *
 * Read the correction history in `google-picker.test.ts` before touching this
 * block. Three commits on this branch in a row overstated a TZ claim, and the
 * reason is structural: `Date.prototype.toISOString` is defined by ECMA-262 to
 * format the internal time value in UTC unconditionally — it reads no local
 * zone — so against the implementation that ships today (`formatCapturedAt`,
 * an `toISOString().slice(0, 10)`) these loops are GUARANTEED to agree across
 * every zone. **No kill observed here is attributable to TZ variance for the
 * shipped code.** That is not what the loop is for.
 *
 * What it is for is a defect shape the plan does not plant but this product
 * would actually suffer: the capture day rebuilt from local getters
 * (`getFullYear`/`getMonth`/`getDate`) or `toLocaleDateString`. That renders a
 * DIFFERENT DAY depending on where the reader sits, which for a field whose
 * entire job is to date an observation is the same class of lie the rest of
 * this file exists to prevent. Both fixtures below sit on a day boundary, in
 * OPPOSITE directions — 20:00Z is already the 21st east of UTC, 02:00Z is
 * still the 19th west of it — because one instant only catches a local render
 * in one sign. MEASURED: with `formatCapturedAt` mutated to local getters, the
 * `captured 2026-08-20` assertion stays GREEN at zone `UTC` and reddens at
 * `Asia/Kolkata` in the first case and at `Pacific/Midway` in the second, in
 * the same run — so that kill is attributable to the zone axis, which is the
 * claim the sibling file's history could not make. Narrowing ZONES to `['UTC']`
 * alone leaves that assertion green and reddens only the control below.
 *
 * THE POSITIVE CONTROL IS KEPT IN-FILE, which is the thing the sibling test's
 * own comment records as a gap. `process.env.TZ` reassignment mid-test is only
 * meaningful if it actually reaches this worker's `Date` getters, and that is
 * asserted here rather than recalled: each case collects the LOCAL day of its
 * own instant across the same zone list and requires more than one distinct
 * value. If the reassignment were inert — a pool that gives the worker no zone
 * reconfiguration, say — the control fails loudly instead of letting an
 * invariance claim pass on a loop that never varied anything.
 *
 * This loop's own assignment overrides whatever `TZ` the runner was launched
 * with, so a shell-level `TZ=... vitest run` in front of this file is inert
 * for these two cases specifically.
 */
describe('the captured day is the UTC day, under every zone a reader might sit in', () => {
  const ZONES = ['UTC', 'Asia/Kolkata', 'Pacific/Kiritimati', 'Pacific/Midway'];

  const cases = [
    // 20:00Z — the 21st in Asia/Kolkata (+5:30) and Pacific/Kiritimati (+14).
    { label: 'an instant that is already tomorrow east of UTC', capturedAt: '2026-08-20T20:00:00.000Z' },
    // 02:00Z — still the 19th in Pacific/Midway (-11).
    { label: 'an instant that is still yesterday west of UTC', capturedAt: '2026-08-20T02:00:00.000Z' },
  ];

  for (const { label, capturedAt } of cases) {
    /**
     * 9.136 — the capture day renders as the UTC day across four zones, checked with two fixtures straddling a day boundary in OPPOSITE directions, with an in-file positive control proving the `TZ` reassignment reached this worker's `Date` getters at all.
     */
    it(`renders 2026-08-20 for ${label}, and the zones really did move`, () => {
      const entry = referenceCapturedAt(capturedAt);
      const originalTz = process.env['TZ'];
      const localDays = new Set<number>();
      try {
        for (const zone of ZONES) {
          process.env['TZ'] = zone;
          localDays.add(new Date(capturedAt).getDate());
          const view = render(
            <ul>
              <AttachmentListItem entry={entry} />
            </ul>,
          );
          const seen = view.container.querySelector('.attachment-item__last-seen')!.textContent!;
          expect(seen, `zone ${zone}`).toContain('captured 2026-08-20');
          view.unmount();
        }
      } finally {
        if (originalTz === undefined) delete process.env['TZ'];
        else process.env['TZ'] = originalTz;
      }
      // POSITIVE CONTROL: the zone reassignment above reached this worker's
      // Date getters. Without this, a pool that ignores TZ would make every
      // iteration identical and the invariance above would assert nothing.
      expect(localDays.size, 'TZ reassignment did not move the local day').toBeGreaterThan(1);
    });
  }

  /**
   * 9.137 — an unparseable `capturedAt` renders verbatim (`captured not-an-instant`) rather than inventing a day.
   */
  it('renders the capture date verbatim when the instant is unparseable, never an invented day', () => {
    const entry = referenceCapturedAt('not-an-instant');
    const view = render(
      <ul>
        <AttachmentListItem entry={entry} />
      </ul>,
    );
    expect(view.container.querySelector('.attachment-item__last-seen')!.textContent).toContain(
      'captured not-an-instant',
    );
    view.unmount();
  });
});

/**
 * THE STYLESHEET IS A SPELLING OF THE BEM CONTRACT THAT TYPESCRIPT CANNOT SEE
 * — the argument `mention.test.ts` makes for the mention classes, applied to
 * the seven this task's Produces section names. Both directions are compared
 * against explicit lists, so a rename on either side breaks loudly rather than
 * leaving correct markup with no styling and nothing red.
 *
 * The two lists are deliberately DIFFERENT, and the difference is asserted as
 * a subset relation rather than smoothed over: `attachment-item--upload` and
 * `attachment-item__name` are emitted and styled by nobody — an upload is the
 * unmarked case and the name is a plain link — so a stylesheet rule appearing
 * for either one without this contract moving fails here.
 */
const BEM_CONTRACT = [
  'attachment-item',
  'attachment-item--drive-reference',
  'attachment-item--upload',
  'attachment-item__kind',
  'attachment-item__last-seen',
  'attachment-item__name',
  'attachment-item__reachability',
];

const STYLED = [
  'attachment-item',
  'attachment-item--drive-reference',
  'attachment-item__kind',
  'attachment-item__last-seen',
  'attachment-item__reachability',
];

describe('the BEM classes the attachment item contract names', () => {
  /**
   * 9.138 — the stylesheet declares exactly the `attachment-item*` classes the component actually styles — set equality against an explicit list.
   */
  it('the stylesheet declares exactly the attachment-item classes that carry structure', () => {
    const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles/editor.css');
    const css = readFileSync(cssPath, 'utf8');
    // Same matcher caveat as `mention.test.ts`: `[a-z_-]*` misses a class
    // carrying a digit or a capital, and this only sees a class that opens a
    // rule or heads a comma-separated selector group. A class declared solely
    // inside a compound selector would be invisible to it.
    const declared = [
      ...css.matchAll(/\.(attachment-item[a-z_-]*)\s*[,{]/g),
    ].map((match) => match[1]!);
    expect([...new Set(declared)].sort()).toEqual([...STYLED].sort());
    expect(STYLED.every((name) => BEM_CONTRACT.includes(name))).toBe(true);
  });

  /**
   * 9.139 — planted defect: the two fixtures (upload, reference) between them emit exactly the seven contract classes, no more and no fewer — set equality in the EMITTING direction.
   */
  it('PLANTED DEFECT: and the two items emit exactly those seven, no more and no fewer', () => {
    const emitted = new Set<string>();
    for (const entry of [UPLOAD, REFERENCE]) {
      const view = render(
        <ul>
          <AttachmentListItem entry={entry} />
        </ul>,
      );
      for (const node of view.container.querySelectorAll('*')) {
        for (const name of node.className.split(/\s+/)) {
          if (name.startsWith('attachment-item')) emitted.add(name);
        }
      }
      view.unmount();
    }
    // Set equality, not containment: a class the contract names and the code
    // stopped emitting fails here, and so does one the code emits that the
    // contract never named.
    expect([...emitted].sort()).toEqual([...BEM_CONTRACT].sort());
  });
});
