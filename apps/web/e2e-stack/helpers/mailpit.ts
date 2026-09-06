import { MAILPIT } from './stack.js';

/**
 * The test inbox half of the magic-link flow.
 *
 * THE TRAP THIS FILE EXISTS TO AVOID. The obvious implementation searches for
 * mail to an address and takes `messages[0]`. Every address here receives more
 * than one link over a run (global setup creates the user, then a spec signs the
 * same user in), so `messages[0]` under an unknown sort order can hand back a
 * link that has ALREADY BEEN SPENT. Following a spent link does not error
 * loudly — the browser lands on a page, the session cookie from the earlier
 * verification is still in the context, and the suite goes green while proving
 * nothing about the flow it claims to test.
 *
 * The fix is not to guess the sort order. It is to make the question
 * unambiguous: PURGE the inbox immediately before triggering a link, then
 * require EXACTLY ONE message to arrive. One message has no ordering. If a
 * second arrives, that is a real finding about the flow (a duplicate send) and
 * this raises rather than picking a winner.
 */

type Search = { messages: Array<{ ID: string }> };
type Message = { Text: string; HTML: string };

/** Delete every message. Call immediately BEFORE the action that sends one. */
export async function purgeInbox(): Promise<void> {
  const response = await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Mailpit refused the purge: ${response.status}`);
}

/**
 * Wait for exactly one message to `email` and return the first URL in its body.
 * Requires a `purgeInbox()` immediately before the send.
 */
export async function fetchMagicLink(email: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let seen = 0;
  while (Date.now() < deadline) {
    const query = encodeURIComponent(`to:"${email}"`);
    const response = await fetch(`${MAILPIT}/api/v1/search?query=${query}`);
    if (!response.ok) throw new Error(`Mailpit search answered ${response.status}`);
    const result = (await response.json()) as Search;
    seen = result.messages.length;
    // Settle before deciding. Returning the instant one message is observed
    // makes the "exactly one" guard racy: a duplicate landing a poll later is
    // never seen, so the guard held only when both arrived in the same poll.
    if (seen === 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const confirm = await fetch(`${MAILPIT}/api/v1/search?query=${query}`);
      const settled = (await confirm.json()) as Search;
      if (settled.messages.length > 1) {
        throw new Error(
          `${settled.messages.length} messages for ${email} after a purge — "the newest link" is ` +
            `ambiguous and picking one would be a guess. Two sends for one sign-in is the finding.`,
        );
      }
      const id = result.messages[0]?.ID;
      if (id === undefined) throw new Error('Mailpit returned a message with no ID');
      const detail = await fetch(`${MAILPIT}/api/v1/message/${id}`);
      if (!detail.ok) throw new Error(`Mailpit message fetch answered ${detail.status}`);
      const body = (await detail.json()) as Message;
      const match = /https?:\/\/[^\s"<>]+/.exec(body.Text) ?? /https?:\/\/[^\s"<>]+/.exec(body.HTML);
      if (match === null) {
        throw new Error(`the mail to ${email} carried no URL — is the magic-link template empty?`);
      }
      return match[0];
    }
    if (seen > 1) {
      throw new Error(
        `${seen} messages are waiting for ${email} after a purge, so "the newest link" is ambiguous ` +
          `and picking one would be a guess. Two sends for one sign-in is itself the finding.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(
    `no magic-link mail arrived for ${email} within ${timeoutMs}ms (last count: ${seen}). ` +
      `Is SMTP_URL pointing at Mailpit, and did the send actually happen?`,
  );
}
