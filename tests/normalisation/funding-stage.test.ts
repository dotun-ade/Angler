import { normaliseFundingStage } from '../../src/normalisation/funding-stage';

describe('normaliseFundingStage', () => {
  // --- Canonical values (exact strings) ---
  it('returns "pre-seed" for exact canonical "pre-seed"', () => {
    expect(normaliseFundingStage('pre-seed')).toBe('pre-seed');
  });

  it('returns "seed" for exact canonical "seed"', () => {
    expect(normaliseFundingStage('seed')).toBe('seed');
  });

  it('returns "series_a" for exact canonical "series_a"', () => {
    expect(normaliseFundingStage('series_a')).toBe('series_a');
  });

  it('returns "series_b_plus" for exact canonical "series_b_plus"', () => {
    expect(normaliseFundingStage('series_b_plus')).toBe('series_b_plus');
  });

  it('returns "bootstrapped" for exact canonical "bootstrapped"', () => {
    expect(normaliseFundingStage('bootstrapped')).toBe('bootstrapped');
  });

  // --- Aliases for pre-seed ---
  it('returns "pre-seed" for alias "pre seed"', () => {
    expect(normaliseFundingStage('pre seed')).toBe('pre-seed');
  });

  it('returns "pre-seed" for alias "preseed"', () => {
    expect(normaliseFundingStage('preseed')).toBe('pre-seed');
  });

  // --- Aliases for seed ---
  it('returns "seed" for alias "seed round"', () => {
    expect(normaliseFundingStage('seed round')).toBe('seed');
  });

  it('returns "seed" for alias "seed stage"', () => {
    expect(normaliseFundingStage('seed stage')).toBe('seed');
  });

  // --- Aliases for series_a ---
  it('returns "series_a" for alias "series a"', () => {
    expect(normaliseFundingStage('series a')).toBe('series_a');
  });

  it('returns "series_a" for alias "series-a"', () => {
    expect(normaliseFundingStage('series-a')).toBe('series_a');
  });

  it('returns "series_a" for alias "series a round"', () => {
    expect(normaliseFundingStage('series a round')).toBe('series_a');
  });

  // --- Aliases for series_b_plus ---
  it('returns "series_b_plus" for alias "series b"', () => {
    expect(normaliseFundingStage('series b')).toBe('series_b_plus');
  });

  it('returns "series_b_plus" for alias "series b+"', () => {
    expect(normaliseFundingStage('series b+')).toBe('series_b_plus');
  });

  it('returns "series_b_plus" for alias "series_b"', () => {
    expect(normaliseFundingStage('series_b')).toBe('series_b_plus');
  });

  it('returns "series_b_plus" for alias "series c"', () => {
    expect(normaliseFundingStage('series c')).toBe('series_b_plus');
  });

  it('returns "series_b_plus" for alias "series d"', () => {
    expect(normaliseFundingStage('series d')).toBe('series_b_plus');
  });

  it('returns "series_b_plus" for alias "series e"', () => {
    expect(normaliseFundingStage('series e')).toBe('series_b_plus');
  });

  it('returns "series_b_plus" for alias "late stage"', () => {
    expect(normaliseFundingStage('late stage')).toBe('series_b_plus');
  });

  it('returns "series_b_plus" for alias "growth stage"', () => {
    expect(normaliseFundingStage('growth stage')).toBe('series_b_plus');
  });

  // --- Aliases for bootstrapped ---
  it('returns "bootstrapped" for alias "bootstrap"', () => {
    expect(normaliseFundingStage('bootstrap')).toBe('bootstrapped');
  });

  it('returns "bootstrapped" for alias "self-funded"', () => {
    expect(normaliseFundingStage('self-funded')).toBe('bootstrapped');
  });

  it('returns "bootstrapped" for alias "profitable"', () => {
    expect(normaliseFundingStage('profitable')).toBe('bootstrapped');
  });

  // --- Case insensitivity ---
  it('returns "pre-seed" for "PRE-SEED" (uppercase)', () => {
    expect(normaliseFundingStage('PRE-SEED')).toBe('pre-seed');
  });

  it('returns "seed" for "SEED" (uppercase)', () => {
    expect(normaliseFundingStage('SEED')).toBe('seed');
  });

  it('returns "series_a" for "Series A" (mixed case)', () => {
    expect(normaliseFundingStage('Series A')).toBe('series_a');
  });

  it('returns "series_b_plus" for "Series B+" (mixed case)', () => {
    expect(normaliseFundingStage('Series B+')).toBe('series_b_plus');
  });

  it('returns "bootstrapped" for "BOOTSTRAPPED" (uppercase)', () => {
    expect(normaliseFundingStage('BOOTSTRAPPED')).toBe('bootstrapped');
  });

  it('returns "bootstrapped" for "Self-Funded" (mixed case)', () => {
    expect(normaliseFundingStage('Self-Funded')).toBe('bootstrapped');
  });

  it('returns "seed" for "Seed Round" (mixed case)', () => {
    expect(normaliseFundingStage('Seed Round')).toBe('seed');
  });

  // --- Null / undefined / invalid types ---
  it('returns null for null', () => {
    expect(normaliseFundingStage(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normaliseFundingStage(undefined)).toBeNull();
  });

  it('returns null for a number', () => {
    expect(normaliseFundingStage(42)).toBeNull();
  });

  it('returns null for an object', () => {
    expect(normaliseFundingStage({ stage: 'seed' })).toBeNull();
  });

  it('returns null for an array', () => {
    expect(normaliseFundingStage(['seed'])).toBeNull();
  });

  // --- Edge cases ---
  it('returns null for empty string', () => {
    expect(normaliseFundingStage('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normaliseFundingStage('   ')).toBeNull();
  });

  it('returns null for unrecognised value "angel"', () => {
    expect(normaliseFundingStage('angel')).toBeNull();
  });

  it('returns null for unrecognised value "ipo"', () => {
    expect(normaliseFundingStage('ipo')).toBeNull();
  });

  it('returns null for unrecognised value "venture"', () => {
    expect(normaliseFundingStage('venture')).toBeNull();
  });
});
