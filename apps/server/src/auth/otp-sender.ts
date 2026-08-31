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
 * `sent` is what a test reads to learn the code that was issued.
 *
 * **This class is not safe to run in production, for TWO reasons, and until the
 * real sender exists `src/index.ts` wires it anyway.** An earlier version of
 * this comment said "there is no production implementation that keeps a
 * transcript of every OTP the system has ever sent"; Plan 4 Task 2's assembly
 * made that sentence false, and it is corrected here rather than left standing.
 *
 * 1. `log` writes every one-time code to the process log, where anyone with log
 *    access can sign in as anyone.
 * 2. `sent` is an **unbounded in-process array** that keeps every code ever
 *    issued for the lifetime of the process — memory that grows without limit,
 *    and a heap dump or debugger attach that discloses the lot. A test file
 *    lives for seconds; a server does not.
 *
 * The real sender must do neither. Both faults live in this class rather than in
 * the interface, so replacing the implementation removes them together.
 */
export class LogOtpSender implements OtpSender {
  public readonly sent: Array<{ phoneE164: string; code: string }> = [];

  constructor(private readonly log: (message: string) => void = console.info) {}

  async send(phoneE164: string, code: string): Promise<void> {
    this.sent.push({ phoneE164, code });
    this.log(`[dev-otp] OTP for ${phoneE164}: ${code}`);
  }
}
