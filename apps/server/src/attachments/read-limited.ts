import type { Readable } from 'node:stream';

export type LimitedRead = { ok: true; bytes: Buffer } | { ok: false; reason: string };

/**
 * The ceiling in the units a person reads, and the reason it is not simply
 * `maxBytes / 1048576`.
 *
 * That division floors to `0` for any ceiling under a mebibyte, which the
 * shipped 25 MiB never is but every test ceiling is — and a refusal reading
 * "larger than the 0 MB limit" would have been shipped copy that only nobody
 * noticed because no assertion read the number. Below a mebibyte the sentence
 * switches units rather than lying in the big one.
 */
function describeLimit(maxBytes: number): string {
  const mebibytes = maxBytes / (1024 * 1024);
  return mebibytes >= 1
    ? `${Math.floor(mebibytes)} MB`
    : `${Math.floor(maxBytes / 1024)} KB`;
}

/**
 * Read a stream into memory, refusing the moment it crosses `maxBytes` —
 * DURING the stream, never after it.
 *
 * ## Why this exists rather than `@fastify/multipart`'s `limits.fileSize`
 *
 * The library will do this: busboy counts bytes as it parses and
 * `data.toBuffer()` throws a 413 at the ceiling. The plan text used exactly
 * that. It was not adopted, and the reason is falsifiability rather than
 * distrust.
 *
 * With `limits: { fileSize: maxBytes }` configured AND a threshold of
 * `maxBytes` here, busboy always trips first and the check in this function
 * can never fire. That is a check that cannot fail — the sixth disguise in
 * this repo's own note on the subject — and a planted defect aimed at it would
 * survive silently, condemning a guard that was fine. So there is exactly ONE
 * size decision in the upload path, it is the loop below, and a mutation that
 * moves the comparison after the loop reddens
 * `test/attachments/read-limited.test.ts` by name.
 *
 * The trade is that `413` is now this product's own answer rather than
 * `@fastify/multipart`'s propagated `statusCode`, which is what the plan's
 * Produces block promised. Same status, our own body. Recorded in the commit.
 *
 * ## "During the stream" is a measurable claim, and it is measured
 *
 * The bound is per-chunk, so at most one chunk beyond `maxBytes` is ever held
 * and the source is torn down at that instant. A 5 GiB body is refused having
 * been read in kilobytes. The test feeds an 8 MiB source through a 4 KiB limit
 * and asserts on how much the SOURCE was asked to produce — a limit that only
 * checked after the loop would drag all 8 MiB through memory and fail that
 * assertion loudly.
 *
 * What this is NOT: zero-copy. Bytes up to `maxBytes` are buffered, because
 * the two things that happen next — magic-byte sniffing and a `put` with a
 * known size — both need the content. The limit is what keeps that buffer
 * bounded by 25 MiB per in-flight upload instead of by the client's patience.
 */
export async function readAtMost(stream: Readable, maxBytes: number): Promise<LimitedRead> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      // Tear the source down now rather than letting the loop's own teardown
      // do it on the way out: the producer should stop producing at the
      // earliest instant we know we do not want the rest.
      stream.destroy();
      return { ok: false, reason: `This file is larger than the ${describeLimit(maxBytes)} limit.` };
    }
    chunks.push(buf);
  }
  return { ok: true, bytes: Buffer.concat(chunks) };
}
