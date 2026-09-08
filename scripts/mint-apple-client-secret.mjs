#!/usr/bin/env node
// Mint APPLE_CLIENT_SECRET — the client-secret JWT Sign in with Apple requires.
//
// WHY THIS SCRIPT EXISTS AT ALL. Apple's `client_secret` is not a string you are
// issued; it is a token you sign, and it EXPIRES. Confirmed from the INSTALLED
// `@better-auth/core@1.7.2` rather than from documentation, because libraries in
// this space differ on it: `src/social-providers/apple.ts` contains no signing —
// it imports `decodeJwt`/`importJWK` from jose solely to VERIFY Apple's
// id_token — and the shared token-endpoint helper does
// `body.set("client_secret", options.clientSecret)`, putting the value on the
// wire verbatim. So the app reads a finished JWT and something has to make one.
//
// TWO THINGS HERE WOULD BE ACCEPTED BY EVERY LOCAL CHECK AND REFUSED BY APPLE,
// which is why this script self-tests rather than trusting its own output:
//
//   1. THE SIGNATURE ENCODING. Node's `crypto.sign` emits ECDSA signatures in
//      DER by default. JOSE requires the raw r||s pair (64 bytes for P-256).
//      A DER signature is a perfectly valid signature of the right bytes by the
//      right key — it simply is not the encoding JWS defines, and nothing on
//      this machine would object. `dsaEncoding: 'ieee-p1363'` is the whole fix
//      and it is one word.
//   2. THE LIFETIME. Apple refuses a client secret whose `exp` is more than six
//      months out, and a token minted with a one-year expiry fails at the token
//      endpoint with an error that says nothing about lifetime.
//
// Usage:  node scripts/mint-apple-client-secret.mjs [--days N]
//         node scripts/mint-apple-client-secret.mjs --self-test
//
// Reads APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID and APPLE_PRIVATE_KEY (the
// .p8 contents, newlines and all — Apple lets you download it exactly once).
// Prints the JWT on stdout and nothing else, so it can be piped into a secret
// store. Every diagnostic goes to stderr.

import { createPrivateKey, sign, verify } from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';

/** Apple's ceiling is 6 months. 180 days sits inside it with room to spare. */
const MAX_DAYS = 180;

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

/**
 * The mint, as a pure function of its inputs, so the self-test drives exactly
 * the code the real run drives. A self-test that exercised a copy of this logic
 * would certify the copy.
 */
export function mintAppleClientSecret({ teamId, keyId, clientId, privateKeyPem, nowSeconds, days }) {
  if (days > MAX_DAYS) {
    throw new Error(
      `Apple refuses a client secret valid for more than ${MAX_DAYS} days; asked for ${days}. ` +
        'The refusal happens at the token endpoint and does not mention the lifetime.',
    );
  }
  const header = { alg: 'ES256', kid: keyId };
  const payload = {
    iss: teamId,
    iat: nowSeconds,
    exp: nowSeconds + days * 24 * 60 * 60,
    aud: 'https://appleid.apple.com',
    // The SERVICES ID for the web flow — not the App ID, and not the Team ID.
    sub: clientId,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = createPrivateKey(privateKeyPem);
  // `ieee-p1363`, not the default DER. See the note at the top of this file:
  // both encodings are valid signatures and only one is a valid JWS.
  const signature = sign('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return { token: `${signingInput}.${signature.toString('base64url')}`, header, payload, signature };
}

/**
 * Proves the instrument against its own output before anything is shipped: the
 * signature verifies under the matching public key AND is 64 bytes, which is
 * what distinguishes a JOSE signature from a DER one. Asserting only that it
 * verifies would pass for DER, because `verify` accepts whichever encoding it is
 * told to expect — so the length is the assertion that catches defect (1).
 */
function selfTest() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const now = 1_757_000_000;
  const { token, signature, payload } = mintAppleClientSecret({
    teamId: 'TEAMID1234',
    keyId: 'KEYID56789',
    clientId: 'in.example.app.web',
    privateKeyPem: pem,
    nowSeconds: now,
    days: 180,
  });

  const problems = [];
  if (signature.length !== 64) {
    problems.push(`signature is ${signature.length} bytes, not 64 — that is DER, not JOSE r||s`);
  }
  const [h, p] = token.split('.');
  const ok = verify(
    'sha256',
    Buffer.from(`${h}.${p}`),
    // `publicKey` is already a KeyObject; `createPublicKey` on one throws
    // ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE. Caught by running the self-test,
    // which is the entire argument for having one.
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(token.split('.')[2], 'base64url'),
  );
  if (!ok) problems.push('the signature does not verify under its own public key');
  if (payload.aud !== 'https://appleid.apple.com') problems.push(`aud is ${payload.aud}`);
  if (payload.exp - payload.iat !== 180 * 86400) problems.push('lifetime is not 180 days');

  // The negative control: a lifetime past Apple's ceiling must be REFUSED here,
  // not discovered at the token endpoint. A self-test with only positive cases
  // cannot tell a working guard from an absent one.
  let refused = false;
  try {
    mintAppleClientSecret({
      teamId: 'T',
      keyId: 'K',
      clientId: 'C',
      privateKeyPem: pem,
      nowSeconds: now,
      days: 365,
    });
  } catch {
    refused = true;
  }
  if (!refused) problems.push('a 365-day lifetime was NOT refused; the ceiling guard is inert');

  if (problems.length > 0) {
    console.error('mint-apple-client-secret self-test FAILED:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.error('mint-apple-client-secret self-test ok (64-byte JOSE signature, verifies, ceiling enforced)');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) {
    selfTest();
    return;
  }

  const daysIndex = argv.indexOf('--days');
  const days = daysIndex === -1 ? MAX_DAYS : Number(argv[daysIndex + 1]);
  if (!Number.isInteger(days) || days < 1) {
    console.error(`--days must be a positive integer; got ${String(argv[daysIndex + 1])}`);
    process.exit(1);
  }

  const required = ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_CLIENT_ID', 'APPLE_PRIVATE_KEY'];
  const missing = required.filter((name) => (process.env[name] ?? '').trim() === '');
  if (missing.length > 0) {
    console.error(`mint-apple-client-secret: missing ${missing.join(', ')}.`);
    console.error('  APPLE_CLIENT_ID is the SERVICES ID (the web client_id), not the App ID.');
    console.error('  APPLE_PRIVATE_KEY is the .p8 file contents, newlines included.');
    process.exit(1);
  }

  // Always self-test before minting. The cost is milliseconds; the failure it
  // catches is a credential that looks right everywhere except at Apple.
  selfTest();

  const { token, payload } = mintAppleClientSecret({
    teamId: process.env['APPLE_TEAM_ID'].trim(),
    keyId: process.env['APPLE_KEY_ID'].trim(),
    clientId: process.env['APPLE_CLIENT_ID'].trim(),
    // A .p8 pasted through a shell or a control panel often arrives with
    // literal backslash-n instead of newlines, and `createPrivateKey` then fails
    // with an unhelpful decoder error rather than saying so.
    privateKeyPem: process.env['APPLE_PRIVATE_KEY'].replace(/\\n/g, '\n'),
    nowSeconds: Math.floor(Date.now() / 1000),
    days,
  });

  console.error(`minted: expires ${new Date(payload.exp * 1000).toISOString()} (${days} days)`);
  console.error('set it as APPLE_CLIENT_SECRET. It EXPIRES — see docs/runbook.md.');
  process.stdout.write(`${token}\n`);
}

main();
