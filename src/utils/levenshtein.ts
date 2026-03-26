/**
 * Strip common legal and generic corporate suffixes from a company name
 * so that "XYZ", "XYZ Limited", "XYZ Technologies Ltd" all normalise to "xyz".
 *
 * Strips (as whole words, case-insensitive):
 *   Legal:   ltd, limited, inc, corp, corporation, plc, llc, llp, pty, pvt, co, gmbh, nv, bv, sa, lp
 *   Generic: technologies, technology, tech, digital, solutions, services,
 *            systems, group, holdings, ventures, international, global,
 *            africa, nigeria, kenya, ghana, platforms, platform
 *
 * Punctuation (dots, ampersands, hyphens, commas) is removed after stripping.
 */
export function normalizeCompanyName(name: string): string {
  const STRIP = [
    // legal
    'ltd', 'limited', 'inc', 'corp', 'corporation', 'plc', 'llc', 'llp',
    'pty', 'pvt', 'gmbh', 'nv', 'bv', 'lp',
    // generic descriptors
    'technologies', 'technology', 'tech', 'digital', 'solutions', 'services',
    'systems', 'group', 'holdings', 'ventures', 'international', 'global',
    'africa', 'nigeria', 'kenya', 'ghana', 'platforms', 'platform',
  ];
  const pattern = new RegExp(`\\b(${STRIP.join('|')})\\b\\.?`, 'gi');
  return name
    .replace(pattern, '')
    .replace(/[&,.<>()+@]/g, '')   // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function levenshteinDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const m = s.length;
  const n = t.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const prev: number[] = new Array(n + 1);
  const curr: number[] = new Array(n + 1);

  for (let j = 0; j <= n; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      const deletion = prev[j] + 1;
      const insertion = curr[j - 1] + 1;
      const substitution = prev[j - 1] + cost;
      curr[j] = Math.min(deletion, insertion, substitution);
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j];
    }
  }

  return prev[n];
}

export function similarityPercentage(a: string, b: string): number {
  if (!a && !b) return 100;
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  return ((maxLen - distance) / maxLen) * 100;
}

/**
 * Similarity after stripping legal/generic suffixes from both names.
 * Use this for all company deduplication so that "XYZ Technologies Ltd"
 * and "XYZ" are treated as the same company.
 */
export function normalizedSimilarity(a: string, b: string): number {
  return similarityPercentage(normalizeCompanyName(a), normalizeCompanyName(b));
}

