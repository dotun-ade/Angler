const CANONICAL_PRODUCTS = [
  'Cards',
  'BaaS',
  'Payments',
  'Business Banking',
  'Virtual Accounts',
  'Global Services',
  'Digizone',
] as const;

type CanonicalProduct = typeof CANONICAL_PRODUCTS[number];

const PRODUCT_MAP: Map<string, CanonicalProduct> = new Map(
  CANONICAL_PRODUCTS.map((p) => [p.toLowerCase(), p])
);

export function normaliseProduct(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return null;
  }

  return PRODUCT_MAP.get(trimmed.toLowerCase()) ?? null;
}
