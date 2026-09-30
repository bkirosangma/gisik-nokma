import { createHash, generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Cases 6.325 and 6.326 - a passkey sign-in stamps `passkey."lastUsedAt"`, through the REAL
 * `/api/auth/passkey/verify-authentication` route. The test plays the authenticator: a P-256 key pair whose public half is
 * stored as the COSE key the plugin expects, a challenge fetched from `generate-authenticate-options`, and an assertion
 * (authenticatorData + clientDataJSON + DER signature) signed over it. Nothing is faked on the server side, so a hook that is
 * not wired into `createAuth` fails here - an isolated call of the hook function could not show that.
 */
const SECRET = 'passkey-last-used-secret-passkey-last-used';
const WEB = 'http://localhost:3001';
const RP_ID = 'localhost';
let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let aliceId: string;

const b64url = (b: Buffer) => b.toString('base64url');

type Authenticator = { credentialId: string; privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']; counter: number };

/** Store a passkey for `userId` whose private key the test holds. */
async function enrol(id: string, userId: string): Promise<Authenticator> {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const x = Buffer.from(jwk.x!, 'base64url');
  const y = Buffer.from(jwk.y!, 'base64url');
  // COSE_Key {1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y}
  const cose = Buffer.concat([Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]), x, Buffer.from([0x22, 0x58, 0x20]), y]);
  const credentialId = b64url(randomBytes(16));
  await db.pool.query(
    `INSERT INTO passkey (id, name, "publicKey", "userId", "credentialID", counter, "deviceType", "backedUp", transports, "createdAt", aaguid)
     VALUES ($1, $1, $2, $3, $4, 0, 'singleDevice', false, NULL, now(), NULL)`,
    [id, cose.toString('base64'), userId, credentialId],
  );
  return { credentialId, privateKey, counter: 0 };
}

/** One sign-in ceremony. `tamper` corrupts the signature so the server must refuse. */
async function authenticate(a: Authenticator, tamper = false) {
  const options = await app.inject({ method: 'GET', url: '/api/auth/passkey/generate-authenticate-options', headers: { origin: WEB } });
  if (options.statusCode !== 200) throw new Error(`options: ${options.statusCode} ${options.body}`);
  const challenge = (options.json() as { challenge: string }).challenge;
  const raw = options.headers['set-cookie'];
  const challengeCookie = (Array.isArray(raw) ? (raw as string[]) : [String(raw)]).map((c) => c.split(';')[0]!).join('; ');
  a.counter += 1;
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(a.counter);
  const authData = Buffer.concat([createHash('sha256').update(RP_ID).digest(), Buffer.from([0x05]), counter]);
  const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: WEB, crossOrigin: false }));
  const signed = Buffer.concat([authData, createHash('sha256').update(clientData).digest()]);
  const signature = sign('sha256', signed, a.privateKey);
  if (tamper) signature[signature.length - 1] = (signature[signature.length - 1]! ^ 0xff) & 0xff;
  return app.inject({
    method: 'POST',
    url: '/api/auth/passkey/verify-authentication',
    headers: { origin: WEB, cookie: challengeCookie, 'content-type': 'application/json' },
    payload: {
      response: {
        id: a.credentialId,
        rawId: a.credentialId,
        type: 'public-key',
        response: { authenticatorData: b64url(authData), clientDataJSON: b64url(clientData), signature: b64url(signature) },
        clientExtensionResults: {},
      },
    },
  });
}
const stamps = async (): Promise<Record<string, Date | null>> =>
  Object.fromEntries((await db.pool.query(`SELECT id, "lastUsedAt" FROM passkey`)).rows.map((r) => [r.id, r.lastUsedAt]));

beforeAll(async () => {
  db = await createTestDatabase();
  otp = new LogOtpSender(() => {});
  const auth = createAuth({ pool: db.pool, otpSender: otp, magicLinkSender: new LogMagicLinkSender(() => {}), baseUrl: 'http://localhost:3000', secret: SECRET, webOrigin: WEB });
  const ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
  app = buildApp({ db: db.pool, pool: db.pool, ingest, auth, serverAppend: (e) => ingest.ingestBatch(e), webOrigin: WEB, store: createObjectStoreFromEnv({}) });
  await app.ready();
  await app.inject({ method: 'POST', url: '/api/auth/phone-number/send-otp', payload: { phoneNumber: '+919100000061' } });
  const res = await app.inject({ method: 'POST', url: '/api/auth/phone-number/verify', payload: { phoneNumber: '+919100000061', code: otp.sent[0]?.code } });
  aliceId = (res.json() as { user: { id: string } }).user.id;
}, 60_000);
afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('passkey last-used stamp', () => {
  it('6.326 a FAILED verification (a corrupted signature) stamps nothing and signs nobody in; control: the untampered ceremony (6.325) signs in', async () => {
    const one = await enrol('pk-one', aliceId);
    const tampered = await authenticate(one, true);
    expect(tampered.statusCode).toBeGreaterThanOrEqual(400);
    expect(Object.values(await stamps()).every((v) => v === null)).toBe(true);
    const ok = await authenticate(one);
    expect(ok.statusCode).toBe(200);
  });

  it('6.325 a successful passkey sign-in stamps THAT passkey\'s lastUsedAt and only that one; control: the person\'s other passkey stays NULL', async () => {
    const two = await enrol('pk-two', aliceId);
    // pk-one was stamped by the control of 6.326; reset so this case owns its own before/after.
    await db.pool.query(`UPDATE passkey SET "lastUsedAt" = NULL`);
    const before = Date.now();
    const res = await authenticate(two);
    expect(res.statusCode).toBe(200);
    const s = await stamps();
    expect(s['pk-one']).toBeNull();
    expect(s['pk-two']).not.toBeNull();
    expect(Math.abs(s['pk-two']!.getTime() - before)).toBeLessThan(10_000);
  });
});
