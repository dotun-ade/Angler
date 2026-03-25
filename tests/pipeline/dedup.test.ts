import {
  batchPreDedup,
  seenCompanyFilter,
  crmDedup,
  withinBatchDedup,
} from '../../src/pipeline/dedup';
import { ExtractedCompany, ScoredCompany } from '../../src/clients/gemini';
import { SeenCompanyEntry } from '../../src/state/state';

jest.mock('../../src/utils/logger', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

import { logWarn } from '../../src/utils/logger';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeExtracted(
  company_name: string,
  signals: string[] = [],
  event_type: ExtractedCompany['event_type'] = 'other',
): ExtractedCompany {
  return {
    company_name,
    industry: null,
    country: null,
    description: 'A test company',
    source_url: 'https://example.com/article',
    signals,
    funding_stage: null,
    event_type,
    articleId: undefined,
    articleDate: undefined,
    website: null,
  };
}

function makeScored(company_name: string): ScoredCompany {
  return {
    company_name,
    confidence: 'HIGH',
    primary_product: 'Payments',
    match_reason: 'Test match reason',
    source_url: 'https://example.com/article',
    articleId: undefined,
    articleDate: undefined,
    country: null,
    industry: null,
    website: null,
  };
}

function makeSeen(name: string, seen_date: string): SeenCompanyEntry {
  return { name, seen_date };
}

// ---------------------------------------------------------------------------
// batchPreDedup
// ---------------------------------------------------------------------------

describe('batchPreDedup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('test 1: returns empty array for empty input', () => {
    expect(batchPreDedup([])).toEqual([]);
  });

  it('test 2: returns single company as-is', () => {
    const company = makeExtracted('Paystack', ['payments']);
    const result = batchPreDedup([company]);
    expect(result).toHaveLength(1);
    expect(result[0].company_name).toBe('Paystack');
  });

  it('test 3: deduplicates identical names keeping the one with more signals', () => {
    const fewer = makeExtracted('Flutterwave', ['payments']);
    const more = makeExtracted('Flutterwave', ['payments', 'cards', 'wallet']);
    const result = batchPreDedup([fewer, more]);
    expect(result).toHaveLength(1);
    expect(result[0].signals).toHaveLength(3);
  });

  it('test 4: same signal count — keeps the first occurrence', () => {
    const first = makeExtracted('Mono', ['banking']);
    first.description = 'First';
    const second = makeExtracted('Mono', ['cards']);
    second.description = 'Second';
    const result = batchPreDedup([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('First');
  });

  it('test 5: three different company names — all returned', () => {
    const companies = [
      makeExtracted('Paystack'),
      makeExtracted('Flutterwave'),
      makeExtracted('Mono'),
    ];
    const result = batchPreDedup(companies);
    expect(result).toHaveLength(3);
  });

  it('test 6: case-insensitive dedup ("Paystack" vs "paystack")', () => {
    const a = makeExtracted('Paystack', ['payments', 'cards']);
    const b = makeExtracted('paystack', ['wallet']);
    const result = batchPreDedup([a, b]);
    expect(result).toHaveLength(1);
    // a has more signals (2 > 1) so a is kept
    expect(result[0].company_name).toBe('Paystack');
  });

  it('test 6b: trims whitespace before case-insensitive comparison', () => {
    const a = makeExtracted('  Flutterwave  ', ['payments']);
    const b = makeExtracted('flutterwave', ['payments', 'cards']);
    const result = batchPreDedup([a, b]);
    expect(result).toHaveLength(1);
    // b has more signals (2 > 1)
    expect(result[0].signals).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// seenCompanyFilter
// ---------------------------------------------------------------------------

describe('seenCompanyFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const TODAY = '2026-03-25';
  // 30-day cutoff: 2026-02-23

  it('test 7: company not in seen list → goes to toScore', () => {
    const companies = [makeExtracted('Paystack')];
    const seen: SeenCompanyEntry[] = [];
    const { toScore, skipped } = seenCompanyFilter(companies, seen, TODAY);
    expect(toScore).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it('test 8: company seen 20 days ago (within TTL) → skipped', () => {
    // 20 days before 2026-03-25 = 2026-03-05
    const companies = [makeExtracted('Paystack')];
    const seen = [makeSeen('paystack', '2026-03-05')];
    const { toScore, skipped } = seenCompanyFilter(companies, seen, TODAY);
    expect(toScore).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });

  it('test 9: company seen 35 days ago (outside TTL) → goes to toScore', () => {
    // 35 days before 2026-03-25 = 2026-02-18
    const companies = [makeExtracted('Paystack')];
    const seen = [makeSeen('paystack', '2026-02-18')];
    const { toScore, skipped } = seenCompanyFilter(companies, seen, TODAY);
    expect(toScore).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it('test 10: company seen 25 days ago with event_type "funding_announcement" → bypasses filter', () => {
    // 25 days before 2026-03-25 = 2026-02-28
    const companies = [makeExtracted('Paystack', [], 'funding_announcement')];
    const seen = [makeSeen('paystack', '2026-02-28')];
    const { toScore, skipped } = seenCompanyFilter(companies, seen, TODAY);
    expect(toScore).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it('test 11: company seen 25 days ago with event_type "product_launch" → bypasses filter', () => {
    const companies = [makeExtracted('Paystack', [], 'product_launch')];
    const seen = [makeSeen('paystack', '2026-02-28')];
    const { toScore, skipped } = seenCompanyFilter(companies, seen, TODAY);
    expect(toScore).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it('test 12: company seen 25 days ago with event_type "other" → skipped', () => {
    const companies = [makeExtracted('Paystack', [], 'other')];
    const seen = [makeSeen('paystack', '2026-02-28')];
    const { toScore, skipped } = seenCompanyFilter(companies, seen, TODAY);
    expect(toScore).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });

  it('test 13: mixed batch — correct split between seen, new, and fresh events', () => {
    const newCompany = makeExtracted('Mono', [], 'other');
    const seenCompany = makeExtracted('Flutterwave', [], 'other');
    const freshEvent = makeExtracted('Paystack', [], 'funding_announcement');
    const oldSeen = makeExtracted('OldCo', [], 'other');

    const seen = [
      makeSeen('flutterwave', '2026-03-05'), // within TTL → skipped
      makeSeen('oldco', '2026-02-18'),        // outside TTL → re-enters
    ];

    const { toScore, skipped } = seenCompanyFilter(
      [newCompany, seenCompany, freshEvent, oldSeen],
      seen,
      TODAY,
    );

    // mono (new) + freshEvent (funding) + oldco (outside TTL) → 3 toScore
    expect(toScore).toHaveLength(3);
    // flutterwave → 1 skipped
    expect(skipped).toHaveLength(1);
    expect(skipped[0].company_name).toBe('Flutterwave');
  });

  it('test 14: empty seen list → all go to toScore', () => {
    const companies = [
      makeExtracted('A'),
      makeExtracted('B'),
      makeExtracted('C'),
    ];
    const { toScore, skipped } = seenCompanyFilter(companies, [], TODAY);
    expect(toScore).toHaveLength(3);
    expect(skipped).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// crmDedup
// ---------------------------------------------------------------------------

describe('crmDedup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('test 15: company with no similar CRM entry → passes', () => {
    const companies = [makeScored('Paystack')];
    const existing = ['Flutterwave', 'Mono'];
    const { passed, filtered } = crmDedup(companies, existing);
    expect(passed).toHaveLength(1);
    expect(filtered).toHaveLength(0);
  });

  it('test 16: company with exact name match → filtered', () => {
    const companies = [makeScored('Paystack')];
    const existing = ['Paystack'];
    const { passed, filtered } = crmDedup(companies, existing);
    expect(passed).toHaveLength(0);
    expect(filtered).toHaveLength(1);
  });

  it('test 17: company with 85% similarity to CRM entry → filtered', () => {
    // "Paystack" vs "Paystacks" → very high similarity
    const companies = [makeScored('Paystacks')];
    const existing = ['Paystack'];
    const { passed, filtered } = crmDedup(companies, existing);
    // 8 chars vs 9 chars, distance=1 → (9-1)/9 ≈ 88.9% > 80%
    expect(filtered).toHaveLength(1);
    expect(passed).toHaveLength(0);
  });

  it('test 18: company with ~75% similarity → passes with near-miss warning', () => {
    // "Anchoria" (8) vs "Anchor" (6): distance=2, maxLen=8 → (8-2)/8=75%
    const companies = [makeScored('Anchoria')];
    const existing = ['Anchor'];
    const { passed, filtered } = crmDedup(companies, existing);
    expect(passed).toHaveLength(1);
    expect(filtered).toHaveLength(0);
    expect(logWarn).toHaveBeenCalledWith(
      'Near-miss CRM dedup',
      expect.objectContaining({ company: 'Anchoria' }),
    );
  });

  it('test 19: company with ~50% similarity → passes with no warning', () => {
    const companies = [makeScored('Paystack')];
    // "Paystack" vs "Mono" — very different → low similarity
    const existing = ['Mono'];
    const { passed, filtered } = crmDedup(companies, existing);
    expect(passed).toHaveLength(1);
    expect(filtered).toHaveLength(0);
    expect(logWarn).not.toHaveBeenCalled();
  });

  it('test 20: empty existingNames → all pass', () => {
    const companies = [makeScored('Paystack'), makeScored('Flutterwave')];
    const { passed, filtered } = crmDedup(companies, []);
    expect(passed).toHaveLength(2);
    expect(filtered).toHaveLength(0);
  });

  it('test 20b: custom threshold respected — filters at 90% but not 80%', () => {
    // "Paystacks" vs "Paystack" → ~88.9% similarity
    const companies = [makeScored('Paystacks')];
    const existing = ['Paystack'];

    // At threshold=90, 88.9% does NOT exceed threshold → should pass
    const { passed: passedHigh, filtered: filteredHigh } = crmDedup(companies, existing, 90);
    expect(passedHigh).toHaveLength(1);
    expect(filteredHigh).toHaveLength(0);

    jest.clearAllMocks();

    // At threshold=80 (default), 88.9% DOES exceed threshold → should filter
    const { passed: passedLow, filtered: filteredLow } = crmDedup(companies, existing, 80);
    expect(passedLow).toHaveLength(0);
    expect(filteredLow).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// withinBatchDedup
// ---------------------------------------------------------------------------

describe('withinBatchDedup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('test 21: no duplicates → all pass', () => {
    const companies = [makeScored('Paystack'), makeScored('Flutterwave'), makeScored('Mono')];
    const { passed, filtered } = withinBatchDedup(companies);
    expect(passed).toHaveLength(3);
    expect(filtered).toHaveLength(0);
  });

  it('test 22: same name twice (exact) → first passes, second filtered', () => {
    const companies = [makeScored('Paystack'), makeScored('Paystack')];
    const { passed, filtered } = withinBatchDedup(companies);
    expect(passed).toHaveLength(1);
    expect(filtered).toHaveLength(1);
    expect(passed[0].company_name).toBe('Paystack');
  });

  it('test 23: 85%+ similar names → second filtered', () => {
    // "Paystacks" vs "Paystack" → ~88.9% similarity
    const companies = [makeScored('Paystack'), makeScored('Paystacks')];
    const { passed, filtered } = withinBatchDedup(companies);
    expect(passed).toHaveLength(1);
    expect(filtered).toHaveLength(1);
    expect(passed[0].company_name).toBe('Paystack');
  });

  it('test 24: ~75% similar names → second passes with near-miss warning', () => {
    // "Anchoria" vs "Anchor" → 75% similarity (just under 80% threshold)
    const companies = [makeScored('Anchor'), makeScored('Anchoria')];
    const { passed, filtered } = withinBatchDedup(companies);
    expect(passed).toHaveLength(2);
    expect(filtered).toHaveLength(0);
    expect(logWarn).toHaveBeenCalledWith(
      'Near-miss within-batch dedup',
      expect.objectContaining({ company: 'Anchoria' }),
    );
  });

  it('test 25: first two similar (second filtered), third different (passes)', () => {
    const companies = [
      makeScored('Paystack'),
      makeScored('Paystacks'), // ~88.9% similar to Paystack → filtered
      makeScored('Mono'),      // different → passes
    ];
    const { passed, filtered } = withinBatchDedup(companies);
    expect(passed).toHaveLength(2);
    expect(filtered).toHaveLength(1);
    expect(passed.map((c) => c.company_name)).toEqual(['Paystack', 'Mono']);
    expect(filtered[0].company_name).toBe('Paystacks');
  });

  it('test 26: processes in order — first occurrence wins', () => {
    const first = makeScored('Alpha Corp');
    first.confidence = 'HIGH';
    const second = makeScored('Alpha Corp');
    second.confidence = 'MEDIUM';
    const { passed, filtered } = withinBatchDedup([first, second]);
    expect(passed).toHaveLength(1);
    expect(passed[0].confidence).toBe('HIGH');
  });

  it('test 27: custom threshold respected', () => {
    // "Anchoria" vs "Anchor" → 75% similarity
    // At threshold=70, 75% > 70 → filtered
    const companies = [makeScored('Anchor'), makeScored('Anchoria')];
    const { passed, filtered } = withinBatchDedup(companies, 70);
    expect(passed).toHaveLength(1);
    expect(filtered).toHaveLength(1);
  });

  it('test 28: single company → passes', () => {
    const { passed, filtered } = withinBatchDedup([makeScored('Paystack')]);
    expect(passed).toHaveLength(1);
    expect(filtered).toHaveLength(0);
  });

  it('test 29: empty input → empty output', () => {
    const { passed, filtered } = withinBatchDedup([]);
    expect(passed).toHaveLength(0);
    expect(filtered).toHaveLength(0);
  });
});
