const CANONICALS: string[] = [
  'Fintech',
  'SaaS & Tech',
  'Web3',
  'Retail & E-Commerce',
  'HR',
  'Gaming',
  'PropTech',
  'Healthcare',
  'Utilities',
  'Travel & Mobility',
  'Education',
  'Trad. Finance',
];

/** Lower-case alias → canonical industry name */
const ALIAS_MAP: Record<string, string> = {
  // Fintech
  'financial technology': 'Fintech',
  'financial services': 'Fintech',
  'fintech': 'Fintech',
  'payments': 'Fintech',
  'insurtech': 'Fintech',
  'lending': 'Fintech',
  'neobank': 'Fintech',
  'digital banking': 'Fintech',

  // SaaS & Tech
  'software as a service': 'SaaS & Tech',
  'saas': 'SaaS & Tech',
  'technology': 'SaaS & Tech',
  'tech': 'SaaS & Tech',
  'software': 'SaaS & Tech',
  'it services': 'SaaS & Tech',

  // Web3
  'blockchain': 'Web3',
  'cryptocurrency': 'Web3',
  'crypto': 'Web3',
  'defi': 'Web3',
  'nft': 'Web3',
  'web 3': 'Web3',
  'web3': 'Web3',

  // Retail & E-Commerce
  'e-commerce': 'Retail & E-Commerce',
  'ecommerce': 'Retail & E-Commerce',
  'retail': 'Retail & E-Commerce',
  'marketplace': 'Retail & E-Commerce',

  // HR
  'human resources': 'HR',
  'hr': 'HR',
  'hrtech': 'HR',
  'workforce': 'HR',
  'payroll': 'HR',

  // Gaming
  'gaming': 'Gaming',
  'game': 'Gaming',
  'esports': 'Gaming',

  // PropTech
  'real estate': 'PropTech',
  'proptech': 'PropTech',
  'property': 'PropTech',
  'construction': 'PropTech',

  // Healthcare
  'healthcare': 'Healthcare',
  'health': 'Healthcare',
  'medtech': 'Healthcare',
  'healthtech': 'Healthcare',

  // Utilities
  'utilities': 'Utilities',
  'energy': 'Utilities',
  'water': 'Utilities',

  // Travel & Mobility
  'travel': 'Travel & Mobility',
  'mobility': 'Travel & Mobility',
  'logistics': 'Travel & Mobility',
  'transportation': 'Travel & Mobility',

  // Education
  'education': 'Education',
  'edtech': 'Education',
  'learning': 'Education',

  // Trad. Finance
  'traditional finance': 'Trad. Finance',
  'trad. finance': 'Trad. Finance',
  'banking': 'Trad. Finance',
  'investment': 'Trad. Finance',
  'asset management': 'Trad. Finance',
  'capital markets': 'Trad. Finance',
};

/** Build a lower-case → canonical lookup for canonical values themselves */
const CANONICAL_LOWER_MAP: Record<string, string> = {};
for (const canonical of CANONICALS) {
  CANONICAL_LOWER_MAP[canonical.toLowerCase()] = canonical;
}

/**
 * Normalise a raw industry string to one of the 12 canonical values.
 * Returns null for any input that cannot be mapped.
 */
export function normaliseIndustry(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const lower = trimmed.toLowerCase();

  // 1. Check alias map
  const fromAlias = ALIAS_MAP[lower];
  if (fromAlias !== undefined) return fromAlias;

  // 2. Check if it matches a canonical value (case-insensitive)
  const fromCanonical = CANONICAL_LOWER_MAP[lower];
  if (fromCanonical !== undefined) return fromCanonical;

  return null;
}
