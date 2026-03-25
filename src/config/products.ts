export const ANCHOR_PRODUCTS = [
  'Payments',
  'BaaS',
  'Cards',
  'Global Services',
  'Digizone',
] as const;

export type AnchorProduct = typeof ANCHOR_PRODUCTS[number];

export function isValidProduct(product: unknown): product is AnchorProduct {
  return typeof product === 'string' && (ANCHOR_PRODUCTS as readonly string[]).includes(product);
}
