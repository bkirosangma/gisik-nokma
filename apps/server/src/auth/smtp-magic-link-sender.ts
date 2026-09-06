import { createTransport, type Transporter } from 'nodemailer';
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
  ) {
    this.transporter = transporter ?? createTransport({ url: smtpUrl, ...SMTP_TIMEOUTS_MS });
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
