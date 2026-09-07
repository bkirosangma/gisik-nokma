import { describe, expect, it } from 'vitest';
import { loadMcpConfig, DEFAULT_POLL_INTERVAL_MS } from '../src/config.js';

/**
 * Plan: MCP server, Task 1. Cases 14.1–14.3.
 */
describe('loadMcpConfig', () => {
  it('14.1 requires GISIK_SERVER_URL and names it when absent', () => {
    expect(() => loadMcpConfig({}, '/home/x')).toThrow(/GISIK_SERVER_URL/);
  });

  it('14.2 defaults the token path under the home directory', () => {
    const config = loadMcpConfig({ GISIK_SERVER_URL: 'http://localhost:3000' }, '/home/x');
    expect(config.tokenPath).toBe('/home/x/.gisik-nokma/mcp-token');
    expect(config.serverUrl).toBe('http://localhost:3000');
    expect(config.pollIntervalMs).toBe(DEFAULT_POLL_INTERVAL_MS);
  });

  it('14.3 strips a trailing slash so URL joins never double it', () => {
    const config = loadMcpConfig({ GISIK_SERVER_URL: 'http://localhost:3000/' }, '/home/x');
    expect(config.serverUrl).toBe('http://localhost:3000');
  });
});
