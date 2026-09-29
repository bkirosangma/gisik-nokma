import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createTransport, type Transporter } from 'nodemailer';
import { selectMagicLinkSender } from '../../src/auth/select-senders.js';
import {
  connectionPhaseLogger,
  SMTP_TIMEOUTS_MS,
  smtpTransportOptions,
  type SmtpLog,
} from '../../src/auth/smtp-magic-link-sender.js';
import { selectInviteMailer, type InviteEmail } from '../../src/invites/invite-mailer.js';

/**
 * **One pooled SMTP transport for both senders, and a log of how the connection
 * went — never of what was said on it** (fix-now batch S2 + S1, owner rulings
 * 2026-09-29 evening).
 *
 * Every check here runs real nodemailer against a real socket: a tiny in-process
 * SMTP server that counts connections, speaks AUTH and DATA, and records what
 * arrives. `TESTMARKER-not-a-token` stands in for the credential (the SMTP
 * password and the invitation link's token); no real-looking secret is used.
 */
const MARKER = 'TESTMARKER-not-a-token';

type FakeSmtp = { port: number; connections: () => number; close: () => Promise<void> };

/** EHLO / AUTH PLAIN+LOGIN / MAIL / RCPT / DATA / RSET / QUIT — enough for nodemailer, nothing more. */
async function startFakeSmtp(): Promise<FakeSmtp> {
  const sockets = new Set<Socket>();
  let connections = 0;
  const server: Server = createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    let inData = false;
    let authStep: 'none' | 'plain' | 'user' | 'pass' = 'none';
    let buffer = '';
    socket.write('220 fake ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += String(chunk);
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) return;
          buffer = buffer.slice(end + 5);
          inData = false;
          socket.write('250 queued\r\n');
          continue;
        }
        const eol = buffer.indexOf('\r\n');
        if (eol < 0) return;
        const line = buffer.slice(0, eol);
        buffer = buffer.slice(eol + 2);
        if (authStep === 'plain') { authStep = 'none'; socket.write('235 ok\r\n'); continue; }
        if (authStep === 'user') { authStep = 'pass'; socket.write('334 UGFzc3dvcmQ6\r\n'); continue; }
        if (authStep === 'pass') { authStep = 'none'; socket.write('235 ok\r\n'); continue; }
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO' || verb === 'HELO') socket.write('250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n');
        else if (line.toUpperCase().startsWith('AUTH PLAIN')) {
          if (line.trim().split(/\s+/).length > 2) socket.write('235 ok\r\n');
          else { authStep = 'plain'; socket.write('334 \r\n'); }
        } else if (line.toUpperCase().startsWith('AUTH LOGIN')) { authStep = 'user'; socket.write('334 VXNlcm5hbWU6\r\n'); }
        else if (verb === 'DATA') { inData = true; socket.write('354 go\r\n'); }
        else if (verb === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    connections: () => connections,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

const MAIL: InviteEmail = {
  to: 'recipient-x@example.test',
  inviterName: 'Kiro',
  workspaceName: 'Convenience Corner',
  role: 'member',
  url: `https://pm.example.test/invite/${MARKER}`,
  expiresAt: '2026-10-13T10:00:00.000Z',
};

const open: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of open.splice(0)) await close();
});

/** The senders hold their transporter privately; the test reaches in only to close it. */
const transporterOf = (sender: object): Transporter => (sender as unknown as { transporter: Transporter }).transporter;

describe('6.227 both senders share one pooled transport', () => {
  it('6.227 two sends in a row open ONE connection, for the invite mailer and the sign-in sender alike; CONTROL: the unpooled form opens two', async () => {
    const smtp = await startFakeSmtp();
    open.push(smtp.close);
    const url = `smtp://127.0.0.1:${smtp.port}`;

    // The options themselves: pooled, url-carrying, and the bounded timeouts unchanged.
    expect(smtpTransportOptions(url)).toMatchObject({ url, pool: true, ...SMTP_TIMEOUTS_MS });

    // CONTROL — the old shape (`createTransport({ url, ...timeouts })`, no pool) pays a connection per send,
    // which is what makes "one connection" below a measurement and not a property of the fake.
    const unpooled = createTransport({ url, ...SMTP_TIMEOUTS_MS });
    open.push(() => unpooled.close());
    for (let i = 0; i < 2; i += 1) await unpooled.sendMail({ from: 'a@x.test', to: 'b@x.test', subject: 's', text: 't' });
    expect(smtp.connections()).toBe(2);

    const before = smtp.connections();
    const mailer = selectInviteMailer({ smtpUrl: url, inviteFrom: 'invite@x.test' });
    open.push(() => transporterOf(mailer).close());
    await mailer.send(MAIL);
    await mailer.send(MAIL);
    expect(smtp.connections() - before).toBe(1);

    const beforeSignIn = smtp.connections();
    const signIn = selectMagicLinkSender({ smtpUrl: url, magicLinkFrom: 'sign-in@x.test' });
    open.push(() => transporterOf(signIn).close());
    await signIn.send('someone@example.test', `https://pm.example.test/verify?token=${MARKER}`);
    await signIn.send('someone@example.test', `https://pm.example.test/verify?token=${MARKER}`);
    expect(smtp.connections() - beforeSignIn).toBe(1);
  });
});

