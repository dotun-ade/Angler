const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const GOOGLE_API_KEY_PATTERN = /AIza[0-9A-Za-z_-]{35}/g;
const BEARER_TOKEN_PATTERN = /Bearer\s+[A-Za-z0-9._-]+/gi;
const AUTHORIZATION_PATTERN = /authorization['":\s]+[^\s,}'"]+/gi;
const API_KEY_PATTERN = /api[_-]?key[=:\s]+[^\s,}'"]+/gi;

/**
 * Recursively redact PII from a value. Does NOT mutate the original.
 */
export function redactPII(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactPII(item));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = redactPII(v);
    }
    return result;
  }

  return value;
}

function redactString(s: string): string {
  // Apply all redaction patterns. Reset lastIndex before each use.
  // Order matters: more specific patterns (Bearer, Google API key) run before
  // broader ones (authorization header) to avoid double-redacting.
  let result = s;

  // api_key / apikey / api-key patterns (check before email to avoid false positives)
  API_KEY_PATTERN.lastIndex = 0;
  if (API_KEY_PATTERN.test(result)) {
    API_KEY_PATTERN.lastIndex = 0;
    result = result.replace(API_KEY_PATTERN, '[REDACTED]');
  }

  // Bearer tokens — must run BEFORE authorization so "Authorization: Bearer token"
  // becomes "Authorization: [REDACTED]" (not "[REDACTED] token")
  BEARER_TOKEN_PATTERN.lastIndex = 0;
  if (BEARER_TOKEN_PATTERN.test(result)) {
    BEARER_TOKEN_PATTERN.lastIndex = 0;
    result = result.replace(BEARER_TOKEN_PATTERN, '[REDACTED]');
  }

  // Google API keys
  GOOGLE_API_KEY_PATTERN.lastIndex = 0;
  if (GOOGLE_API_KEY_PATTERN.test(result)) {
    GOOGLE_API_KEY_PATTERN.lastIndex = 0;
    result = result.replace(GOOGLE_API_KEY_PATTERN, '[REDACTED]');
  }

  // Authorization header values — skip if already fully redacted
  AUTHORIZATION_PATTERN.lastIndex = 0;
  if (AUTHORIZATION_PATTERN.test(result)) {
    // Only replace if the captured value is not already [REDACTED]
    AUTHORIZATION_PATTERN.lastIndex = 0;
    result = result.replace(
      AUTHORIZATION_PATTERN,
      (match) => (match.includes('[REDACTED]') ? match : '[REDACTED]')
    );
  }

  // Email addresses
  EMAIL_PATTERN.lastIndex = 0;
  if (EMAIL_PATTERN.test(result)) {
    EMAIL_PATTERN.lastIndex = 0;
    result = result.replace(EMAIL_PATTERN, '[REDACTED]');
  }

  return result;
}

type LogLevel = 'info' | 'warn' | 'error';

function writeLog(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  const redactedMessage = redactString(message);
  const redactedMeta = meta
    ? (redactPII(meta) as Record<string, unknown>)
    : undefined;

  const entry: Record<string, unknown> = {
    level,
    timestamp: new Date().toISOString(),
    message: redactedMessage,
    ...redactedMeta,
  };

  process.stdout.write(JSON.stringify(entry) + '\n');
}

export function logInfo(message: string, meta?: Record<string, unknown>): void {
  writeLog('info', message, meta);
}

export function logWarn(message: string, meta?: Record<string, unknown>): void {
  writeLog('warn', message, meta);
}

export function logError(
  message: string,
  meta?: Record<string, unknown>
): void {
  writeLog('error', message, meta);
}
