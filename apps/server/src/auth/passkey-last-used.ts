import type { Queryable } from '../db/queryable.js';

/**
 * Devices plan Task 5 (cases 6.325, 6.326): stamp `passkey."lastUsedAt"` after a passkey SIGN-IN. The plugin's own schema does
 * not know the column (FD5), so this runs as a better-auth `hooks.after` on `/passkey/verify-authentication`.
 *
 * It stamps only when better-auth created a session for the request (`context.newSession`) - a failed verification leaves
 * none, so nothing is stamped - and only the passkey whose credential id was presented AND that belongs to that session's user.
 * The value is an observation for the list ("Last used ..."), never an input to any authorisation.
 */
export function passkeyLastUsedHook(pool: Queryable) {
  return async (ctx: {
    path: string;
    body?: unknown;
    context: { newSession?: { user: { id: string } } | null };
  }): Promise<void> => {
    if (ctx.path !== '/passkey/verify-authentication') return;
    const userId = ctx.context.newSession?.user.id;
    const credentialId = (ctx.body as { response?: { id?: unknown } } | undefined)?.response?.id;
    if (userId === undefined || typeof credentialId !== 'string') return;
    await pool.query(`UPDATE passkey SET "lastUsedAt" = now() WHERE "credentialID" = $1 AND "userId" = $2`, [credentialId, userId]);
  };
}
