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
  const form = new FormData();
  form.append('ticketId', ticketId); // field parts must precede the file part
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
