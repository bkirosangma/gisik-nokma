import type { DriveReference } from '@gisik-nokma/domain';

/**
 * The two kinds of attachment, as a list renders them. Plan 6 re-declares
 * this union in `packages/app-core/src/views/attachment-list.tsx` so app-core
 * never depends on this package; structural typing joins them, and the two
 * declarations are ONE contract — edit both or neither.
 *
 * THE TWO SPELLINGS ARE NOT A DIVERGENCE. Plan 6 inlines `DriveReference`'s
 * six members; this file intersects the domain type. The app-core declaration
 * carries the refutation in its own doc comment: a conditional-type probe run
 * in BOTH directions against `tsconfig.base.json`, with a control proving that
 * dropping a REQUIRED member breaks it and a second recording that dropping
 * the OPTIONAL `iconLink` does not. Its verdict, verbatim: "step 12 may
 * collapse the two onto the domain type, but it has no difference to
 * reconcile." Collapsing app-core's spelling onto `DriveReference` is an
 * optional tidy-up and was DECLINED here — this task touches
 * `packages/editor` only, and the collapse would edit a file this task has no
 * test coverage over.
 *
 * THREE SITES SAID THIS TWIN DID NOT EXIST, and each was true until this
 * declaration was created. **Two are now closed; one remains.**
 *
 *   - `packages/app-core/src/views/attachment-list.tsx` — CLOSED. Its docblock
 *     now names this file as the twin, and re-states the still-true
 *     `EditorSlotUpload` sentence so the correction is not over-applied.
 *   - `packages/app-core/test/views/attachment-list.test.tsx` — CLOSED, with
 *     its assertion deliberately left comparing against the DOMAIN shape
 *     rather than importing this package: app-core depending on
 *     `packages/editor` is the thing the twin arrangement exists to avoid.
 *   - `Features.md:44` — **STILL OPEN**: "**it declares none today**".
 *     **Owner: Task 16**, which is separately owed a description of this
 *     component and is the task that touches the catalogue.
 *
 * `packages/app-core/src/views/editor-slot.tsx:17` carries the same shape of
 * sentence about a DIFFERENT type, `EditorSlotUpload`, and it is STILL TRUE:
 * swept at the closing commit, `packages/editor` contains no `type`,
 * `interface` or `const` of that name — only prose mentions, this one included.
 * Naming the survivor is half the point: a reader who sees the two corrections
 * above and writes off every sentence of that shape would break a claim that
 * holds.
 *
 * The two app-core sites were closed by the step owner rather than by this
 * task, which is scoped to `packages/editor` and correctly refused to reach
 * into another package. The refusal is why they were found — an annotation
 * naming its own blind spot is what made the blind spot actionable. But an
 * annotation on this side cannot reach a reader who arrives cold at app-core
 * and edits app-core alone, so recording it was never going to be sufficient.
 */
export type AttachmentListEntry =
  | { kind: 'upload'; attachmentId: string; filename: string; mime: string; size: number; sha256: string | null }
  | ({ kind: 'drive-reference'; attachmentId: string } & DriveReference);

export type DriveLinkCheck = 'not-checked' | 'unreachable';

/**
 * There is no "reachable" answer here on purpose. The board does not hold
 * the file, so it cannot say the file is fine — and a link that failed a
 * moment ago may work now, so it cannot say the file is gone either.
 * Both states resolve to the only true word: unknown.
 *
 * The two states must not collapse into one sentence, and not because a
 * reader needs the difference to act on it — neither sentence licenses any
 * action. They differ because one of them records that a check was made and
 * did not answer, and erasing that would be a second small lie on top of the
 * one this function exists to prevent.
 */
export function describeDriveReachability(check: DriveLinkCheck): string {
  return check === 'unreachable'
    ? 'Contents unknown — the link did not answer when it was last opened from here.'
    : 'Contents unknown — the board holds a link to this file, not the file.';
}

