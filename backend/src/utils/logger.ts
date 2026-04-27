import { config } from '../config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACT_PATTERN = /authorization|cookie|password|passphrase|secret|token|api[_-]?key|private[_-]?key/i;

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

function sanitizeValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);
    return value.map((entry) => sanitizeValue(entry, seen));
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value && typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]';
    }

    seen.add(value as object);
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (REDACT_PATTERN.test(key)) {
          return [key, '[REDACTED]'];
        }

        return [key, sanitizeValue(entry, seen)];
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
