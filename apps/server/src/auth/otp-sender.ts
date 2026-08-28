/**
 * Delivery of one-time codes, abstracted so the transport is swappable.
 *
 * `phoneE164` is the number in E.164 form (`+919000000001`) — the same shape
 * better-auth's `phoneNumber` plugin hands its `sendOTP` callback.
 */
export interface OtpSender {
  send(phoneE164: string, code: string): Promise<void>;
}

/**
 * Development implementation: logs the code and records it for tests.
 * Production delivery runs through a DLT-registered SMS provider behind this
 * same interface — a deployment concern, deliberately NOT implemented in this
 * plan (spec §6 names the errand).
 *
 * `sent` is what a test reads to learn the code that was issued; nothing else
 * ever needs it, which is why there is no production implementation that keeps
 * a transcript of every OTP the system has ever sent.
 */
export class LogOtpSender implements OtpSender {
  public readonly sent: Array<{ phoneE164: string; code: string }> = [];

  constructor(private readonly log: (message: string) => void = console.info) {}

  async send(phoneE164: string, code: string): Promise<void> {
    this.sent.push({ phoneE164, code });
    this.log(`[dev-otp] OTP for ${phoneE164}: ${code}`);
  }
}
