/**
 * A session that ended, as a VIEW can see it (E5-25, round-2 ruling).
 *
 * ## Why this is a class and not `error instanceof HttpError && error.status === 401`
 *
 * That predicate is the obvious one — `HttpError`'s own docblock
 * (`online/http.ts`) names *"a 401 is a session that ended"* as one of the three
 * things a caller acts on differently — and it is what the ruling's remedy
 * spells out. **A view cannot write it.** `test/no-http-in-views.test.ts`
 * (case 3.35, coordination amendment 10) scans every `.ts`/`.tsx` outside
 * `src/online/` and fails on an online import, so a view that imported
 * `HttpError` would not compile as this package's rules define compiling.
 *
 * So the classification happens where the status exists — `online-data-source.ts`
 * has the `HttpError` in hand — and it crosses the seam as this type, which every
 * view may import because it names no transport.
 *
 * ## What it is NOT for
 *
 * Reads. A read's 401 is already classified one layer up by the shell
 * (`apps/web/src/expired-session.tsx`, which reads it back out of a
 * `LiveQueryResult`'s message because `useLiveQuery` stringifies the cause).
 * This type exists for the WRITE catches, which had no classifier at all and
 * painted every 401 as *"We could not reach the server"* — nine sites, none of
 * which sent the person to sign in.
 */
/**
 * The sentence a 401 paints wherever the person can see it.
 *
 * It lives here rather than in `apps/web` because the views that render it on a
 * WRITE are here, and one sentence with two definitions is a sentence that
 * drifts. `apps/web`'s `EXPIRED_SESSION_COPY` (the read arms' own, mounted by
 * five of them) re-exports this constant rather than repeating the string.
 *
 * **It promises a redirect, so whoever renders it must perform one.** On the
 * write path that is the shell's data-source guard (`apps/web/src/providers.tsx`
 * → `withSignInOnExpiredWrite`); on the read path it is
 * `useSignInOnExpiredSession`.
 */
export const SESSION_EXPIRED_COPY = 'Your session has ended. Taking you to sign in…';

/** The write-path classifier — see this module's own docblock for why it exists. */
export class SessionExpiredError extends Error {
  /** The path whose 401 ended the session, for a log line rather than a screen. */
  readonly path: string;

  constructor(path: string, options?: { cause?: unknown }) {
    super(`the session ended — ${path} answered 401`);
    this.name = 'SessionExpiredError';
    this.path = path;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/**
 * What a WRITE's catch should paint: the session's own sentence when the cause
 * is a `SessionExpiredError`, and the caller's transport sentence otherwise.
 *
 * It takes the transport sentence as a function rather than a string because the
 * nine call sites each spell theirs differently — *"for this move"*, *"for this
 * close"*, *"for this change"*, *"for this save"*, *"to restore it"*, *"for this
 * start"* — and folding them into one generic sentence here would delete the
 * only part of those sentences that says which action failed.
 *
 * The `cause instanceof SessionExpiredError` branch is the ONE place the
 * write-path classification is made, so a tenth write site cannot invent an
 * eleventh rule about 401s.
 */
export function writeFailureCopy(
  cause: unknown,
  transportCopy: (message: string) => string,
): string {
  if (cause instanceof SessionExpiredError) return SESSION_EXPIRED_COPY;
  return transportCopy(cause instanceof Error ? cause.message : String(cause));
}

/**
 * The refusal register a write failure's copy belongs in.
 *
 * A session that ended is not a transport failure and not the server's verdict
 * on the write either, so it gets its own class rather than borrowing
 * `--transport`'s — the same reasoning `.gn-refusal--editor` already records in
 * `ui.css` (*"It is also not a transport failure — nothing was sent — which is
 * why it does not share `--transport`'s rule despite the identical tone"*).
 *
 * **Identity against the one constant, not a prefix or a substring search.** The
 * value is produced in exactly one place (`writeFailureCopy`, above), so this
 * cannot fire on a transport sentence that happens to contain the words; the
 * worst case if the constant were reworded is the amber register on a session
 * sentence, which is a tint and not a claim.
 */
export function writeFailureRefusalClass(copy: string): string {
  return copy === SESSION_EXPIRED_COPY
    ? 'gn-refusal gn-refusal--session'
    : 'gn-refusal gn-refusal--transport';
}
