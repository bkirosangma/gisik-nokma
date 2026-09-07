import net from 'node:net';
import { createTransport } from 'nodemailer';
import { describe, expect, it } from 'vitest';
import {
  MAGIC_LINK_SUBJECT,
  SMTP_TIMEOUTS_MS,
  SmtpMagicLinkSender,
} from '../../src/auth/smtp-magic-link-sender.js';

/**
 * The `from` this file mails as. The DEV default from `config.ts`, deliberately
 * — a real production sender address belongs in the deploy spec and in no test.
 */
const FROM = 'sign-in@gisik-nokma.local';

/**
 * A link the shape better-auth actually issues: base URL, verify path, token,
 * callback. Its LENGTH is load-bearing here and not decoration. Nodemailer
 * picks the transfer encoding from the content — a short body goes out `7bit`
 * untouched — so a toy URL would let the encoding step do nothing and the
 * tests below would assert against a message no production send resembles.
 * Past 76 columns the body is quoted-printable, which is the case worth
 * pinning.
 */
const REALISTIC_URL = `https://pm.example.test/api/auth/magic-link/verify?token=${'aBc-123_xyz'.repeat(3)}&callbackURL=%2Fboard%2Fdefault`;

/**
 * Undo the transfer encoding a MIME client would undo: drop the soft line
 * breaks (a `=` at end of line), then turn `=XX` back into its byte.
 */
