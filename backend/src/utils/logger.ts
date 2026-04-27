import { config } from '../config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(level: LogLevel) {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[config.logLevel];
}

function serializeError(error: Error) {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        const normalizedKey = key.toLowerCase();
        if (normalizedKey.includes('authorization') || normalizedKey.includes('cookie')) {
          return [key, '[REDACTED]'];
        }

        return [key, sanitizeValue(entry)];
      })
    );
  }

  return value;
}

export function log(level: LogLevel, message: string, fields: Record<string, unknown> = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const sanitizedFields = sanitizeValue(fields) as Record<string, unknown>;

  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...sanitizedFields,
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}
