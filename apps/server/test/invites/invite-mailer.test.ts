import { createTransport } from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import {
  composeInviteEmail,
  inviteSubject,
  LogInviteMailer,
  selectInviteMailer,
  SmtpInviteMailer,
  type InviteEmail,
} from '../../src/invites/invite-mailer.js';

/** Access plan Task 5, cases 6.194–6.197 (W5, deviation D4). */

const MAIL: InviteEmail = {
  to: 'anselma@example.test',
  inviterName: 'Kiro',
  workspaceName: 'Convenience Corner',
  role: 'member',
  url: 'https://pm.example.test/invite/aBc-123_xyz',
  expiresAt: '2026-10-13T10:00:00.000Z',
};

/** Quoted-printable decoding, as `smtp-magic-link-sender.test.ts` does it. */
function decodeQuotedPrintable(body: string): string {
  return body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

describe('6.194 composeInviteEmail', () => {
  it('6.194 subject and body carry inviter, workspace, role, link and IST expiry; CONTROL: role and expiry move only their parts', () => {
    const { subject, text } = composeInviteEmail(MAIL);
    expect(subject).toBe('Kiro invited you to Convenience Corner on Gisik Nokma');
    expect(subject).toBe(inviteSubject('Kiro', 'Convenience Corner'));
    expect(text).toBe(
      'Kiro invited you to join Convenience Corner on Gisik Nokma as a member.\n\n' +
        'Open this link to accept:\n\n' +
        'https://pm.example.test/invite/aBc-123_xyz\n\n' +
        'The link stops working after 13 Oct 2026, 15:30 IST. It can be used once. ' +
        'If you were not expecting this, ignore this message.',
    );
    const other = composeInviteEmail({ ...MAIL, role: 'admin', expiresAt: '2026-10-14T18:45:00.000Z' });
    expect(other.text).toContain('as an admin.');
    expect(other.text).toContain('after 15 Oct 2026, 00:15 IST.');
    expect(other.subject).toBe(subject);
  });
});

describe('6.195 SmtpInviteMailer', () => {
  it('6.195 one plain-text message From inviteFrom To the address; CONTROL: the decoded body carries the link', async () => {
    const raw: string[] = [];
    const transporter = createTransport({ streamTransport: true, buffer: true });
    const original = transporter.sendMail.bind(transporter);
    transporter.sendMail = (async (options: Parameters<typeof original>[0]) => {
      const info = await original(options);
      raw.push(String(info.message));
      return info;
    }) as typeof transporter.sendMail;

    await new SmtpInviteMailer('smtp://unused.invalid:25', 'contact@example.test', transporter).send(MAIL);

    expect(raw).toHaveLength(1);
    const message = raw[0]!;
    const headers = message.slice(0, message.indexOf('\r\n\r\n'));
    expect(headers).toMatch(/^From: contact@example\.test$/m);
    expect(headers).toMatch(/^To: anselma@example\.test$/m);
    expect(headers).toMatch(/^Subject: Kiro invited you to Convenience Corner on Gisik Nokma$/m);
    expect(message).toMatch(/Content-Type: text\/plain/);
    expect(message).not.toMatch(/text\/html/);
    expect(decodeQuotedPrintable(message)).toContain('https://pm.example.test/invite/aBc-123_xyz');
  });
});

describe('6.196 selectInviteMailer', () => {
  it('6.196 SMTP when SMTP_URL is set, the log mailer when not; CONTROL: the SMTP one carries inviteFrom', () => {
    expect(selectInviteMailer({ smtpUrl: null, inviteFrom: 'a@example.test' })).toBeInstanceOf(LogInviteMailer);
    const smtp = selectInviteMailer({ smtpUrl: 'smtp://localhost:1025', inviteFrom: 'a@example.test' });
    expect(smtp).toBeInstanceOf(SmtpInviteMailer);
    expect((smtp as unknown as { from: string }).from).toBe('a@example.test');
  });
});

describe('6.197 INVITE_FROM', () => {
  const BASE = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    BETTER_AUTH_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: 'test-secret-not-used-anywhere-real',
    WEB_ORIGIN: 'http://localhost:3001',
  };
  it('6.197 defaults to MAGIC_LINK_FROM, an explicit value wins, a malformed one is refused', () => {
    expect(loadConfig({ ...BASE, MAGIC_LINK_FROM: 'contact@example.test' }).inviteFrom).toBe('contact@example.test');
    expect(loadConfig({ ...BASE, MAGIC_LINK_FROM: 'contact@example.test', INVITE_FROM: 'team@example.test' }).inviteFrom).toBe(
      'team@example.test',
    );
    expect(() => loadConfig({ ...BASE, INVITE_FROM: 'not-an-address' })).toThrowError(
      'invalid server configuration — check: INVITE_FROM',
    );
  });
});
