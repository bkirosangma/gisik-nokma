/** Delivery of sign-in links, abstracted so the transport is swappable. */
export interface MagicLinkSender {
  send(email: string, url: string): Promise<void>;
}

/**
 * Development implementation: logs the link and records it for tests.
 * The production email provider is a deployment concern, deliberately NOT
 * implemented in this plan.
 */
export class LogMagicLinkSender implements MagicLinkSender {
  public readonly sent: Array<{ email: string; url: string }> = [];

  constructor(private readonly log: (message: string) => void = console.info) {}

  async send(email: string, url: string): Promise<void> {
    this.sent.push({ email, url });
    this.log(`[dev-magic-link] link for ${email}: ${url}`);
  }
}
