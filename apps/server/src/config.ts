import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = {
  databaseUrl: string;
  port: number;
  host: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
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
  };
}
