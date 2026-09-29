import { format } from 'node:util';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPPool from 'nodemailer/lib/smtp-pool';
import type { MagicLinkSender } from './magic-link-sender.js';

/**
 * The subject line a signed-out person sees in their inbox. Extracted so the
 * test can name the same constant the implementation sends, rather than
 * restating a string that a later edit could drift away from.
 */
export const MAGIC_LINK_SUBJECT = 'Sign in to Gisik Nokma';

/**
 * How long the SMTP hop may take before it fails, in milliseconds.
 *
 * WHY AT ALL: `sendMagicLink` is awaited inside the sign-in request, and
 * `app.ts` gives Fastify no `requestTimeout`, so whatever nodemailer waits is
 * what the person staring at the sign-in form waits. Nodemailer's own defaults
 * are 2 minutes to connect, 30 seconds for the greeting and 10 minutes of
 * socket inactivity (`smtp-connection/index.js`); a firewall change or a
 * provider outage would turn sign-in into a two-minute spinner, ten held
 * sockets deep per caller at `RATE_LIMIT_AUTH_MAX`. A bounded failure is one a
 * client can render and a person can retry.
 *
 * WHY THESE NUMBERS: a mail host that has not completed a TCP handshake or
 * produced a banner within ten seconds is not about to deliver a link the user
 * is waiting on, and a magic link is retryable by re-submitting the form.
 * Twenty seconds of socket inactivity covers the DATA phase of a message this
 * small with room to spare.
 *
 * Exported because the test that proves the bound is live asserts against these
 * numbers rather than restating them.
 */
export const SMTP_TIMEOUTS_MS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
} as const;

/** Where the connection-phase records go: `app.log.info` in production, a collector in a test. */
export type SmtpLog = (fields: Record<string, unknown>, message: string) => void;

/** The `tnx` (transaction) values nodemailer stamps on records about reaching the server, not about the mail. */
const CONNECTION_PHASE_TNX = new Set(['dns', 'network', 'pool', 'connection']);

/** `smtp` records that describe the session, as against `User %s authenticated`, which names the AUTH account. */
const SESSION_SMTP_MESSAGE = /^(SMTP handshake finished|Closing connection|Connection upgraded|Failed STARTTLS)/;

/**
 * A nodemailer `logger` that forwards ONLY the connection phase (owner ruling
 * 2026-09-29, S1: "which address, which family, did it fall back, how long").
 *
 * An ALLOW-list, on purpose. nodemailer's `debug: true` would pass the whole
 * SMTP conversation to the logger, and that conversation carries the AUTH
 * exchange (the provider credentials) and the DATA phase (the message — for an
 * invitation, the link, which is a credential). This logger is fed without
 * `debug`, so those records are never produced, and the filter is the second
 * lock: `send` and `message` records (they name the recipient), `create` and
 * `transport` records, `client`/`server` traffic, and the `smtp` records that
 * name the AUTH user are all dropped. Fields are picked by name rather than
 * copied, so a field a later nodemailer adds is not logged until someone
 * chooses to.
 */
export function connectionPhaseLogger(log: SmtpLog): Record<'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal', (data: unknown, message?: unknown, ...args: unknown[]) => void> {
  const forward = (level: string) => (data: unknown, message?: unknown, ...args: unknown[]): void => {
    const record = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    const tnx = typeof record.tnx === 'string' ? record.tnx : undefined;
    const template = typeof message === 'string' ? message : '';
    const isFailure = level === 'warn' || level === 'error' || level === 'fatal';
    const wanted =
      tnx === undefined
        ? isFailure
        : CONNECTION_PHASE_TNX.has(tnx) || (tnx === 'smtp' && SESSION_SMTP_MESSAGE.test(template));
    if (!wanted) return;
    const fields: Record<string, unknown> = { component: 'smtp', level };
    for (const key of ['tnx', 'cid', 'action', 'source', 'resolved', 'cached', 'remoteAddress', 'remotePort', 'localPort'] as const) {
      if (record[key] !== undefined) fields[key] = record[key];
    }
    const err = record.err;
    if (err instanceof Error) fields.errMessage = err.message.slice(0, 200);
    log(fields, format(template, ...args).slice(0, 300));
  };
  return {
    trace: forward('trace'),
    debug: forward('debug'),
    info: forward('info'),
    warn: forward('warn'),
    error: forward('error'),
    fatal: forward('fatal'),
  };
}

