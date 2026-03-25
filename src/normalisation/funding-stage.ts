type FundingStage = 'pre-seed' | 'seed' | 'series_a' | 'series_b_plus' | 'bootstrapped';

const ALIAS_MAP: Record<string, FundingStage> = {
  'pre-seed': 'pre-seed',
  'pre seed': 'pre-seed',
  'preseed': 'pre-seed',
  'seed': 'seed',
  'seed round': 'seed',
  'seed stage': 'seed',
  'series a': 'series_a',
  'series_a': 'series_a',
  'series-a': 'series_a',
  'series a round': 'series_a',
  'series b': 'series_b_plus',
  'series b+': 'series_b_plus',
  'series_b': 'series_b_plus',
  'series_b_plus': 'series_b_plus',
  'series c': 'series_b_plus',
  'series d': 'series_b_plus',
  'series e': 'series_b_plus',
  'late stage': 'series_b_plus',
  'growth stage': 'series_b_plus',
  'bootstrapped': 'bootstrapped',
  'bootstrap': 'bootstrapped',
  'self-funded': 'bootstrapped',
  'profitable': 'bootstrapped',
};

export function normaliseFundingStage(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const normalised = trimmed.toLowerCase();

  return ALIAS_MAP[normalised] ?? null;
}
