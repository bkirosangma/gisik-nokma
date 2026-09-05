import type { Queryable } from '../db/queryable.js';

/**
 * People are never invented (spec §1 invariant 4, applied to humans). A
 * seed actor must be a real signed-in user; identity's key is the email
 * better-auth stores. Table name "user" is better-auth's default — if
 * Plan 4 configured a different modelName, change it here only.
 */
export async function findUserIdByEmail(db: Queryable, email: string): Promise<string | null> {
  const result = await db.query('SELECT id FROM "user" WHERE lower(email) = lower($1) LIMIT 1', [email]);
  const rows = (result as { rows: Array<{ id: string }> }).rows;
  return rows.length > 0 ? rows[0]!.id : null;
}
