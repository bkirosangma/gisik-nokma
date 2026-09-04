import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /**
   * Where this server is reachable. better-auth signs magic links and OAuth
   * redirect_uris from it, so a wrong value produces links that go somewhere
   * else — and passing it explicitly is what stops better-auth from ever
   * deriving an origin from an attacker-supplied Host header.
   */
  BETTER_AUTH_URL: z.string().url(),
  /**
   * The key every session cookie and bearer token is signed with. Required with
   * NO default: the plan's own sketch reached for `?? 'dev-only-secret-change-me'`
   * here, which would let a production deploy boot happily on a signing key
   * printed in the repository — anyone could then mint a session for any user.
   * A missing variable must stop the server, and `loadConfig` already names it.
   *
   * 32 is better-auth's own threshold, not one invented here: below it the
   * library logs *"your BETTER_AUTH_SECRET should be at least 32 characters long
   * for adequate security"* (`context/create-context.mjs`) and starts anyway.
   * A warning nobody reads is not a control, so it is refused instead.
   */
  BETTER_AUTH_SECRET: z.string().min(32),
  /**
   * Where the product's web client lives. It is the HOST OF EVERY INVITATION
   * LINK this server mints (`routes/invites.ts`), so a wrong value produces
   * links that go somewhere else and an absent one produces links to
   * `undefined/invite/<token>` — with the credential already spent on a URL
   * nobody can follow, and no way to get it back.
   *
   * Required with NO default, for that reason. `.env.example` has documented it
   * since Plan 11's section was written ahead of its reader; Plan 4 Task 14 is
   * the reader arriving, so it moves into the LIVE set there in the same change.
   */
  WEB_ORIGIN: z.string().url(),
  /**
   * How often the snapshot writer sweeps for tickets whose replay has grown
   * past the threshold, and how far past it a ticket must be to earn a
   * snapshot (Plan 10 Task 5). Both are `.positive()`, and on the interval that
   * is not decoration: `setInterval(fn, 0)` runs the pass on every tick of the
   * event loop, and the pass opens a pool connection and folds every due
   * entity — a zero here would spend the server on itself. A zero MIN_EVENTS
   * makes every ticket due on every pass, which then recomputes a snapshot at a
   * seq that already has a row and collides on the snapshots primary key; the
   * writer guards that path for its programmatic callers, but the environment
   * cannot reach it at all.
   *
   * Neither is a correctness knob. Snapshots bound replay COST; a server that
   * never writes one still answers with exactly the same state, only slower —
   * which is why these carry defaults and `DATABASE_URL` does not.
   */
  SNAPSHOT_INTERVAL_MS: z.coerce.number().int().positive().default(300000),
  SNAPSHOT_MIN_EVENTS: z.coerce.number().int().positive().default(20),
});

export type AppConfig = {
  databaseUrl: string;
  port: number;
  host: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  betterAuthUrl: string;
  betterAuthSecret: string;
  webOrigin: string;
  snapshotIntervalMs: number;
  snapshotMinEvents: number;
};

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string>): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new ConfigError(`invalid server configuration — check: ${variables}`);
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    port: parsed.data.PORT,
    host: parsed.data.HOST,
    logLevel: parsed.data.LOG_LEVEL,
    betterAuthUrl: parsed.data.BETTER_AUTH_URL,
    betterAuthSecret: parsed.data.BETTER_AUTH_SECRET,
    webOrigin: parsed.data.WEB_ORIGIN,
    snapshotIntervalMs: parsed.data.SNAPSHOT_INTERVAL_MS,
    snapshotMinEvents: parsed.data.SNAPSHOT_MIN_EVENTS,
  };
}
