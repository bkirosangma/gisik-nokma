import type { AppConfig } from '../config.js';
import { LogMagicLinkSender, type MagicLinkSender } from './magic-link-sender.js';
import { NullOtpSender, type OtpSender } from './otp-sender.js';
import { SmtpMagicLinkSender, type SmtpLog } from './smtp-magic-link-sender.js';

/**
 * WHICH SENDERS A DEPLOYMENT GETS — as functions, not as two ternaries inside
 * `main()`.
 *
 * The reason is falsifiability, and it is the whole reason this file exists.
 * `main()` opens a Postgres pool on its first line, so a selection rule written
 * inline there is a rule no test can reach: swapping `SmtpMagicLinkSender` for
 * the log sender, or putting `LogOtpSender` back on the production path, would
 * redden nothing anywhere in the suite. Here the same two decisions are pure
 * functions of configuration, and `test/auth/select-senders.test.ts` holds them.
 *
 * This is the ONLY place in `src/` that decides a sender. `index.ts` calls it;
 * `auth-dev.ts` deliberately does not (it is the schema-generation and
 * local-dev instance, never the production assembly, and says so at its own
 * definition).
 */

/**
 * `SMTP_URL` set means real mail; unset means the log sender.
 *
 * Unset is the DEV path and not a broken server — a developer running
 * `pnpm dev` with no mail transport gets the link on stdout, which is the whole
 * point of `LogMagicLinkSender`. What makes that safe to keep is that a magic
 * link is single-use and expiring, and the dev process is the developer's own.
 * `SMTP_URL` in a deploy spec is what turns it into mail.
 */
export function selectMagicLinkSender(
  config: Pick<AppConfig, 'smtpUrl' | 'magicLinkFrom'>,
  log?: SmtpLog,
): MagicLinkSender {
  return config.smtpUrl === null
    ? new LogMagicLinkSender()
    : new SmtpMagicLinkSender(config.smtpUrl, config.magicLinkFrom, undefined, log);
}

/**
 * There is no SMS channel, so the production sender refuses — see
 * `NullOtpSender`, which carries the argument and the user-visible answer.
 *
 * It takes no configuration ON PURPOSE. A `SMS_*` knob here would be a place to
 * put a value that turns a channel on, and no such channel exists to turn on:
 * an Indian deployment needs a DLT-registered sender and template first, and
 * that is a registration, not a variable. When one exists, this function gains
 * a real branch and the test above it gains a case.
 */
export function selectOtpSender(): OtpSender {
  return new NullOtpSender();
}