function decodeQuotedPrintable(body: string): string {
  return body
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

interface CapturedMessage {
  /** Every byte nodemailer would have written to the socket. */
  raw: string;
  /** The header block, before the blank line. */
  headers: string;
  /** The body as a compliant client would read it: quoted-printable decoded. */
  body: string;
  envelope: { from: string; to: string[] };
}

/**
 * Capture the bytes nodemailer would put on the wire.
 *
 * `streamTransport` with `buffer: true` is nodemailer's own no-network
 * transport that still runs the FULL composition: headers, MIME structure and
 * transfer encoding, handed back as a Buffer instead of written to a socket.
 * So what these tests read is the message as transmitted, and not the options
 * object that was passed in — an assertion that "sendMail was called with
 * `{from: config.magicLinkFrom}`" passes just as happily when the composition
 * drops the field.
 *
 * It is deliberately NOT `jsonTransport`, which was the first thing here and
 * was wrong. `jsonTransport` hands back the text as composed, BEFORE transfer
 * encoding, so a test asserting "the URL is a line of the message" asserted a
 * property the transmitted message does not have: measured on nodemailer
 * 10.0.0, the body goes out quoted-printable, the link's `=` characters written
 * `=3D` and the line soft-wrapped at 76 columns, so `raw.includes(url)` is
 * FALSE while the decoded body still contains it exactly. A guard that stops
 * before the encoding step cannot fail on the encoding step.
 */
function capturingTransport(): {
  transporter: ReturnType<typeof createTransport>;
  messages: CapturedMessage[];
} {
  const messages: CapturedMessage[] = [];
  const transporter = createTransport({ streamTransport: true, buffer: true });
  const original = transporter.sendMail.bind(transporter);
  transporter.sendMail = (async (options: Parameters<typeof original>[0]) => {
    const info = await original(options);
    const raw = String(info.message);
    const separator = raw.indexOf('\r\n\r\n');
    messages.push({
      raw,
      headers: raw.slice(0, separator),
      body: decodeQuotedPrintable(raw.slice(separator + 4)),
      envelope: info.envelope as { from: string; to: string[] },
    });
    return info;
  }) as typeof transporter.sendMail;
  return { transporter, messages };
}

/**
 * A TCP listener that accepts the connection and then says nothing — no SMTP
 * banner, ever. It stands in for the failure this class has to survive: a host
 * that is reachable, or a firewall that swallows packets, but no mail server
 * answering. A blackholed address like `10.255.255.1` would exercise the
 * connect timeout instead, but whether such an address blackholes or refuses
 * depends on the machine's routing, and CI's routing is not this laptop's.
 */
function silentSmtpServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = net.createServer(() => {
      /* accept the socket and never greet */
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo;
      resolve({
        url: `smtp://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

describe('SmtpMagicLinkSender', () => {
  /**
   * 13.140 — `SmtpMagicLinkSender` composes ONE message to the address, from the configured sender — envelope and raw headers alike.
   */
  it('composes one message to the address, from the configured sender', async () => {
    const { transporter, messages } = capturingTransport();
    const sender = new SmtpMagicLinkSender('smtp://unused.invalid:1025', FROM, transporter);

    await sender.send('kiro@example.com', 'https://app.example/verify?token=abc');

    expect(messages).toHaveLength(1);
    const message = messages[0]!;
    // The envelope, both halves. `from` is the one the CONFIG named: a literal
    // substituted for `this.from` in the implementation reddens here, which is
    // what makes `MAGIC_LINK_FROM` a knob rather than a decoration.
    expect(message.envelope.from).toBe(FROM);
    expect(message.envelope.to).toEqual(['kiro@example.com']);
    // And the headers that were actually written, which is what the recipient's
    // client displays — the envelope alone would not catch a header rewrite.
    expect(message.headers.split('\r\n')).toContain(`From: ${FROM}`);
    expect(message.headers.split('\r\n')).toContain('To: kiro@example.com');
    expect(message.headers.split('\r\n')).toContain(`Subject: ${MAGIC_LINK_SUBJECT}`);
  });

  /**
   * 13.141 — the link survives quoted-printable transfer encoding BYTE-FOR-BYTE and stands alone on its own decoded line, tested with a URL over 76 characters so the encoder must actually wrap.
   */
  it('carries the link through the body byte-for-byte, after the transfer encoding', async () => {
    const { transporter, messages } = capturingTransport();
    const sender = new SmtpMagicLinkSender('smtp://unused.invalid:1025', FROM, transporter);
    // The link IS the credential: a body that mangles one letter of it is a
    // sign-in email that cannot sign anybody in. This one is long enough that
    // the encoding step has work to do, and carries characters an over-eager
    // templater would escape.
    const url = REALISTIC_URL;
    expect(url.length).toBeGreaterThan(76);

    await sender.send('kiro@example.com', url);

    expect(messages).toHaveLength(1);
    const message = messages[0]!;
    expect(message.body).toContain(url);
    // On its own line once decoded, so every mail client that autolinks takes
    // the whole URL and nothing else.
    expect(message.body.split(/\r?\n/)).toContain(url);
  });

  /**
   * 13.142 — one plain-text part only, so no client is invited to rewrite the link.
   */
  it('sends one plain-text part, so no client is invited to rewrite the link', async () => {
    const { transporter, messages } = capturingTransport();
    const sender = new SmtpMagicLinkSender('smtp://unused.invalid:1025', FROM, transporter);

    await sender.send('kiro@example.com', REALISTIC_URL);

    const message = messages[0]!;
    // The shape of the message on the wire, named rather than assumed. An HTML
    // alternative added later makes this multipart; a `textEncoding: 'base64'`
    // rewrites the encoding header. Either would sail past a body assertion
    // that decodes whatever it is handed, so the wire shape is asserted here.
    expect(message.headers).toContain('Content-Type: text/plain; charset=utf-8');
    expect(message.headers).toContain('Content-Transfer-Encoding: quoted-printable');
    expect(message.raw).not.toContain('multipart/');
    expect(message.raw).not.toContain('text/html');
  });

  /**
   * 13.143 — negative control: constructing the sender alone sends nothing.
   */
  it('sends nothing when nobody asked it to', async () => {
    // The negative control for the tests above: `messages` is empty until
    // `send` is called, so "toHaveLength(1)" is evidence of THIS send and not
    // of a transport that emits on construction.
    const { transporter, messages } = capturingTransport();
    new SmtpMagicLinkSender('smtp://unused.invalid:1025', FROM, transporter);
    expect(messages).toEqual([]);
  });

  /**
   * 13.144 — an unreachable mail host that never speaks — a real TCP listener that accepts and never sends a banner — is given up on in seconds rather than hanging.
   */
  it(
    'gives up on a mail host that never speaks, in seconds and not the default minutes',
    async () => {
      // NO injected transporter: this is the production construction path, and
      // it is the only one whose bound is worth asserting. The cost is real —
      // this test waits out SMTP_TIMEOUTS_MS.greetingTimeout, about ten
      // seconds — and it is the cost of a check that can actually fail. An
      // assertion that `transporter.options.connectionTimeout === 10_000`
      // would run instantly and would still pass under the inert
      // `createTransport(url, {...})` form, whose options are message defaults
      // and whose sends were measured still pending at 8 000 ms.
      const server = await silentSmtpServer();
      try {
        const sender = new SmtpMagicLinkSender(server.url, FROM);
        const started = Date.now();
        await expect(
          sender.send('kiro@example.com', 'https://app.example/verify?token=abc'),
        ).rejects.toMatchObject({ code: 'ETIMEDOUT' });
        const elapsed = Date.now() - started;

        // Upper bound well under nodemailer's own 30-second greeting default,
        // so reverting the timeouts reddens HERE with the elapsed number in the
        // message rather than as an opaque test-runner timeout.
        expect(elapsed).toBeLessThan(SMTP_TIMEOUTS_MS.greetingTimeout + 8_000);
        // Lower bound loose, but present: an instant rejection would mean the
        // socket never reached the greeting wait and this measured nothing.
        expect(elapsed).toBeGreaterThan(SMTP_TIMEOUTS_MS.greetingTimeout * 0.6);
      } finally {
        await server.close();
      }
    },
    45_000,
  );
});
