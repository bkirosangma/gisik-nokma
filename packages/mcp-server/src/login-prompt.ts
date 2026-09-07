import type { LoginPrompt } from './device-login.js';

/**
 * The sign-in instruction, and the one rule that governs where it goes.
 *
 * STDOUT IS THE MCP TRANSPORT. A single line written there — a `console.log`
 * left in a handler, a friendly banner, this prompt — lands in the middle of
 * the JSON-RPC stream and the client answers with a parse error instead of a
 * tool result. Nothing in this package may write to stdout, and the writer is
 * injected here so a test can prove it rather than a comment claim it.
 */
export function createLoginPrompt(write: (chunk: string) => void): LoginPrompt {
  return (info) => {
    write(
      `\ngisik-nokma needs you to approve this assistant.\n` +
        `  1. Open ${info.verificationUri}\n` +
        `  2. Enter the code ${info.userCode}\n` +
        `Waiting…\n\n`,
    );
  };
}

/** The prompt `main.ts` installs. Exported so the stdout rule above is testable. */
export const stderrLoginPrompt: LoginPrompt = createLoginPrompt((chunk) => {
  process.stderr.write(chunk);
});
