import { sanitiseForPrompt } from '../../src/normalisation/sanitise';

describe('sanitiseForPrompt', () => {
  // Normal string returned unchanged (except trim)
  it('returns a normal string unchanged (modulo trim)', () => {
    expect(sanitiseForPrompt('Hello world', 100)).toBe('Hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitiseForPrompt('  hello  ', 100)).toBe('hello');
  });

  // Truncation
  it('truncates a string longer than maxLength', () => {
    expect(sanitiseForPrompt('abcdefghij', 5)).toBe('abcde');
  });

  it('does not truncate a string equal to maxLength', () => {
    expect(sanitiseForPrompt('abcde', 5)).toBe('abcde');
  });

  it('does not truncate a string shorter than maxLength', () => {
    expect(sanitiseForPrompt('abc', 10)).toBe('abc');
  });

  // Truncation applies after sanitisation
  it('truncates after sanitisation has been applied', () => {
    // '"hello"' -> "'hello'" (7 chars), truncated to 5
    expect(sanitiseForPrompt('"hello"', 5)).toBe("'hell");
  });

  // Quote replacement
  it('replaces double quotes with single quotes', () => {
    expect(sanitiseForPrompt('"quoted"', 100)).toBe("'quoted'");
  });

  it('replaces multiple double quotes', () => {
    expect(sanitiseForPrompt('say "hi" and "bye"', 100)).toBe("say 'hi' and 'bye'");
  });

  // Brace replacement
  it('replaces { with (', () => {
    expect(sanitiseForPrompt('hello {world}', 100)).toBe('hello (world)');
  });

  it('replaces } with )', () => {
    expect(sanitiseForPrompt('{key: value}', 100)).toBe('(key: value)');
  });

  it('replaces both { and } in the same string', () => {
    expect(sanitiseForPrompt('data: {a: 1, b: 2}', 100)).toBe('data: (a: 1, b: 2)');
  });

  // Control character stripping
  it('strips control characters below code 32 (except newline/CR)', () => {
    expect(sanitiseForPrompt('hello\x01world', 100)).toBe('helloworld');
  });

  it('strips 0x1F (unit separator control char)', () => {
    expect(sanitiseForPrompt('abc\x1Fdef', 100)).toBe('abcdef');
  });

  it('strips multiple control characters', () => {
    expect(sanitiseForPrompt('\x02hello\x03world\x1A', 100)).toBe('helloworld');
  });

  it('strips BEL (\\x07) control character', () => {
    expect(sanitiseForPrompt('ring\x07bell', 100)).toBe('ringbell');
  });

  // Null byte stripping
  it('strips null bytes', () => {
    expect(sanitiseForPrompt('hello\0world', 100)).toBe('helloworld');
  });

  it('strips multiple null bytes', () => {
    expect(sanitiseForPrompt('\0\0hello\0', 100)).toBe('hello');
  });

  // Newline handling
  it('replaces \\n with a space', () => {
    expect(sanitiseForPrompt('line1\nline2', 100)).toBe('line1 line2');
  });

  it('replaces \\r with a space', () => {
    expect(sanitiseForPrompt('line1\rline2', 100)).toBe('line1 line2');
  });

  it('replaces \\r\\n (CRLF) with a space', () => {
    expect(sanitiseForPrompt('line1\r\nline2', 100)).toBe('line1  line2');
  });

  it('replaces multiple newlines with spaces', () => {
    expect(sanitiseForPrompt('a\nb\nc', 100)).toBe('a b c');
  });

  // Realistic article title
  it('sanitises a realistic article title correctly', () => {
    const input = 'Paystack raises $200M "Series B" {funding} round';
    const expected = "Paystack raises $200M 'Series B' (funding) round";
    expect(sanitiseForPrompt(input, 200)).toBe(expected);
  });

  // Emoji preservation
  it('preserves emoji (they are not control chars)', () => {
    expect(sanitiseForPrompt('🚀 Startup raises $1M', 100)).toBe('🚀 Startup raises $1M');
  });

  it('preserves emoji with other valid characters', () => {
    expect(sanitiseForPrompt('💰 Series A: $5M raised', 100)).toBe('💰 Series A: $5M raised');
  });

  // Empty string
  it('returns empty string for empty input', () => {
    expect(sanitiseForPrompt('', 100)).toBe('');
  });

  // Whitespace only
  it('returns empty string for whitespace-only input', () => {
    expect(sanitiseForPrompt('   ', 100)).toBe('');
  });

  it('returns empty string for tab-only input', () => {
    // tabs (0x09) are control chars (< 32) and should be stripped
    expect(sanitiseForPrompt('\t\t\t', 100)).toBe('');
  });

  // Combined scenarios
  it('handles a string with quotes, braces, and newlines combined', () => {
    const input = '"Breaking News"\n{headline}: startup wins award';
    const expected = "'Breaking News' (headline): startup wins award";
    expect(sanitiseForPrompt(input, 200)).toBe(expected);
  });

  it('handles truncation after all replacements when result is shorter due to stripping', () => {
    // Control chars stripped, so result is shorter
    const input = 'a\x01b\x02c\x03d'; // 7 chars raw, 4 chars after strip
    expect(sanitiseForPrompt(input, 3)).toBe('abc');
  });
});
