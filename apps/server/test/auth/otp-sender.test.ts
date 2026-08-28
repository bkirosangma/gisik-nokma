import { describe, expect, it } from 'vitest';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';

describe('LogOtpSender', () => {
  it('captures the code and logs it instead of sending SMS', async () => {
    const lines: string[] = [];
    const sender = new LogOtpSender((msg) => lines.push(msg));
    await sender.send('+919000000001', '482913');
    expect(sender.sent).toEqual([{ phoneE164: '+919000000001', code: '482913' }]);
    expect(lines[0]).toContain('+919000000001');
    expect(lines[0]).toContain('482913');
  });
});

describe('LogMagicLinkSender', () => {
  it('captures the link and logs it instead of sending email', async () => {
    const lines: string[] = [];
    const sender = new LogMagicLinkSender((msg) => lines.push(msg));
    await sender.send('kiro@example.com', 'http://localhost:3000/api/auth/magic-link/verify?token=abc');
    expect(sender.sent).toEqual([
      { email: 'kiro@example.com', url: 'http://localhost:3000/api/auth/magic-link/verify?token=abc' },
    ]);
    expect(lines[0]).toContain('kiro@example.com');
  });
});
