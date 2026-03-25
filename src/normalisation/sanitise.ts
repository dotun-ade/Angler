/**
 * Sanitises a string for safe inclusion in an LLM prompt.
 *
 * Steps applied in order:
 *  1. Strip null bytes (\0).
 *  2. Replace newlines (\n, \r) with a single space.
 *  3. Strip remaining control characters (code < 32, i.e. everything below
 *     space that wasn't already handled above — tabs, BEL, etc.).
 *  4. Escape characters that could break JSON parsing:
 *       " → '    { → (    } → )
 *  5. Truncate to maxLength characters.
 *  6. Trim leading/trailing whitespace.
 */
export function sanitiseForPrompt(text: string, maxLength: number): string {
  let result = text;

  // 1. Strip null bytes
  result = result.replace(/\0/g, '');

  // 2. Replace newlines / carriage returns with a space
  result = result.replace(/[\n\r]/g, ' ');

  // 3. Strip remaining control characters (code < 32, excluding \n and \r
  //    which were already replaced above)
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x1F]/g, '');

  // 4. Escape JSON-breaking characters
  result = result.replace(/"/g, "'");
  result = result.replace(/\{/g, '(');
  result = result.replace(/\}/g, ')');

  // 5. Truncate
  result = result.slice(0, maxLength);

  // 6. Trim
  result = result.trim();

  return result;
}