/**
 * The ONE transport-options builder both senders use (invite and sign-in), so
 * they cannot drift apart: the single options object carrying `url` (see the
 * class docblock — the two-argument form is inert), the bounded timeouts, and
 * a POOLED transport.
 *
 * WHY POOLED (owner ruling 2026-09-29, S2): unpooled, every send paid a full
 * TCP + TLS + AUTH handshake — a measured ~3 s floor. One pool per sender
 * reuses the connection across sends.
 *
 * WHAT IT DOES NOT PROMISE: a pooled connection is an IDLE socket, and
 * `socketTimeout` (20 s, above) governs idleness too. Measured against Mailpit
 * on the installed nodemailer 10.0.0: a send 25 s after the previous one
 * opened a NEW connection (a `Pool Error … Timeout` record, then a second
 * `Created new pool resource`), while one immediately after reused it. So the
 * pool removes the floor for sends within ~20 s of each other and not beyond;
 * keeping it warm longer would mean raising `socketTimeout`, which also
 * loosens the bound on a hung DATA phase — left to the owner (hand-back
 * question), not decided here.
 */
export function smtpTransportOptions(smtpUrl: string, log?: SmtpLog): SMTPPool.Options {
  return {
    url: smtpUrl,
    ...SMTP_TIMEOUTS_MS,
    pool: true,
    ...(log === undefined ? {} : { logger: connectionPhaseLogger(log) }),
  };
}

/**
 * Real email delivery for sign-in links, over SMTP.
 *
 * The transport is a URL and nothing else — `smtp://user:pass@host:port` — so
 * the vendor behind it (Mailpit in dev, Brevo/SES/whatever in production) never
 * appears in this repository. `SMTP_URL` is validated at boot as an smtp(s) URL
 * with a host (`config.ts`), so a typo costs a refused start rather than a
 * failed send at the moment a user is waiting for a link.
 *
 * HOW THE TIMEOUTS ARE PASSED, and why it is not the obvious way. The obvious
 * way — `createTransport(smtpUrl, { connectionTimeout: 10_000 })` — is INERT:
 * nodemailer reads a second argument as per-message defaults, not as transport
 * options. Measured on the installed nodemailer 10.0.0 under Node 22:
 * `transporter.options.connectionTimeout` came back `undefined` and a send to a
 * blackholed address was still pending at 8 000 ms. The form used here — a
 * single options object carrying `url` — hands the URL to nodemailer's own
 * parser (so `smtps:` still means TLS, and `user:pass` still becomes `auth`)
 * and applies these keys wherever the URL does not set them. That last part is
 * deliberate: an operator who needs a slower host keeps the escape hatch of
 * `?connectionTimeout=…` on `SMTP_URL`, and it wins over the default here.
 *
 * `from` is passed in rather than read here: `MAGIC_LINK_FROM` has a DEV default
 * (`sign-in@gisik-nokma.local`) and a production value that lives in the deploy
 * spec. A live sender address hard-coded in this file would be a decision the
 * repository made on the operator's behalf.
 *
 * The optional third argument is the test seam and the ONLY one. A test hands
 * in a buffering `streamTransport` transporter and reads back the bytes
 * nodemailer would have written to the socket — headers, transfer encoding and
 * body — so what is asserted is the mail that would go out, not that a spy was
 * called. Absent, the transporter is built from the URL and the class is
 * exactly what ships; the timeout test constructs it that way on purpose,
 * because a bound asserted through an injected transporter would not be this
 * class's bound.
 */
export class SmtpMagicLinkSender implements MagicLinkSender {
  private readonly transporter: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
    transporter?: Transporter,
    log?: SmtpLog,
  ) {
    this.transporter = transporter ?? createTransport(smtpTransportOptions(smtpUrl, log));
  }

  async send(email: string, url: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: MAGIC_LINK_SUBJECT,
      // Plain text, deliberately: an HTML body invites a mail client to rewrite
      // or wrap the link, and the link IS the credential. The URL stands alone
      // on its own line of the composed text. On the wire that line is
      // quoted-printable — its `=` characters written `=3D`, and soft-wrapped
      // with trailing `=` past 76 columns — which every MIME-compliant client
      // rejoins before it autolinks. What the blank lines buy is that nothing
      // else shares the link's line once it is decoded.
      text: `Follow this link to sign in:\n\n${url}\n\nThe link is single-use. If you did not request it, ignore this message.`,
    });
  }
}
