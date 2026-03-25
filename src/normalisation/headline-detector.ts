/**
 * Returns true if the given string is likely an article headline rather than
 * a company name.
 *
 * Rules (any one is sufficient):
 *  A) More than 6 words → headline (company names are never this long).
 *  B) Contains a headline verb AND has more than 3 words → headline.
 *  C) Ends with '?' → headline.
 */

const HEADLINE_VERBS = new Set([
  'raises', 'raised',
  'launches', 'launched',
  'appoints', 'appointed',
  'secures', 'secured',
  'expands', 'expanded',
  'acquires', 'acquired',
  'partners', 'partnered',
  'announces', 'announced',
  'closes', 'closed',
  'unveils', 'unveiled',
  'wins', 'won',
  'joins', 'joined',
  'receives', 'received',
]);

export function isLikelyHeadline(name: string): boolean {
  if (!name || name.trim().length === 0) {
    return false;
  }

  // Rule C: ends with a question mark
  if (name.trimEnd().endsWith('?')) {
    return true;
  }

  const words = name.trim().split(/\s+/);
  const wordCount = words.length;

  // Rule A: more than 6 words
  if (wordCount > 6) {
    return true;
  }

  // Rule B: contains a headline verb AND more than 3 words
  if (wordCount > 3) {
    const hasVerb = words.some(w => HEADLINE_VERBS.has(w.toLowerCase()));
    if (hasVerb) {
      return true;
    }
  }

  return false;
}
