import { normaliseIndustry } from '../../src/normalisation/industry';

describe('normaliseIndustry', () => {
  // ── Canonical values returned unchanged (case-insensitive) ──────────────

  it('returns "Fintech" for exact canonical "Fintech"', () => {
    expect(normaliseIndustry('Fintech')).toBe('Fintech');
  });

  it('returns "SaaS & Tech" for exact canonical "SaaS & Tech"', () => {
    expect(normaliseIndustry('SaaS & Tech')).toBe('SaaS & Tech');
  });

  it('returns "Web3" for exact canonical "Web3"', () => {
    expect(normaliseIndustry('Web3')).toBe('Web3');
  });

  it('returns "Retail & E-Commerce" for exact canonical "Retail & E-Commerce"', () => {
    expect(normaliseIndustry('Retail & E-Commerce')).toBe('Retail & E-Commerce');
  });

  it('returns "HR" for exact canonical "HR"', () => {
    expect(normaliseIndustry('HR')).toBe('HR');
  });

  it('returns "Gaming" for exact canonical "Gaming"', () => {
    expect(normaliseIndustry('Gaming')).toBe('Gaming');
  });

  it('returns "PropTech" for exact canonical "PropTech"', () => {
    expect(normaliseIndustry('PropTech')).toBe('PropTech');
  });

  it('returns "Healthcare" for exact canonical "Healthcare"', () => {
    expect(normaliseIndustry('Healthcare')).toBe('Healthcare');
  });

  it('returns "Utilities" for exact canonical "Utilities"', () => {
    expect(normaliseIndustry('Utilities')).toBe('Utilities');
  });

  it('returns "Travel & Mobility" for exact canonical "Travel & Mobility"', () => {
    expect(normaliseIndustry('Travel & Mobility')).toBe('Travel & Mobility');
  });

  it('returns "Education" for exact canonical "Education"', () => {
    expect(normaliseIndustry('Education')).toBe('Education');
  });

  it('returns "Trad. Finance" for exact canonical "Trad. Finance"', () => {
    expect(normaliseIndustry('Trad. Finance')).toBe('Trad. Finance');
  });

  // ── Case-insensitive canonical matching ────────────────────────────────

  it('returns "Fintech" for "FINTECH" (uppercase)', () => {
    expect(normaliseIndustry('FINTECH')).toBe('Fintech');
  });

  it('returns "Fintech" for "fintech" (lowercase)', () => {
    expect(normaliseIndustry('fintech')).toBe('Fintech');
  });

  it('returns "HR" for "hr" (lowercase)', () => {
    expect(normaliseIndustry('hr')).toBe('HR');
  });

  it('returns "Gaming" for "GAMING"', () => {
    expect(normaliseIndustry('GAMING')).toBe('Gaming');
  });

  it('returns "Web3" for "WEB3"', () => {
    expect(normaliseIndustry('WEB3')).toBe('Web3');
  });

  it('returns "Healthcare" for "HEALTHCARE"', () => {
    expect(normaliseIndustry('HEALTHCARE')).toBe('Healthcare');
  });

  it('returns "Education" for "EDUCATION"', () => {
    expect(normaliseIndustry('EDUCATION')).toBe('Education');
  });

  // ── Alias mappings: Fintech ────────────────────────────────────────────

  it('maps "financial technology" → "Fintech"', () => {
    expect(normaliseIndustry('financial technology')).toBe('Fintech');
  });

  it('maps "financial services" → "Fintech"', () => {
    expect(normaliseIndustry('financial services')).toBe('Fintech');
  });

  it('maps "payments" → "Fintech"', () => {
    expect(normaliseIndustry('payments')).toBe('Fintech');
  });

  it('maps "insurtech" → "Fintech"', () => {
    expect(normaliseIndustry('insurtech')).toBe('Fintech');
  });

  it('maps "lending" → "Fintech"', () => {
    expect(normaliseIndustry('lending')).toBe('Fintech');
  });

  it('maps "neobank" → "Fintech"', () => {
    expect(normaliseIndustry('neobank')).toBe('Fintech');
  });

  it('maps "digital banking" → "Fintech"', () => {
    expect(normaliseIndustry('digital banking')).toBe('Fintech');
  });

  // ── Alias mappings: SaaS & Tech ────────────────────────────────────────

  it('maps "software as a service" → "SaaS & Tech"', () => {
    expect(normaliseIndustry('software as a service')).toBe('SaaS & Tech');
  });

  it('maps "saas" → "SaaS & Tech"', () => {
    expect(normaliseIndustry('saas')).toBe('SaaS & Tech');
  });

  it('maps "technology" → "SaaS & Tech"', () => {
    expect(normaliseIndustry('technology')).toBe('SaaS & Tech');
  });

  it('maps "tech" → "SaaS & Tech"', () => {
    expect(normaliseIndustry('tech')).toBe('SaaS & Tech');
  });

  it('maps "software" → "SaaS & Tech"', () => {
    expect(normaliseIndustry('software')).toBe('SaaS & Tech');
  });

  it('maps "it services" → "SaaS & Tech"', () => {
    expect(normaliseIndustry('it services')).toBe('SaaS & Tech');
  });

  // ── Alias mappings: Web3 ───────────────────────────────────────────────

  it('maps "blockchain" → "Web3"', () => {
    expect(normaliseIndustry('blockchain')).toBe('Web3');
  });

  it('maps "cryptocurrency" → "Web3"', () => {
    expect(normaliseIndustry('cryptocurrency')).toBe('Web3');
  });

  it('maps "crypto" → "Web3"', () => {
    expect(normaliseIndustry('crypto')).toBe('Web3');
  });

  it('maps "defi" → "Web3"', () => {
    expect(normaliseIndustry('defi')).toBe('Web3');
  });

  it('maps "nft" → "Web3"', () => {
    expect(normaliseIndustry('nft')).toBe('Web3');
  });

  it('maps "web 3" → "Web3"', () => {
    expect(normaliseIndustry('web 3')).toBe('Web3');
  });

  it('maps "web3" alias → "Web3"', () => {
    expect(normaliseIndustry('web3')).toBe('Web3');
  });

  // ── Alias mappings: Retail & E-Commerce ───────────────────────────────

  it('maps "e-commerce" → "Retail & E-Commerce"', () => {
    expect(normaliseIndustry('e-commerce')).toBe('Retail & E-Commerce');
  });

  it('maps "ecommerce" → "Retail & E-Commerce"', () => {
    expect(normaliseIndustry('ecommerce')).toBe('Retail & E-Commerce');
  });

  it('maps "retail" → "Retail & E-Commerce"', () => {
    expect(normaliseIndustry('retail')).toBe('Retail & E-Commerce');
  });

  it('maps "marketplace" → "Retail & E-Commerce"', () => {
    expect(normaliseIndustry('marketplace')).toBe('Retail & E-Commerce');
  });

  // ── Alias mappings: HR ────────────────────────────────────────────────

  it('maps "human resources" → "HR"', () => {
    expect(normaliseIndustry('human resources')).toBe('HR');
  });

  it('maps "hrtech" → "HR"', () => {
    expect(normaliseIndustry('hrtech')).toBe('HR');
  });

  it('maps "workforce" → "HR"', () => {
    expect(normaliseIndustry('workforce')).toBe('HR');
  });

  it('maps "payroll" → "HR"', () => {
    expect(normaliseIndustry('payroll')).toBe('HR');
  });

  // ── Alias mappings: Gaming ────────────────────────────────────────────

  it('maps "game" → "Gaming"', () => {
    expect(normaliseIndustry('game')).toBe('Gaming');
  });

  it('maps "esports" → "Gaming"', () => {
    expect(normaliseIndustry('esports')).toBe('Gaming');
  });

  // ── Alias mappings: PropTech ──────────────────────────────────────────

  it('maps "real estate" → "PropTech"', () => {
    expect(normaliseIndustry('real estate')).toBe('PropTech');
  });

  it('maps "proptech" alias → "PropTech"', () => {
    expect(normaliseIndustry('proptech')).toBe('PropTech');
  });

  it('maps "property" → "PropTech"', () => {
    expect(normaliseIndustry('property')).toBe('PropTech');
  });

  it('maps "construction" → "PropTech"', () => {
    expect(normaliseIndustry('construction')).toBe('PropTech');
  });

  // ── Alias mappings: Healthcare ────────────────────────────────────────

  it('maps "health" → "Healthcare"', () => {
    expect(normaliseIndustry('health')).toBe('Healthcare');
  });

  it('maps "medtech" → "Healthcare"', () => {
    expect(normaliseIndustry('medtech')).toBe('Healthcare');
  });

  it('maps "healthtech" → "Healthcare"', () => {
    expect(normaliseIndustry('healthtech')).toBe('Healthcare');
  });

  // ── Alias mappings: Utilities ─────────────────────────────────────────

  it('maps "energy" → "Utilities"', () => {
    expect(normaliseIndustry('energy')).toBe('Utilities');
  });

  it('maps "water" → "Utilities"', () => {
    expect(normaliseIndustry('water')).toBe('Utilities');
  });

  // ── Alias mappings: Travel & Mobility ────────────────────────────────

  it('maps "travel" → "Travel & Mobility"', () => {
    expect(normaliseIndustry('travel')).toBe('Travel & Mobility');
  });

  it('maps "mobility" → "Travel & Mobility"', () => {
    expect(normaliseIndustry('mobility')).toBe('Travel & Mobility');
  });

  it('maps "logistics" → "Travel & Mobility"', () => {
    expect(normaliseIndustry('logistics')).toBe('Travel & Mobility');
  });

  it('maps "transportation" → "Travel & Mobility"', () => {
    expect(normaliseIndustry('transportation')).toBe('Travel & Mobility');
  });

  // ── Alias mappings: Education ─────────────────────────────────────────

  it('maps "edtech" → "Education"', () => {
    expect(normaliseIndustry('edtech')).toBe('Education');
  });

  it('maps "learning" → "Education"', () => {
    expect(normaliseIndustry('learning')).toBe('Education');
  });

  // ── Alias mappings: Trad. Finance ─────────────────────────────────────

  it('maps "traditional finance" → "Trad. Finance"', () => {
    expect(normaliseIndustry('traditional finance')).toBe('Trad. Finance');
  });

  it('maps "trad. finance" alias → "Trad. Finance"', () => {
    expect(normaliseIndustry('trad. finance')).toBe('Trad. Finance');
  });

  it('maps "banking" → "Trad. Finance"', () => {
    expect(normaliseIndustry('banking')).toBe('Trad. Finance');
  });

  it('maps "investment" → "Trad. Finance"', () => {
    expect(normaliseIndustry('investment')).toBe('Trad. Finance');
  });

  it('maps "asset management" → "Trad. Finance"', () => {
    expect(normaliseIndustry('asset management')).toBe('Trad. Finance');
  });

  it('maps "capital markets" → "Trad. Finance"', () => {
    expect(normaliseIndustry('capital markets')).toBe('Trad. Finance');
  });

  // ── Case-insensitive alias matching ───────────────────────────────────

  it('maps "PAYMENTS" (uppercase alias) → "Fintech"', () => {
    expect(normaliseIndustry('PAYMENTS')).toBe('Fintech');
  });

  it('maps "Blockchain" (mixed-case alias) → "Web3"', () => {
    expect(normaliseIndustry('Blockchain')).toBe('Web3');
  });

  it('maps "Real Estate" (title-case alias) → "PropTech"', () => {
    expect(normaliseIndustry('Real Estate')).toBe('PropTech');
  });

  it('maps "BANKING" (uppercase alias) → "Trad. Finance"', () => {
    expect(normaliseIndustry('BANKING')).toBe('Trad. Finance');
  });

  // ── Whitespace handling ───────────────────────────────────────────────

  it('trims leading/trailing whitespace: "  fintech  " → "Fintech"', () => {
    expect(normaliseIndustry('  fintech  ')).toBe('Fintech');
  });

  it('trims whitespace: "  banking  " → "Trad. Finance"', () => {
    expect(normaliseIndustry('  banking  ')).toBe('Trad. Finance');
  });

  it('returns null for whitespace-only string "   "', () => {
    expect(normaliseIndustry('   ')).toBeNull();
  });

  it('returns null for empty string ""', () => {
    expect(normaliseIndustry('')).toBeNull();
  });

  // ── Partial match that should NOT match ───────────────────────────────

  it('returns null for "fintechie" (partial, not an alias)', () => {
    expect(normaliseIndustry('fintechie')).toBeNull();
  });

  it('returns null for "saasplatform" (partial, not an alias)', () => {
    expect(normaliseIndustry('saasplatform')).toBeNull();
  });

  it('returns null for "healthcare123" (partial, not an alias)', () => {
    expect(normaliseIndustry('healthcare123')).toBeNull();
  });

  it('returns null for "retailing" (partial, not an alias)', () => {
    expect(normaliseIndustry('retailing')).toBeNull();
  });

  // ── Invalid / non-string inputs → null ───────────────────────────────

  it('returns null for null', () => {
    expect(normaliseIndustry(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normaliseIndustry(undefined)).toBeNull();
  });

  it('returns null for a number (42)', () => {
    expect(normaliseIndustry(42)).toBeNull();
  });

  it('returns null for a plain object', () => {
    expect(normaliseIndustry({ industry: 'fintech' })).toBeNull();
  });

  it('returns null for an array', () => {
    expect(normaliseIndustry(['fintech'])).toBeNull();
  });

  it('returns null for a boolean', () => {
    expect(normaliseIndustry(true)).toBeNull();
  });

  // ── Unrecognised strings → null ───────────────────────────────────────

  it('returns null for a completely unknown string "agriculture"', () => {
    expect(normaliseIndustry('agriculture')).toBeNull();
  });

  it('returns null for "media" (not in alias map or canonicals)', () => {
    expect(normaliseIndustry('media')).toBeNull();
  });
});
