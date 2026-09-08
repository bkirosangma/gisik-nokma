import { APIError } from 'better-auth/api';

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
 * The machine-readable code a client switches on to hide phone sign-in.
 *
 * Shaped like better-auth's own `PHONE_NUMBER_ERROR_CODES` entries (the vendor
 * answers `SEND_OTP_NOT_IMPLEMENTED` when no `sendOTP` is configured at all), so
 * a client that already reads `body.code` off this plugin's refusals reads this
 * one with no new branch.
 */
export const PHONE_SIGN_IN_UNAVAILABLE = 'PHONE_SIGN_IN_UNAVAILABLE';

/**
 * What a person is told. Not "something went wrong": the sentence names the
 * door that IS open, because a refusal a user cannot act on is an outage with
 * better manners.
 */
export const PHONE_SIGN_IN_UNAVAILABLE_MESSAGE =
  'Phone sign-in is unavailable: this deployment has no SMS delivery channel. Sign in with your email address instead.';

/**
 * THE PRODUCTION OTP SENDER, and it refuses.
 *
 * Sending an SMS to an Indian number requires a DLT-registered sender and
 * template. This deployment has neither, so there is no SMS channel — and the
 * honest implementation of "deliver this code by SMS" when no such channel
 * exists is a refusal, not a pretence. What the alternative bought is worth
 * naming, because it is what shipped until now: `LogOtpSender` on the
 * production path answered `200 {"message":"code sent"}` to a person who would
 * never receive anything, wrote the code where the operators could read it, and
 * kept every code it ever issued in memory. All three are the same mistake —
 * behaving as though a channel exists.
 *
 * **What the caller sees.** `501` with a JSON body carrying
 * `code: "PHONE_SIGN_IN_UNAVAILABLE"` and a sentence pointing at email sign-in.
 * The `APIError` is thrown from inside better-auth's `sendOTP` callback, which
 * the `phone-number` plugin AWAITS (`routes.mjs`: `else await sendOTPResult`,
 * taken because this server configures no `advanced.backgroundTasks.handler`),
 * so it propagates out of `auth.handler` and the vendor's own router renders
 * it. That is measured in `test/auth/null-otp-sender.test.ts` over the real
 * mount, not inferred from the throw: a plain `Error` here would be a 500 with
 * nothing a client could render, and the difference between the two is the
 * whole point of this class.
 *
 * **One thing it does not undo.** The plugin writes its verification row BEFORE
 * calling `sendOTP`, so a refused request still leaves an expiring row keyed by
 * the phone number. It discloses nothing (the code is not in the response and
 * not in the log) and it expires on its own; removing it would mean reaching
 * into the vendor's storage from a sender, which is a worse trade.
 *
 * It holds no state, so there is nothing here to grow and nothing to dump.
 */
/**
 * WHETHER PHONE SIGN-IN CAN WORK ON THIS DEPLOYMENT — the one rule, in the file
 * that defines what "cannot deliver" means.
 *
 * `GET /v1/auth/methods` reports this so `/sign-in` renders the Phone tab only
 * where a code can actually arrive. It is derived from the sender the running
 * auth instance holds, never from an env flag: a `SMS_*` variable would be a
 * SECOND declaration of the same fact, and the arrangement where it says yes
 * and `selectOtpSender()` still returns a `NullOtpSender` is exactly the
 * offered-but-refused door this exists to close.
 *
 * `instanceof` rather than a `canDeliver` flag on the interface, deliberately:
 * the refusal is a property of THIS class — it throws on every send — not
 * something an implementer declares about itself and could declare wrongly.
 * When `selectOtpSender()` gains a real branch that can return a
 * half-configured sender, that is the change that earns a self-reported
 * capability; today there are two implementers and one of them is a refusal.
 *
 * `LogOtpSender` reads as available, and that is correct: it delivers to a log,
 * which is what the test and dev paths sign in through.
 */
export function phoneSignInAvailable(sender: OtpSender): boolean {
  return !(sender instanceof NullOtpSender);
}

export class NullOtpSender implements OtpSender {
  async send(_phoneE164: string, _code: string): Promise<void> {
    throw new APIError('NOT_IMPLEMENTED', {
      code: PHONE_SIGN_IN_UNAVAILABLE,
      message: PHONE_SIGN_IN_UNAVAILABLE_MESSAGE,
    });
  }
}

/**
 * DEVELOPMENT AND TEST ONLY: logs the code and records it for tests.
 *
 * `sent` is what a test reads to learn the code that was issued — it is the
 * seam `test/helpers/session.ts`'s `signInWithPhone` signs users in through,
 * which is how a route test gets a real bearer token without stubbing the
 * sign-in path.
 *
 * **This class is not safe to run in production, for TWO reasons — and as of
 * Plan 11 Task 4 nothing wires it there.** The errand recorded in `index.ts`
 * (and in the coordination doc) was to remove both from the production path;
 * `NullOtpSender` above is what that removal shipped as, and `selectOtpSender()`
 * is the seam a test can hold it to. The faults are described rather than
 * deleted, because the class still exists and a future contributor reaching for
 * it in `src/` needs to know why they must not.
 *
 * 1. `log` writes every one-time code to the process log, where anyone with log
 *    access can sign in as anyone.
 * 2. `sent` is an **unbounded in-process array** that keeps every code ever
 *    issued for the lifetime of the process — memory that grows without limit,
 *    and a heap dump or debugger attach that discloses the lot. A test file
 *    lives for seconds; a server does not.
 *
 * Both live in this class rather than in the interface, which is why swapping
 * the implementation removes them together and touches nothing else.
 */
export class LogOtpSender implements OtpSender {
  public readonly sent: Array<{ phoneE164: string; code: string }> = [];

  constructor(private readonly log: (message: string) => void = console.info) {}

  async send(phoneE164: string, code: string): Promise<void> {
    this.sent.push({ phoneE164, code });
    this.log(`[dev-otp] OTP for ${phoneE164}: ${code}`);
  }
}
