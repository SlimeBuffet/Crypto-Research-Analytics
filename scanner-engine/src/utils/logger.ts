import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

/** Mask an API key for safe logging: shows first 4 and last 4 chars */
export function maskKey(key: string): string {
  if (key.length <= 10) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export const logger = pino({
  level: LOG_LEVEL,
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:yyyy-mm-dd HH:MM:ss' } }
      : undefined,
});
