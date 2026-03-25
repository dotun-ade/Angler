import { logInfo, logWarn, logError, redactPII } from '../../src/utils/logger';

describe('logger', () => {
  let stdoutSpy: jest.SpyInstance;
  let capturedOutput: string;

  beforeEach(() => {
    capturedOutput = '';
    stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown) => {
        capturedOutput += String(chunk);
        return true;
      });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  function getParsedOutput(): Record<string, unknown> {
    const line = capturedOutput.trim();
    return JSON.parse(line) as Record<string, unknown>;
  }

  // --- level field tests ---

  it('logInfo writes JSON with level "info"', () => {
    logInfo('test message');
    const parsed = getParsedOutput();
    expect(parsed.level).toBe('info');
  });

  it('logWarn writes JSON with level "warn"', () => {
    logWarn('test message');
    const parsed = getParsedOutput();
    expect(parsed.level).toBe('warn');
  });

  it('logError writes JSON with level "error"', () => {
    logError('test message');
    const parsed = getParsedOutput();
    expect(parsed.level).toBe('error');
  });

  // --- timestamp field ---

  it('output has timestamp field that is a valid ISO string', () => {
    logInfo('test message');
    const parsed = getParsedOutput();
    expect(typeof parsed.timestamp).toBe('string');
    const ts = new Date(parsed.timestamp as string);
    expect(ts.toISOString()).toBe(parsed.timestamp);
  });

  // --- message field ---

  it('output has message field matching input', () => {
    logInfo('hello world');
    const parsed = getParsedOutput();
    expect(parsed.message).toBe('hello world');
  });

  // --- meta fields ---

  it('meta fields are included in output', () => {
    logInfo('test', { geminiCallCount: 3 });
    const parsed = getParsedOutput();
    expect(parsed.geminiCallCount).toBe(3);
  });

  it('multiple meta fields are all present in output', () => {
    logInfo('test', { foo: 'bar', baz: 42, flag: true });
    const parsed = getParsedOutput();
    expect(parsed.foo).toBe('bar');
    expect(parsed.baz).toBe(42);
    expect(parsed.flag).toBe(true);
  });

  // --- gemini call shape test ---

  it('logInfo("Gemini call 3/20 -- 17 remaining", { geminiCallCount: 3 }) produces expected JSON shape', () => {
    logInfo('Gemini call 3/20 -- 17 remaining', { geminiCallCount: 3 });
    const parsed = getParsedOutput();
    expect(parsed.level).toBe('info');
    expect(typeof parsed.timestamp).toBe('string');
    expect(parsed.message).toBe('Gemini call 3/20 -- 17 remaining');
    expect(parsed.geminiCallCount).toBe(3);
  });

  // --- PII redaction in log output ---

  it('logInfo with meta containing email address → email is redacted in output', () => {
    logInfo('sending email', { email: 'user@example.com' });
    const parsed = getParsedOutput();
    expect(parsed.email).toBe('[REDACTED]');
  });

  it('logError with meta containing Google API key → API key is redacted in output', () => {
    const fakeKey = 'AIza' + 'A'.repeat(35);
    logError('api error', { key: fakeKey });
    const parsed = getParsedOutput();
    expect(parsed.key).toBe('[REDACTED]');
  });

  it('message string containing email is redacted in output', () => {
    logInfo('contact user@example.com for details');
    const parsed = getParsedOutput();
    expect(parsed.message).toBe('contact [REDACTED] for details');
  });

  // --- redactPII unit tests ---

  it('redactPII replaces email addresses with [REDACTED]', () => {
    expect(redactPII('send to user@example.com please')).toBe(
      'send to [REDACTED] please'
    );
  });

  it('redactPII replaces Google API key patterns with [REDACTED]', () => {
    const fakeKey = 'AIza' + 'B'.repeat(35);
    expect(redactPII(`key is ${fakeKey} end`)).toBe('key is [REDACTED] end');
  });

  it('redactPII replaces Bearer tokens with [REDACTED]', () => {
    expect(redactPII('Authorization: Bearer abc123.def456-ghi')).toBe(
      'Authorization: [REDACTED]'
    );
  });

  it('redactPII handles nested objects (email in nested field)', () => {
    const input = { user: { contact: 'admin@company.org' } };
    const result = redactPII(input) as { user: { contact: string } };
    expect(result.user.contact).toBe('[REDACTED]');
  });

  it('redactPII handles arrays containing PII strings', () => {
    const input = ['hello', 'reach@me.io', 'world'];
    const result = redactPII(input) as string[];
    expect(result[0]).toBe('hello');
    expect(result[1]).toBe('[REDACTED]');
    expect(result[2]).toBe('world');
  });

  it('redactPII does not mutate original object', () => {
    const input = { email: 'test@test.com' };
    const inputCopy = { email: 'test@test.com' };
    redactPII(input);
    expect(input).toEqual(inputCopy);
  });

  it('redactPII leaves non-PII strings unchanged', () => {
    expect(redactPII('hello world')).toBe('hello world');
  });

  it('redactPII handles null → returns null', () => {
    expect(redactPII(null)).toBeNull();
  });

  it('redactPII handles numbers → returns number unchanged', () => {
    expect(redactPII(42)).toBe(42);
  });

  it('redactPII handles undefined → returns undefined', () => {
    expect(redactPII(undefined)).toBeUndefined();
  });

  it('redactPII redacts authorization header values', () => {
    expect(redactPII('authorization: someSecretToken123')).toBe('[REDACTED]');
  });

  it('redactPII redacts api_key= patterns', () => {
    expect(redactPII('api_key=supersecret123')).toBe('[REDACTED]');
  });

  it('redactPII redacts apikey: patterns', () => {
    expect(redactPII('apikey: supersecret123')).toBe('[REDACTED]');
  });
});
