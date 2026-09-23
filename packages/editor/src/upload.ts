/**
 * Exactly the upload endpoint's 201 body (`apps/server/src/routes/attachments.ts`,
 * Task 9/9a) — the server-sniffed truth, never the client's claim about the
 * file it sent.
 */
export type UploadResult = {
  attachmentId: string;
  url: string;
  mime: string;
  filename: string;
  size: number;
  /** The server's SHA-256 of the stored bytes (Task 9a) — echoed, never recomputed here. */
  sha256: string;
};

export class UploadRefusedError extends Error {
  constructor(
    public readonly status: number,
    reason: string,
  ) {
    super(reason);
    this.name = 'UploadRefusedError';
  }
}

/**
 * POST a file to `/v1/attachments`. Clients MUST build their subsequent
 * `attachment.added` event from this answer — the server's sniffed mime and
 * measured size — never from the local `File` object, whose claims are
 * exactly what the server refused to trust.
 *
 * Field parts precede the file part (`ticketId` appended first): the
 * published contract the route's docblock states, though the route itself
 * cannot enforce the order over a request small enough to arrive whole.
 */
export async function uploadAttachmentHttp(
  file: File,
  ticketId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadResult> {
  return postAttachment(file, 'ticketId', ticketId, fetchImpl);
}

/**
 * The same POST, against a NOTE instead of a ticket (`notes` series Plan 5,
 * spec §4.4).
 *
 * ## Why this is a second function rather than a second argument
 *
 * The route accepts **exactly one** of `ticketId` and `noteId` and answers 400
 * for both or neither (`apps/server/src/routes/attachments.ts:375-388`). A
 * parameter that could carry either would make "both" expressible, and the only
 * thing standing between that and a refused upload would be every caller
 * remembering a rule. Here "both" is not a program this function can build:
 * `postAttachment` appends ONE owner field, chosen by the discriminant. The cost
 * is a second name a host must pick; the thing bought is that the wrong pick is
 * a compile error rather than a 400 at the moment a person pastes an image.
 *
 * ## The authorisation is the WORKSPACE's, and this function does not choose it
 *
 * The route decides with `getNoteStateFromDb` + `canReadNoteById`: the uploader
 * must be the note's author, an admin-reader, or the workspace owner (§4.4).
 * Nothing here can check that, and nothing here pretends to — a refusal arrives
 * as `UploadRefusedError` carrying the server's own reason, exactly as it does
 * for a ticket.
 */
export async function uploadNoteAttachmentHttp(
  file: File,
  noteId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadResult> {
  return postAttachment(file, 'noteId', noteId, fetchImpl);
}

/**
 * The one request both doors send. `ownerField` is the discriminant, and it is
 * the only thing that differs — so the credentials, the ordering rule and the
 * refusal shape cannot drift between the two spellings.
 */
async function postAttachment(
  file: File,
  ownerField: 'ticketId' | 'noteId',
  ownerId: string,
  fetchImpl: typeof fetch,
): Promise<UploadResult> {
  const form = new FormData();
  form.append(ownerField, ownerId); // field parts must precede the file part
  form.append('file', file, file.name);
  const response = await fetchImpl('/v1/attachments', {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { reason?: string } | null;
    throw new UploadRefusedError(response.status, body?.reason ?? `upload refused (${response.status})`);
  }
  return (await response.json()) as UploadResult;
}
