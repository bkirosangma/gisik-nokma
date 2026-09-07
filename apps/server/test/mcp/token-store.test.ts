import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  approveDeviceCode,
  exchangeDeviceCode,
  hashCredential,
  mintDeviceCode,
  resolveMcpToken,
} from '../../src/mcp/token-store.js';

/**
 * Plan: MCP server, Task 2. Cases 14.10–14.16.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

const NOW = new Date('2026-09-07T10:00:00.000Z');
const LATER = new Date('2026-09-07T10:05:00.000Z');
const PAST_TTL = new Date('2026-09-07T10:11:00.000Z');

describe('the device-code grant', () => {
  it('14.10 stores the device code ONLY as a hash', async () => {
    const grant = await mintDeviceCode(db.pool, NOW);
    const { rows } = await db.pool.query<{ device_code_hash: string }>(
      'SELECT device_code_hash FROM mcp_device_codes WHERE user_code = $1',
      [grant.userCode],
    );
    expect(rows[0]?.device_code_hash).toBe(hashCredential(grant.deviceCode));
    // The planted defect this guards: storing the raw code. If the column ever
    // held the plaintext, this equality fails AND the next assertion catches it
    // from the other side.
    expect(rows[0]?.device_code_hash).not.toBe(grant.deviceCode);
  });

  it('14.11 answers pending before anyone approves', async () => {
    const grant = await mintDeviceCode(db.pool, NOW);
    expect(await exchangeDeviceCode(db.pool, grant.deviceCode, LATER)).toEqual({ status: 'pending' });
  });

  it('14.12 issues a token to the approving user, once', async () => {
    const grant = await mintDeviceCode(db.pool, NOW);
    expect(await approveDeviceCode(db.pool, grant.userCode, '01J0USER0000000000000000AA', LATER)).toBe('approved');

    const first = await exchangeDeviceCode(db.pool, grant.deviceCode, LATER);
    expect(first.status).toBe('issued');
    if (first.status !== 'issued') throw new Error('unreachable');
    expect(first.userId).toBe('01J0USER0000000000000000AA');

    // Single-use: the grant row is gone, so a replay of the same device code
    // gets `unknown` and NOT a second token. This is the invite_tokens
    // property — a read cannot make a credential single-use, the DELETE does.
    expect(await exchangeDeviceCode(db.pool, grant.deviceCode, LATER)).toEqual({ status: 'unknown' });
  });

  it('14.13 refuses an expired grant, and distinguishes it from an unknown one', async () => {
    const grant = await mintDeviceCode(db.pool, NOW);
    await approveDeviceCode(db.pool, grant.userCode, '01J0USER0000000000000000BB', LATER);
    expect(await exchangeDeviceCode(db.pool, grant.deviceCode, PAST_TTL)).toEqual({ status: 'expired' });
    expect(await exchangeDeviceCode(db.pool, 'never-minted', NOW)).toEqual({ status: 'unknown' });
  });

  it('14.14 refuses to approve an expired grant', async () => {
    const grant = await mintDeviceCode(db.pool, NOW);
    expect(await approveDeviceCode(db.pool, grant.userCode, '01J0USER0000000000000000CC', PAST_TTL)).toBe('expired');
  });
});

describe('the personal access token', () => {
  it('14.15 resolves to its user, and is stored only as a hash', async () => {
    const grant = await mintDeviceCode(db.pool, NOW);
    await approveDeviceCode(db.pool, grant.userCode, '01J0USER0000000000000000DD', LATER);
    const issued = await exchangeDeviceCode(db.pool, grant.deviceCode, LATER);
    if (issued.status !== 'issued') throw new Error('unreachable');

    expect(await resolveMcpToken(db.pool, issued.token, LATER)).toBe('01J0USER0000000000000000DD');

    const { rows } = await db.pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM mcp_tokens WHERE user_id = $1',
      ['01J0USER0000000000000000DD'],
    );
    expect(rows[0]?.token_hash).toBe(hashCredential(issued.token));
  });

  it('14.16 answers null for a forged token and for a revoked one, identically', async () => {
    expect(await resolveMcpToken(db.pool, 'forged', NOW)).toBeNull();

    const grant = await mintDeviceCode(db.pool, NOW);
    await approveDeviceCode(db.pool, grant.userCode, '01J0USER0000000000000000EE', LATER);
    const issued = await exchangeDeviceCode(db.pool, grant.deviceCode, LATER);
    if (issued.status !== 'issued') throw new Error('unreachable');
    await db.pool.query('DELETE FROM mcp_tokens WHERE token_hash = $1', [hashCredential(issued.token)]);
    expect(await resolveMcpToken(db.pool, issued.token, LATER)).toBeNull();
  });
});
