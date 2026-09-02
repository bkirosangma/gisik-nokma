import { type DriveReference, newUlid } from '@gisik-nokma/domain';
import type { UploadResult } from '../upload.js';

export type UploadAttachmentAddedEvent = {
  type: 'attachment.added';
  payload: { kind: 'upload'; attachmentId: string; filename: string; mime: string; size: number; sha256: string };
};

export type DriveReferenceAddedEvent = {
  type: 'attachment.added';
  payload: { kind: 'drive-reference'; attachmentId: string } & DriveReference;
};

/**
 * The claim that puts an uploaded file on a ticket. Every value comes from
 * the upload's 201 answer — the sniffed mime, the measured size, the
 * server's hash — because the local File's claims are exactly what the
 * server declined to trust. Composed here, in one place, so no shell
 * hand-builds this payload.
 */
export function composeUploadAttachmentAdded(result: UploadResult): UploadAttachmentAddedEvent {
  return {
    type: 'attachment.added',
    payload: {
      kind: 'upload',
      attachmentId: result.attachmentId,
      filename: result.filename,
      mime: result.mime,
      size: result.size,
      sha256: result.sha256,
    },
  };
}

/**
 * The claim that puts a Drive file on a ticket. There is no upload call and
 * no server row: a reference has no bytes, so the event IS the record
 * (spec §2 — "events carry references"). The client submits it through
 * POST /v1/events like any other claim.
 */
export function composeDriveReferenceAdded(
  reference: DriveReference,
  mintId: () => string = newUlid,
): DriveReferenceAddedEvent {
  return { type: 'attachment.added', payload: { kind: 'drive-reference', attachmentId: mintId(), ...reference } };
}
