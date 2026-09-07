import { describe, expect, it } from 'vitest';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import {
  LogOtpSender,
  NullOtpSender,
  PHONE_SIGN_IN_UNAVAILABLE,
} from '../../src/auth/otp-sender.js';
import { selectMagicLinkSender, selectOtpSender } from '../../src/auth/select-senders.js';
import { SmtpMagicLinkSender } from '../../src/auth/smtp-magic-link-sender.js';

/**
 * The composition root's two sender decisions, held where a test can reach
 * them.
 *
 * They were inline in `main()` until Plan 11 Task 4, which meant no test could
 * fail on either: `main()` opens a Postgres pool before it reaches them. The
 * OTP one in particular is a security decision with an errand attached (the
 * production path used to log every one-time code and hoard them in memory),
 * and an errand closed without a guard reopens the first time someone reaches
 * for the convenient class.
 */
/**
 * 13.145 — cited on the block: `selectMagicLinkSender` picks the SMTP sender when `SMTP_URL` is configured and the log sender otherwise. BOTH directions are asserted, which is what makes it a selection rather than a default.
 */
describe('selectMagicLinkSender', () => {
  it('mails over SMTP when SMTP_URL is configured', () => {
    const sender = selectMagicLinkSender({
      smtpUrl: 'smtp://mailpit:1025',
      magicLinkFrom: 'sign-in@gisik-nokma.local',
    });
    expect(sender).toBeInstanceOf(SmtpMagicLinkSender);
  });

  it('logs when SMTP_URL is absent — the dev path, not a broken server', () => {
    const sender = selectMagicLinkSender({
      smtpUrl: null,
      magicLinkFrom: 'sign-in@gisik-nokma.local',
    });
    expect(sender).toBeInstanceOf(LogMagicLinkSender);
    expect(sender).not.toBeInstanceOf(SmtpMagicLinkSender);
  });
});

describe('selectOtpSender', () => {
  /**
   * 13.146 — `selectOtpSender()` NEVER returns `LogOtpSender` on the production path.
   */
  it('never puts the log sender on the production path', () => {
    const sender = selectOtpSender();
    // Both halves of the inherited errand, one assertion each, so a regression
    // names which fault came back.
    //
    // Fault 1 — the code in the process log. The log sender is the only
    // implementation that writes one, so its absence is the guard.
    expect(sender).not.toBeInstanceOf(LogOtpSender);
    expect(sender).toBeInstanceOf(NullOtpSender);
  });

  /**
   * 13.147 — `NullOtpSender` holds no transcript of issued codes — a STRUCTURAL check (no `sent` key, empty own-keys) rather than a behavioural one, so there is nothing to grow and nothing to dump.
   */
  it('holds no transcript of issued codes — nothing to grow, nothing to dump', () => {
    const sender = selectOtpSender();
    // Fault 2 — the unbounded in-process array. Asserted STRUCTURALLY rather
    // than by counting entries after a send: an array that is empty because
    // nothing was sent yet proves nothing about an array that grows forever.
    // Restoring `sent` to whatever this function returns reddens this line.
    expect('sent' in sender).toBe(false);
    expect(Object.keys(sender)).toEqual([]);
  });

  it('refuses, with a code a client can switch on', async () => {
    const sender = selectOtpSender();
    await expect(sender.send('+919000000001', '482913')).rejects.toMatchObject({
      status: 'NOT_IMPLEMENTED',
      body: { code: PHONE_SIGN_IN_UNAVAILABLE },
    });
  });
});