describe('6.228 the SMTP log carries the connection, not the conversation', () => {
  it('6.228 a real send with AUTH and a credential-bearing link logs the connection and none of the password, link, user or recipient; CONTROL: the connection records exist', async () => {
    const smtp = await startFakeSmtp();
    open.push(smtp.close);
    const records: Array<{ fields: Record<string, unknown>; message: string }> = [];
    const log: SmtpLog = (fields, message) => records.push({ fields, message });
    const url = `smtp://smtpuser:${MARKER}@127.0.0.1:${smtp.port}`;

    const mailer = selectInviteMailer({ smtpUrl: url, inviteFrom: 'invite@x.test' }, log);
    open.push(() => transporterOf(mailer).close());
    await mailer.send(MAIL);

    const signInRecords: string[] = [];
    const signIn = selectMagicLinkSender({ smtpUrl: url, magicLinkFrom: 'sign-in@x.test' }, (fields, message) =>
      signInRecords.push(JSON.stringify({ fields, message })),
    );
    open.push(() => transporterOf(signIn).close());
    await signIn.send('someone-y@example.test', `https://pm.example.test/verify?token=${MARKER}`);

    // The instrument works: the connection was logged — where, and that it was established.
    const written = JSON.stringify(records);
    expect(records.some((r) => r.fields.tnx === 'network' && r.fields.remotePort === smtp.port)).toBe(true);
    expect(signInRecords.some((r) => r.includes('"tnx":"network"'))).toBe(true);
    // The whole point: not the AUTH secret, not the link, not who it went to — for either sender.
    for (const text of [written, ...signInRecords]) {
      expect(text).not.toContain(MARKER);
      expect(text).not.toContain('smtpuser');
      expect(text).not.toContain('recipient-x');
      expect(text).not.toContain('someone-y');
    }
  });

  it('6.228 the filter is an allow-list: traffic, send/message and AUTH-user records are dropped; connection and failure records pass', () => {
    const passed: Array<{ fields: Record<string, unknown>; message: string }> = [];
    const logger = connectionPhaseLogger((fields, message) => passed.push({ fields, message }));

    // Dropped: what a `debug: true` transport would emit, and what nodemailer logs about the mail itself.
    logger.debug({ tnx: 'client' }, `C: AUTH PLAIN ${MARKER}`);
    logger.debug({ tnx: 'server' }, `S: 250 ${MARKER}`);
    logger.info({ tnx: 'send', messageId: 'm' }, 'Sending message %s using #%s to <%s>', 'm', 1, 'recipient-x@example.test');
    logger.info({ tnx: 'message' }, '<%s bytes encoded mime message (source size %s bytes)>', 100, 90);
    logger.info({ tnx: 'smtp' }, 'User %s authenticated', JSON.stringify('smtpuser'));
    logger.debug({ tnx: 'create' }, 'Creating transport: %s', 'nodemailer');
    logger.info({}, `no tnx but not a failure ${MARKER}`);
    expect(passed).toEqual([]);

    // CONTROL — kept: the connection phase, the session-level smtp records, and a failure with no tnx.
    logger.info({ tnx: 'network', cid: 'c1', remoteAddress: '203.0.113.7', remotePort: 587, secret: MARKER }, '%s established to %s:%s', 'Secure connection', 'smtp.example.test', 587);
    logger.debug({ tnx: 'dns', source: 'smtp.example.test', resolved: '203.0.113.7' }, 'Resolved %s as %s [cache %s]', 'smtp.example.test', '203.0.113.7', 'miss');
    logger.debug({ tnx: 'smtp' }, 'SMTP handshake finished');
    logger.warn({ err: new Error('Connection timeout') }, 'Timeout');
    expect(passed.map((p) => p.message)).toEqual([
      'Secure connection established to smtp.example.test:587',
      'Resolved smtp.example.test as 203.0.113.7 [cache miss]',
      'SMTP handshake finished',
      'Timeout',
    ]);
    expect(passed[0]?.fields).toMatchObject({ component: 'smtp', tnx: 'network', remoteAddress: '203.0.113.7', remotePort: 587 });
    // Fields are picked by name: an unlisted field is not carried.
    expect(JSON.stringify(passed)).not.toContain(MARKER);
    expect(passed[3]?.fields.errMessage).toBe('Connection timeout');
  });
});
