import {
  industryPromptList,
  countryPromptList,
  productPromptList,
} from '../../src/utils/prompt-helpers';

// ──────────────────────────────────────────────────────────────────────────────
// industryPromptList()
// ──────────────────────────────────────────────────────────────────────────────

describe('industryPromptList()', () => {
  it('returns a string', () => {
    expect(typeof industryPromptList()).toBe('string');
  });

  it('is non-empty', () => {
    expect(industryPromptList().length).toBeGreaterThan(0);
  });

  it('is not null or undefined', () => {
    const result = industryPromptList();
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
  });

  it('contains all 12 canonical industry keys', () => {
    const result = industryPromptList();
    const canonicals = [
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
    for (const canonical of canonicals) {
      expect(result).toContain(canonical);
    }
  });

  it('each entry has a canonical key and a parenthesised description', () => {
    const result = industryPromptList();
    const lines = result.split('\n').filter((l: string) => l.trim().startsWith('-'));
    expect(lines.length).toBe(12);
    for (const line of lines) {
      // Should contain at least a parenthesised description
      expect(line).toMatch(/\(.+\)/);
    }
  });

  it('contains disambiguation examples for Fintech entry (payments, lending, banking)', () => {
    const result = industryPromptList();
    const lines = result.split('\n');
    const fintechLine = lines.find((l: string) => l.includes('Fintech'));
    expect(fintechLine).toBeDefined();
    expect(fintechLine!.toLowerCase()).toMatch(/payment/);
    expect(fintechLine!.toLowerCase()).toMatch(/lending|bank/);
  });

  it('contains "payroll" in the HR entry', () => {
    const result = industryPromptList();
    const lines = result.split('\n');
    const hrLine = lines.find((l: string) => /\bHR\b/.test(l));
    expect(hrLine).toBeDefined();
    expect(hrLine!.toLowerCase()).toContain('payroll');
  });

  it('contains blockchain/crypto in Web3 entry', () => {
    const result = industryPromptList();
    const lines = result.split('\n');
    const web3Line = lines.find((l: string) => l.includes('Web3'));
    expect(web3Line).toBeDefined();
    expect(web3Line!.toLowerCase()).toMatch(/blockchain|crypto/);
  });

  it('contains real estate or property in PropTech entry', () => {
    const result = industryPromptList();
    const lines = result.split('\n');
    const proptechLine = lines.find((l: string) => l.includes('PropTech'));
    expect(proptechLine).toBeDefined();
    expect(proptechLine!.toLowerCase()).toMatch(/real estate|property/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// countryPromptList()
// ──────────────────────────────────────────────────────────────────────────────

describe('countryPromptList()', () => {
  it('returns a string', () => {
    expect(typeof countryPromptList()).toBe('string');
  });

  it('is non-empty', () => {
    expect(countryPromptList().length).toBeGreaterThan(0);
  });

  it('is not null or undefined', () => {
    const result = countryPromptList();
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
  });

  it('contains NG (Nigeria)', () => {
    expect(countryPromptList()).toContain('NG');
  });

  it('contains KE (Kenya)', () => {
    expect(countryPromptList()).toContain('KE');
  });

  it('contains ZA (South Africa)', () => {
    expect(countryPromptList()).toContain('ZA');
  });

  it('contains EG (Egypt)', () => {
    expect(countryPromptList()).toContain('EG');
  });

  it('contains AE (UAE)', () => {
    expect(countryPromptList()).toContain('AE');
  });

  it('contains GB (United Kingdom)', () => {
    expect(countryPromptList()).toContain('GB');
  });

  it('contains US (United States)', () => {
    expect(countryPromptList()).toContain('US');
  });

  it('contains regional groupings', () => {
    const result = countryPromptList();
    expect(result).toMatch(/West Africa/i);
    expect(result).toMatch(/East Africa/i);
    expect(result).toMatch(/North Africa/i);
    expect(result).toMatch(/Southern Africa/i);
    expect(result).toMatch(/Middle East/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// productPromptList()
// ──────────────────────────────────────────────────────────────────────────────

describe('productPromptList()', () => {
  it('returns a string', () => {
    expect(typeof productPromptList()).toBe('string');
  });

  it('is non-empty', () => {
    expect(productPromptList().length).toBeGreaterThan(0);
  });

  it('is not null or undefined', () => {
    const result = productPromptList();
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
  });

  it('contains all 7 Anchor products', () => {
    const result = productPromptList();
    const products = [
      'Payments',
      'Virtual Accounts',
      'BaaS',
      'Cards',
      'Global Services',
      'Business Banking',
      'Digizone',
    ];
    for (const product of products) {
      expect(result).toContain(product);
    }
  });

  it('each product entry has a description', () => {
    const result = productPromptList();
    const lines = result.split('\n').filter((l: string) => l.trim().startsWith('-'));
    expect(lines.length).toBe(7);
    for (const line of lines) {
      // Each product line should have meaningful content beyond just the name
      expect(line.length).toBeGreaterThan(20);
    }
  });

  it('each canonical product from normaliseProduct() appears in the output', () => {
    const result = productPromptList();
    // Canonical products from product.ts
    const canonicalProducts = [
      'Cards',
      'BaaS',
      'Payments',
      'Business Banking',
      'Virtual Accounts',
      'Global Services',
      'Digizone',
    ];
    for (const product of canonicalProducts) {
      expect(result).toContain(product);
    }
  });

  it('Virtual Accounts entry mentions reconciliation or marketplace context', () => {
    const result = productPromptList();
    const lines = result.split('\n');
    const vaLine = lines.find((l: string) => l.includes('Virtual Accounts'));
    expect(vaLine).toBeDefined();
    expect(vaLine!.toLowerCase()).toMatch(/reconcil|marketplace|aggregator/);
  });

  it('Payments entry mentions African fintechs or disbursing or collecting', () => {
    const result = productPromptList();
    const lines = result.split('\n');
    const paymentsLine = lines.find((l: string) => /^- Payments/.test(l.trim()));
    expect(paymentsLine).toBeDefined();
    expect(paymentsLine!.toLowerCase()).toMatch(/african|disburs|collect/);
  });

  it('Cards entry mentions Nigeria or virtual dollar cards', () => {
    const result = productPromptList();
    const lines = result.split('\n');
    const cardsLine = lines.find((l: string) => /^- Cards/.test(l.trim()));
    expect(cardsLine).toBeDefined();
    expect(cardsLine!.toLowerCase()).toMatch(/nigeria|virtual.*card|dollar/);
  });
});