/**
 * The captured day, in UTC.
 *
 * `Date.prototype.toISOString` is defined by ECMA-262 to format the internal
 * time value in UTC unconditionally — it reads no local zone at all — so this
 * renderer is fixed under every `TZ`. That is asserted, with an in-file
 * positive control proving the zone reassignment actually reaches this
 * worker's `Date` getters, in `test/attachment-list-item.test.tsx`.
 *
 * MEASURED DIVERGENCE, RECORDED NOT FIXED. `packages/app-core`'s sibling
 * renderer (`src/views/attachment-list.tsx`) dates the same field through
 * `formatDate`, which renders the IST day — so the same reference at
 * `2026-08-20T20:00:00.000Z` reads "2026-08-20" here and "21 Aug 2026" there.
 * app-core's own comment argues against exactly the ISO slice this plan step
 * prescribes. This package cannot reuse `formatIstInstant`: it lives in
 * app-core, and the twin-declaration architecture exists precisely so
 * `packages/editor` never depends on app-core. Owner: whoever reconciles the
 * twin declarations (Plan 6 Open question 13) — not this task, which would
 * otherwise be changing user-visible copy in a package it does not own.
 */
function formatCapturedAt(capturedAt: string): string {
  const at = new Date(capturedAt);
  return Number.isNaN(at.getTime()) ? capturedAt : at.toISOString().slice(0, 10);
}

export function UploadedAttachmentItem(props: {
  entry: Extract<AttachmentListEntry, { kind: 'upload' }>;
  resolveAttachmentUrl?: (attachmentId: string) => string;
}): React.JSX.Element {
  const href = (props.resolveAttachmentUrl ?? ((id: string) => `/v1/attachments/${id}`))(props.entry.attachmentId);
  return (
    <li className="attachment-item attachment-item--upload" data-attachment-kind="upload">
      <a className="attachment-item__name" href={href}>
        {props.entry.filename}
      </a>
      <span className="attachment-item__kind">{props.entry.mime}</span>
    </li>
  );
}

/**
 * A reference says three things and claims none of them are still true: the
 * name Drive gave the file, the type Drive gave it, and the day we looked.
 * The link leaves for Drive — it is never a download from this board, because
 * this board has no bytes to serve.
 */
export function DriveReferenceItem(props: {
  entry: Extract<AttachmentListEntry, { kind: 'drive-reference' }>;
  linkCheck?: DriveLinkCheck;
}): React.JSX.Element {
  const { entry } = props;
  return (
    <li className="attachment-item attachment-item--drive-reference" data-attachment-kind="drive-reference">
      <span className="attachment-item__kind">Google Drive reference</span>
      <a className="attachment-item__name" href={entry.webViewLink} target="_blank" rel="noreferrer noopener">
        {entry.name}
      </a>
      <span className="attachment-item__last-seen">
        last seen as “{entry.name}” ({entry.mimeType}) · captured {formatCapturedAt(entry.capturedAt)}
      </span>
      <span className="attachment-item__reachability">{describeDriveReachability(props.linkCheck ?? 'not-checked')}</span>
    </li>
  );
}

/**
 * The dispatch, and the reason it is a branch rather than one shared body:
 * a single rendering path parameterised by kind is exactly how a reference
 * comes to be rendered as a held file. The two kinds get two components.
 */
export function AttachmentListItem(props: {
  entry: AttachmentListEntry;
  linkCheck?: DriveLinkCheck;
  resolveAttachmentUrl?: (attachmentId: string) => string;
}): React.JSX.Element {
  if (props.entry.kind === 'drive-reference') {
    const forwarded = props.linkCheck === undefined ? {} : { linkCheck: props.linkCheck };
    return <DriveReferenceItem entry={props.entry} {...forwarded} />;
  }
  const forwarded = props.resolveAttachmentUrl === undefined ? {} : { resolveAttachmentUrl: props.resolveAttachmentUrl };
  return <UploadedAttachmentItem entry={props.entry} {...forwarded} />;
}
