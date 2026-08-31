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
});

export type AppConfig = {
  databaseUrl: string;
  port: number;
  host: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  betterAuthUrl: string;
  betterAuthSecret: string;
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
  };
}
