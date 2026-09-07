import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearCachedToken, readCachedToken, writeCachedToken } from '../src/token-cache.js';

/**
 * Plan: MCP server, Task 6. Cases 14.40–14.43.
 */
function scratch(): string {
  return join(mkdtempSync(join(tmpdir(), 'gisik-mcp-')), 'nested', 'mcp-token');
}

describe('the token cache', () => {
  it('14.40 answers null when nothing is cached', async () => {
    expect(await readCachedToken(scratch())).toBeNull();
  });

  it('14.41 round-trips the token and the user id', async () => {
    const path = scratch();
    await writeCachedToken(path, { token: 'tok', userId: '01J0USER0000000000000000AA' });
    expect(await readCachedToken(path)).toEqual({ token: 'tok', userId: '01J0USER0000000000000000AA' });
  });

  it('14.42 writes the file 0600 and the directory 0700', async () => {
    const path = scratch();
    await writeCachedToken(path, { token: 'tok', userId: '01J0USER0000000000000000AA' });
    // A credential readable by every process on a shared machine is not
    // cached, it is published. The mask is asserted, not assumed.
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(path, '..')).mode & 0o777).toBe(0o700);
  });

  it('14.43 answers null for a corrupt cache rather than throwing', async () => {
    const path = scratch();
    await writeCachedToken(path, { token: 'tok', userId: 'u' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path, 'not json at all');
    // A corrupt cache must degrade to "not logged in", which the device flow
    // can recover from. Throwing here would make a truncated file a permanent
    // failure that only a human deleting a dotfile could clear.
    expect(await readCachedToken(path)).toBeNull();
  });
});
