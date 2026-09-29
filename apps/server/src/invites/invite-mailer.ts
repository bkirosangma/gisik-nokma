import { formatIstInstant } from '@gisik-nokma/domain';
import { createTransport, type Transporter } from 'nodemailer';
import { smtpTransportOptions, type SmtpLog } from '../auth/smtp-magic-link-sender.js';
import type { AppConfig } from '../config.js';

/**
 * The invitation letter (access plan W5, owner ruling 2026-09-29: "make the
 * invite actually send email").
 *
 * PLAIN TEXT ONLY — deviation D4. The link is the credential, and the sign-in
 * sender's reason holds word for word (`../auth/smtp-magic-link-sender.ts`,
 * the comment on `text`): an HTML body invites a mail client to rewrite or wrap
 * the link. The link sits alone on its own line.
 */
export type InviteEmail = {
  to: string;
  /** The inviter's account name, else their real email, else `INVITER_FALLBACK`. Never an id. */
  inviterName: string;
  workspaceName: string;
  role: string;
  url: string;
  /** The TOKEN's expiry, an ISO instant; rendered as an IST day and time. */
  expiresAt: string;
};

/** When the inviter has neither a name nor a real address (a phone account always has a name). */
export const INVITER_FALLBACK = 'Someone';

export function inviteSubject(inviterName: string, workspaceName: string): string {
  return `${inviterName} invited you to ${workspaceName} on Gisik Nokma`;
}

export function composeInviteEmail(mail: InviteEmail): { subject: string; text: string } {
  const article = mail.role === 'admin' ? 'an' : 'a';
  return {
    subject: inviteSubject(mail.inviterName, mail.workspaceName),
    text:
      `${mail.inviterName} invited you to join ${mail.workspaceName} on Gisik Nokma as ${article} ${mail.role}.\n\n` +
      `Open this link to accept:\n\n${mail.url}\n\n` +
      `The link stops working after ${formatIstInstant(mail.expiresAt)}. It can be used once. ` +
      'If you were not expecting this, ignore this message.',
  };
}

export interface InviteMailer {
  send(mail: InviteEmail): Promise<void>;
}

/**
 * The dev/test mailer. It records, and logs ONE line that names the recipient
 * and the workspace and WITHHOLDS the link — unlike `LogMagicLinkSender`, whose
 * link is the only way a developer signs in. An invitation's link is already on
 * the inviter's screen, and `routes/invites.ts`'s `redactInviteToken` exists so
 * a credential never reaches the process log.
 */
export class LogInviteMailer implements InviteMailer {
  public readonly sent: InviteEmail[] = [];

  constructor(private readonly log: (message: string) => void = console.info) {}

  async send(mail: InviteEmail): Promise<void> {
    this.sent.push(mail);
    this.log(`[dev-invite-mail] invitation for ${mail.to} to ${mail.workspaceName} (link withheld)`);
  }
}

/**
 * Real delivery, over the SAME transport rules as the sign-in sender: a URL and
 * nothing else, the options object carrying `url` so `smtps:`/`user:pass` parse,
 * and the same bounded timeouts. The third argument is the test seam, exactly
 * as `SmtpMagicLinkSender`'s is.
 */
export class SmtpInviteMailer implements InviteMailer {
  private readonly transporter: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
    transporter?: Transporter,
    log?: SmtpLog,
  ) {
    this.transporter = transporter ?? createTransport(smtpTransportOptions(smtpUrl, log));
  }

  async send(mail: InviteEmail): Promise<void> {
    const { subject, text } = composeInviteEmail(mail);
    await this.transporter.sendMail({ from: this.from, to: mail.to, subject, text });
  }
}

/** `SMTP_URL` set means real mail; unset means the log mailer — the magic-link rule (`../auth/select-senders.ts:32-38`). */
export function selectInviteMailer(config: Pick<AppConfig, 'smtpUrl' | 'inviteFrom'>, log?: SmtpLog): InviteMailer {
  return config.smtpUrl === null
    ? new LogInviteMailer()
    : new SmtpInviteMailer(config.smtpUrl, config.inviteFrom, undefined, log);
}
