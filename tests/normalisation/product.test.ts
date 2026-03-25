import { normaliseProduct } from '../../src/normalisation/product';

describe('normaliseProduct', () => {
  // --- All 7 canonical products with exact casing ---
  it('returns "Cards" for exact canonical "Cards"', () => {
    expect(normaliseProduct('Cards')).toBe('Cards');
  });

  it('returns "BaaS" for exact canonical "BaaS"', () => {
    expect(normaliseProduct('BaaS')).toBe('BaaS');
  });

  it('returns "Payments" for exact canonical "Payments"', () => {
    expect(normaliseProduct('Payments')).toBe('Payments');
  });


  it('returns "Global Services" for exact canonical "Global Services"', () => {
    expect(normaliseProduct('Global Services')).toBe('Global Services');
  });

  it('returns "Digizone" for exact canonical "Digizone"', () => {
    expect(normaliseProduct('Digizone')).toBe('Digizone');
  });

  // --- All 7 with different casing ---
  it('returns "Cards" for "cards" (lowercase)', () => {
    expect(normaliseProduct('cards')).toBe('Cards');
  });

  it('returns "BaaS" for "BAAS" (uppercase)', () => {
    expect(normaliseProduct('BAAS')).toBe('BaaS');
  });

  it('returns "Payments" for "payments" (lowercase)', () => {
    expect(normaliseProduct('payments')).toBe('Payments');
  });


  it('returns "Global Services" for "global services" (lowercase)', () => {
    expect(normaliseProduct('global services')).toBe('Global Services');
  });

  it('returns "Digizone" for "digizone" (lowercase)', () => {
    expect(normaliseProduct('digizone')).toBe('Digizone');
  });

  it('returns "BaaS" for "baas" (all lowercase)', () => {
    expect(normaliseProduct('baas')).toBe('BaaS');
  });

  it('returns "Cards" for "CARDS" (all uppercase)', () => {
    expect(normaliseProduct('CARDS')).toBe('Cards');
  });

  it('returns "Payments" for "PAYMENTS" (all uppercase)', () => {
    expect(normaliseProduct('PAYMENTS')).toBe('Payments');
  });


  it('returns "Digizone" for "DIGIZONE" (uppercase)', () => {
    expect(normaliseProduct('DIGIZONE')).toBe('Digizone');
  });

  // --- Whitespace trimming ---
  it('returns "Cards" for "  Cards  " (with surrounding whitespace)', () => {
    expect(normaliseProduct('  Cards  ')).toBe('Cards');
  });

  it('returns "Payments" for "  payments  " (lowercase with whitespace)', () => {
    expect(normaliseProduct('  payments  ')).toBe('Payments');
  });

  // --- Null / undefined / invalid types ---
  it('returns null for null', () => {
    expect(normaliseProduct(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normaliseProduct(undefined)).toBeNull();
  });

  it('returns null for a number', () => {
    expect(normaliseProduct(42)).toBeNull();
  });

  it('returns null for an object', () => {
    expect(normaliseProduct({ product: 'Cards' })).toBeNull();
  });

  it('returns null for an array', () => {
    expect(normaliseProduct(['Cards'])).toBeNull();
  });

  // --- Edge cases ---
  it('returns null for empty string', () => {
    expect(normaliseProduct('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normaliseProduct('   ')).toBeNull();
  });

  // --- Unrecognised products ---
  it('returns null for unrecognised product "Loans"', () => {
    expect(normaliseProduct('Loans')).toBeNull();
  });

  it('returns null for unrecognised product "Insurance"', () => {
    expect(normaliseProduct('Insurance')).toBeNull();
  });

  it('returns null for unrecognised product "Savings"', () => {
    expect(normaliseProduct('Savings')).toBeNull();
  });

  it('returns null for unrecognised product "Transfers"', () => {
    expect(normaliseProduct('Transfers')).toBeNull();
  });
});
