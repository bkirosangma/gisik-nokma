import { ULID_REGEX, parseEvent } from '@gisik-nokma/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { submittedWorkspaceCreated } from '../helpers/events.js';

/** Long enough that better-auth does not warn, and obviously not a credential. */
const TEST_SECRET = 'test-secret-not-used-anywhere-real';

const PHONE = '+919000000001';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/**
 * Signs a user up the way the product will: OTP out through our own sender, code
 * back in. Returns the id better-auth minted, read from Postgres rather than from
 * the response, so what is asserted is what was actually stored.
 */
async function signUpByPhoneAndReadStoredId(): Promise<{ userId: string; sessionId: string | undefined }> {
  const otpSender = new LogOtpSender(() => {});
  const auth = createAuth({
    pool: db.pool,
    otpSender,
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: TEST_SECRET,
    // The browser's origin, so better-auth trusts the product's own client.
    webOrigin: 'http://localhost:3001',
  });

  await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: PHONE } });
  const code = otpSender.sent[0]?.code;
  expect(code, 'the dev sender must have captured an OTP').toBeDefined();

  await auth.api.verifyPhoneNumber({ body: { phoneNumber: PHONE, code: code ?? '' } });

  const users = await db.pool.query<{ id: string }>('SELECT id FROM "user"');
  expect(users.rows).toHaveLength(1);
  const sessions = await db.pool.query<{ id: string }>('SELECT id FROM "session"');
  return { userId: users.rows[0]?.id ?? '', sessionId: sessions.rows[0]?.id };
}

describe('better-auth mints ULID ids', () => {
  /**
   * The check this whole configuration exists for, stated as the consequence
   * rather than as a format.
   *
   * A user's id is not only better-auth's business: it becomes `actorId` on
   * every event that user authors, and `packages/domain/src/envelope.ts`
   * declares `actorId: ulidString`. better-auth's default generator is a
   * 32-character mixed-case random string, which that schema refuses. So an
   * unconfigured better-auth produces users who cannot author anything, and the
   * door reports `malformed-envelope` — a refusal naming the envelope for a
   * fault in the identity layer, which is the kind of bug that gets debugged in
   * the wrong file.
   *
   * This runs the real minted id through the real door, not a regex twin of it.
   */
  it('a user better-auth creates can author an event — the ledger door accepts the id it minted', async () => {
    const { userId } = await signUpByPhoneAndReadStoredId();

    const submission = submittedWorkspaceCreated({ actorId: userId });
    const parsed = parseEvent(submission);

    expect(parsed.ok, parsed.ok ? '' : `door refused: ${parsed.code} — ${parsed.message}`).toBe(
      true,
    );
  });

  it('the stored user id is a ULID: 26 Crockford base32 characters', async () => {
    const users = await db.pool.query<{ id: string }>('SELECT id FROM "user"');
    const userId = users.rows[0]?.id ?? '';
    expect(userId).toMatch(ULID_REGEX);
    expect(userId).toHaveLength(26);
  });

  /**
   * The generator is registered for every model, not only `user`. Session,
   * account, verification and passkey ids never enter the ledger and carry no
   * ULID requirement — this asserts the decision that was actually made, so that
   * narrowing it later is a visible change rather than a silent one.
   */
  it('the rule is global: even a session id, which never enters the ledger, is a ULID', async () => {
    const sessions = await db.pool.query<{ id: string }>('SELECT id FROM "session"');
    expect(sessions.rows.length).toBeGreaterThan(0);
    expect(sessions.rows[0]?.id).toMatch(ULID_REGEX);
  });
});
