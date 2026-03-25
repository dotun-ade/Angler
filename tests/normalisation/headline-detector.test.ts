import { isLikelyHeadline } from '../../src/normalisation/headline-detector';

describe('isLikelyHeadline', () => {
  // Valid short company names -> false
  it('returns false for single-word company name "Paystack"', () => {
    expect(isLikelyHeadline('Paystack')).toBe(false);
  });

  it('returns false for single-word company name "Flutterwave"', () => {
    expect(isLikelyHeadline('Flutterwave')).toBe(false);
  });

  it('returns false for single-word company name "Wave"', () => {
    expect(isLikelyHeadline('Wave')).toBe(false);
  });

  it('returns false for single-word company name "OPay"', () => {
    expect(isLikelyHeadline('OPay')).toBe(false);
  });

  it('returns false for single-word company name "PalmPay"', () => {
    expect(isLikelyHeadline('PalmPay')).toBe(false);
  });

  it('returns false for two-word company name "Carbon Finance"', () => {
    expect(isLikelyHeadline('Carbon Finance')).toBe(false);
  });

  // Clear headlines -> true
  it('returns true for a clear funding headline (9 words)', () => {
    expect(isLikelyHeadline('Nigerian Fintech Paystack Raises $200M in Series B Funding')).toBe(true);
  });

  it('returns true for a clear launch headline (8 words)', () => {
    expect(isLikelyHeadline('TechCabal Launches New Journalism Fellowship for African Reporters')).toBe(true);
  });

  it('returns true for a headline with "acquired"', () => {
    expect(isLikelyHeadline('Stripe Acquired Nigerian Payment Startup Paystack Last Year')).toBe(true);
  });

  it('returns true for a headline with "announces"', () => {
    expect(isLikelyHeadline('Central Bank of Nigeria Announces New Fintech Regulation Framework')).toBe(true);
  });

  it('returns true for a headline with "secures"', () => {
    expect(isLikelyHeadline('Kenyan Agritech Startup Secures $10M Series A Round')).toBe(true);
  });

  it('returns true for a headline with "expands"', () => {
    expect(isLikelyHeadline('PalmPay Expands Operations to Three New African Countries')).toBe(true);
  });

  it('returns true for a headline with "partners"', () => {
    expect(isLikelyHeadline('Flutterwave Partners with Visa to Launch New Card Product')).toBe(true);
  });

  it('returns true for a headline with "unveiled"', () => {
    expect(isLikelyHeadline('Google Unveiled New AI Tools for African Developers Today')).toBe(true);
  });

  // Short string with headline verb -> false
  it('returns false for "Raises Financial" (2 words, has verb but too short)', () => {
    expect(isLikelyHeadline('Raises Financial')).toBe(false);
  });

  it('returns false for "Launches Inc" (2 words)', () => {
    expect(isLikelyHeadline('Launches Inc')).toBe(false);
  });

  it('returns false for "Acquired Corp" (2 words)', () => {
    expect(isLikelyHeadline('Acquired Corp')).toBe(false);
  });

  // 4-word string with headline verb -> true (> 3 words AND contains verb)
  it('returns true for "Startup Raises Series A" (4 words with verb)', () => {
    expect(isLikelyHeadline('Startup Raises Series A')).toBe(true);
  });

  it('returns true for "Fintech Launches New Product" (4 words with verb)', () => {
    expect(isLikelyHeadline('Fintech Launches New Product')).toBe(true);
  });

  it('returns true for "Company Wins Big Award" (4 words with verb)', () => {
    expect(isLikelyHeadline('Company Wins Big Award')).toBe(true);
  });

  // Question mark -> true
  it('returns true for a question headline', () => {
    expect(isLikelyHeadline('Will African Fintechs Dominate Payments?')).toBe(true);
  });

  it('returns true for any string ending with ?', () => {
    expect(isLikelyHeadline('Is this a headline?')).toBe(true);
  });

  it('returns true for a short question', () => {
    expect(isLikelyHeadline('Why?')).toBe(true);
  });

  // More than 6 words alone is a headline (company names never this long)
  it('returns true for 7 words without a headline verb', () => {
    expect(isLikelyHeadline('The Quick Brown Fox Jumps Over Dogs')).toBe(true);
  });

  it('returns true for 8 words without a headline verb', () => {
    expect(isLikelyHeadline('One Two Three Four Five Six Seven Eight')).toBe(true);
  });

  // Edge cases
  it('returns false for empty string', () => {
    expect(isLikelyHeadline('')).toBe(false);
  });

  it('returns false for single word', () => {
    expect(isLikelyHeadline('Startup')).toBe(false);
  });

  it('returns false for 3-word name without verb', () => {
    expect(isLikelyHeadline('Wave Financial Group')).toBe(false);
  });

  it('returns false for 3-word name with no verb', () => {
    expect(isLikelyHeadline('First Bank Nigeria')).toBe(false);
  });

  // 3 words with headline verb — boundary: > 3 required, so 3 words should be false
  it('returns false for exactly 3 words with a headline verb', () => {
    // "Startup Raises Funding" — 3 words, NOT > 3, so false
    expect(isLikelyHeadline('Startup Raises Funding')).toBe(false);
  });

  // Case-insensitivity: verbs should match regardless of case
  it('matches headline verbs case-insensitively', () => {
    expect(isLikelyHeadline('Nigeria Startup RAISES Big Series A')).toBe(true);
  });
});
