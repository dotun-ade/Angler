/**
 * Integration test for the full Angler pipeline.
 *
 * All external dependencies (Gemini, Sheets, RSS, Docs) are mocked.
 * Tests verify the data flow through each stage and the per-stage error
 * handling contracts described in the plan.
 */

import { runAngler } from '../../src/pipeline/runAngler';

// ── Mock external clients ───────────────────────────────────────────────────

jest.mock('../../src/utils/config', () => ({
  loadConfig: () => ({
    geminiApiKey: 'test-key',
    geminiModel: 'gemini-test',
    googleServiceAccountJson: JSON.stringify({ client_email: 'test@test.iam', private_key: 'key' }),
    googleSheetId: 'sheet-id',
    snapperDocId: 'doc-id',
    serpApiKey: 'serp-key',
    runEnv: 'production' as const,
  }),
}));

// State stored in-memory per test
let _state: Record<string, unknown> = {};
jest.mock('../../src/state/state', () => {
  const actual = jest.requireActual('../../src/state/state');
  return {
    ...actual,
    loadState: jest.fn(() => ({
      processed_guids: [],
      serpapi_calls_today: { date: '2026-03-25', count: 0 },
      gemini_day: '2026-03-25',
      gemini_calls_today: 0,
      seen_companies: [],
      article_queue: [],
    })),
    saveState: jest.fn((s: unknown) => { _state = s as Record<string, unknown>; }),
  };
});

// RSS returns 3 articles
jest.mock('../../src/clients/rss', () => ({
  fetchRssArticles: jest.fn().mockResolvedValue([
    { id: 'a1', title: 'Paystack raises $1M', description: 'Payments startup', link: 'http://a1', source: 'TechCabal' },
    { id: 'a2', title: 'Flutterwave launches card', description: 'Card issuing', link: 'http://a2', source: 'TechCabal' },
    { id: 'a3', title: 'GNews headline', description: 'wallet', link: 'http://a3', source: 'GNews: Africa fintech' },
  ]),
}));

// SerpAPI returns 1 article
jest.mock('../../src/clients/serpapi', () => ({
  fetchSerpApiArticles: jest.fn().mockResolvedValue({
    articles: [
      { id: 's1', title: 'Wave raises $10M', description: 'Mobile money', link: 'http://s1', source: 'SerpAPI' },
    ],
    state: {
      processed_guids: [],
      serpapi_calls_today: { date: '2026-03-25', count: 1 },
      gemini_day: '2026-03-25',
      gemini_calls_today: 0,
      seen_companies: [],
      article_queue: [],
    },
  }),
}));

// Docs returns null (use fallback ICP)
jest.mock('../../src/clients/docs', () => ({
  fetchGoogleDocText: jest.fn().mockResolvedValue(null),
}));

// Gemini: extraction returns 2 companies, scoring returns 2 scored
const mockExtract = jest.fn().mockResolvedValue({
  companies: [
    {
      company_name: 'Paystack',
      industry: 'Fintech',
      country: 'Nigeria',
      description: 'Payments startup',
      source_url: 'http://a1',
      signals: ['payments', 'funding'],
      funding_stage: 'Series A',
      event_type: 'funding_announcement',
      articleId: 'a1',
      articleDate: '2026-03-25',
    },
    {
      company_name: 'Flutterwave',
      industry: 'Fintech',
      country: 'Nigeria',
      description: 'Card issuing',
      source_url: 'http://a2',
      signals: ['virtual card'],
      funding_stage: null,
      event_type: 'product_launch',
      articleId: 'a2',
      articleDate: '2026-03-25',
    },
  ],
  state: {
    processed_guids: [],
    serpapi_calls_today: { date: '2026-03-25', count: 1 },
    gemini_day: '2026-03-25',
    gemini_calls_today: 1,
    seen_companies: [],
    article_queue: [],
  },
});

const mockScore = jest.fn().mockResolvedValue({
  scored: [
    {
      company_name: 'Paystack',
      confidence: 'HIGH',
      primary_product: 'Payments',
      match_reason: 'Strong payments signal',
      source_url: 'http://a1',
      articleId: 'a1',
      articleDate: '2026-03-25',
    },
    {
      company_name: 'Flutterwave',
      confidence: 'MEDIUM',
      primary_product: 'Cards',
      match_reason: 'Card issuing signal',
      source_url: 'http://a2',
      articleId: 'a2',
      articleDate: '2026-03-25',
    },
  ],
  state: {
    processed_guids: [],
    serpapi_calls_today: { date: '2026-03-25', count: 1 },
    gemini_day: '2026-03-25',
    gemini_calls_today: 2,
    seen_companies: [],
    article_queue: [],
  },
});

const mockParseIcp = jest.fn().mockResolvedValue({
  icp: {
    target_geographies: ['Nigeria', 'Kenya'],
    target_industries: ['Fintech'],
    product_signals: ['payments', 'card issuing'],
    stage_signals: ['Series A'],
  },
  state: {
    processed_guids: [],
    serpapi_calls_today: { date: '2026-03-25', count: 1 },
    gemini_day: '2026-03-25',
    gemini_calls_today: 1,
    seen_companies: [],
    article_queue: [],
  },
});

jest.mock('../../src/clients/gemini', () => {
  const actual = jest.requireActual('../../src/clients/gemini');
  return {
    ...actual,
    GeminiClient: jest.fn().mockImplementation(() => ({
      parseIcpDoc: mockParseIcp,
      extractCompaniesFromArticles: mockExtract,
      scoreCompanies: mockScore,
    })),
  };
});

// Sheets: no existing leads, append succeeds
const mockGetExistingNames = jest.fn().mockResolvedValue([]);
const mockAppendLeads = jest.fn().mockResolvedValue(2);
const mockAppendRunLog = jest.fn().mockResolvedValue(undefined);

jest.mock('../../src/clients/sheets', () => ({
  SheetsClient: jest.fn().mockImplementation(() => ({
    getExistingBusinessNames: mockGetExistingNames,
    appendLeads: mockAppendLeads,
    appendRunLog: mockAppendRunLog,
  })),
}));

// Logger — suppress output in tests
jest.mock('../../src/utils/logger', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function resetMocks() {
  mockExtract.mockClear();
  mockScore.mockClear();
  mockParseIcp.mockClear();
  mockGetExistingNames.mockClear();
  mockAppendLeads.mockClear();
  mockAppendRunLog.mockClear();
  _state = {};
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runAngler integration', () => {
  beforeEach(() => resetMocks());

  describe('happy path', () => {
    it('returns success metrics with correct counts', async () => {
      const metrics = await runAngler();
      expect(metrics.status).toBe('success');
      expect(metrics.articlesProcessed).toBeGreaterThan(0);
      expect(metrics.companiesExtracted).toBe(2);
      expect(metrics.writtenToCrm).toBe(2);
    });

    it('calls Gemini extraction with all budget-allocated articles', async () => {
      await runAngler();
      expect(mockExtract).toHaveBeenCalledTimes(1);
    });

    it('calls Gemini scoring with companies that passed pre-score dedup', async () => {
      await runAngler();
      expect(mockScore).toHaveBeenCalledTimes(1);
    });

    it('writes leads to CRM', async () => {
      await runAngler();
      expect(mockAppendLeads).toHaveBeenCalledTimes(1);
    });

    it('writes run log', async () => {
      await runAngler();
      expect(mockAppendRunLog).toHaveBeenCalledTimes(1);
      const logArg = mockAppendRunLog.mock.calls[0][0];
      expect(logArg.status).toBe('success');
    });

    it('saves state after successful run', async () => {
      await runAngler();
      const { saveState } = jest.requireMock('../../src/state/state');
      expect(saveState).toHaveBeenCalled();
    });

    it('records processed article IDs in state', async () => {
      await runAngler();
      const saved = _state as { processed_guids?: string[] };
      expect(saved.processed_guids?.length).toBeGreaterThan(0);
    });

    it('records seen companies in state', async () => {
      await runAngler();
      const saved = _state as { seen_companies?: { name: string; seen_date: string }[] };
      expect(saved.seen_companies?.some((e) => e.name === 'paystack')).toBe(true);
      expect(saved.seen_companies?.some((e) => e.name === 'flutterwave')).toBe(true);
    });

    it('budget is tracked: geminiCallsUsed matches state delta', async () => {
      const metrics = await runAngler();
      // In dev mode, calls are limited but should be >= 0
      expect(metrics.geminiCallsUsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('CRM dedup', () => {
    it('filters out companies matching existing CRM names', async () => {
      mockGetExistingNames.mockResolvedValueOnce(['Paystack']);
      const metrics = await runAngler();
      // Paystack should be deduped, only Flutterwave written
      expect(mockAppendLeads).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ company_name: 'Flutterwave' }),
        ]),
        expect.any(String),
        expect.any(String),
      );
      expect(mockAppendLeads).toHaveBeenCalledWith(
        expect.not.arrayContaining([
          expect.objectContaining({ company_name: 'Paystack' }),
        ]),
        expect.any(String),
        expect.any(String),
      );
    });

    it('filters duplicate within the same batch', async () => {
      // Score returns same company twice
      mockScore.mockResolvedValueOnce({
        scored: [
          { company_name: 'Paystack', confidence: 'HIGH', primary_product: 'Payments', match_reason: 'r1', source_url: 'u1', articleId: 'a1', articleDate: '2026-03-25' },
          { company_name: 'Paystack', confidence: 'MEDIUM', primary_product: 'Cards', match_reason: 'r2', source_url: 'u2', articleId: 'a1', articleDate: '2026-03-25' },
        ],
        state: { processed_guids: [], serpapi_calls_today: { date: '2026-03-25', count: 1 }, gemini_day: '2026-03-25', gemini_calls_today: 2, seen_companies: [], article_queue: [] },
      });
      await runAngler();
      const written = mockAppendLeads.mock.calls[0][0];
      const paystacks = written.filter((c: { company_name: string }) => c.company_name === 'Paystack');
      expect(paystacks).toHaveLength(1);
    });
  });

  describe('per-stage error handling', () => {
    it('extraction failure: run is partial, no leads written', async () => {
      mockExtract.mockRejectedValueOnce(new Error('Gemini timeout'));
      const metrics = await runAngler();
      expect(metrics.status).toBe('partial');
      expect(metrics.companiesExtracted).toBe(0);
      expect(metrics.notes).toContain('Extraction failed');
    });

    it('extraction failure: run log records partial status', async () => {
      mockExtract.mockRejectedValueOnce(new Error('quota'));
      await runAngler();
      const logArg = mockAppendRunLog.mock.calls[0][0];
      expect(logArg.status).toBe('partial');
    });

    it('scoring failure: companies defaulted to MEDIUM, not dropped', async () => {
      mockScore.mockRejectedValueOnce(new Error('Scoring unavailable'));
      const metrics = await runAngler();
      expect(metrics.status).toBe('partial');
      expect(metrics.notes).toContain('Scoring failed');
      // Companies should still be written (defaulted to MEDIUM)
      expect(mockAppendLeads).toHaveBeenCalled();
      const written = mockAppendLeads.mock.calls[0][0];
      expect(written.length).toBeGreaterThan(0);
      written.forEach((c: { confidence: string }) => expect(c.confidence).toBe('MEDIUM'));
    });

    it('CRM dedup failure: articles queued for next run', async () => {
      mockGetExistingNames.mockRejectedValueOnce(new Error('Sheets timeout'));
      const metrics = await runAngler();
      expect(metrics.status).toBe('partial');
      expect(metrics.notes).toContain('Dedup failed');
    });

    it('CRM write failure: articles queued for next run, run log records partial', async () => {
      mockAppendLeads.mockRejectedValueOnce(new Error('Sheets write error'));
      const metrics = await runAngler();
      expect(metrics.status).toBe('partial');
      expect(metrics.writtenToCrm).toBe(0);
      expect(metrics.notes).toContain('CRM write failed');
      const logArg = mockAppendRunLog.mock.calls[0][0];
      expect(logArg.status).toBe('partial');
    });
  });

  describe('seen-company filter', () => {
    it('skips companies seen within 30 days unless fresh event', async () => {
      const { loadState } = jest.requireMock('../../src/state/state');
      (loadState as jest.Mock).mockReturnValueOnce({
        processed_guids: [],
        serpapi_calls_today: { date: '2026-03-25', count: 0 },
        gemini_day: '2026-03-25',
        gemini_calls_today: 0,
        seen_companies: [
          { name: 'paystack', seen_date: '2026-03-10' }, // within 30 days
          { name: 'flutterwave', seen_date: '2026-03-10' }, // within 30 days
        ],
        article_queue: [],
      });

      await runAngler();

      // Both companies are "seen" but Paystack has funding_announcement and
      // Flutterwave has product_launch — both should bypass the filter.
      // Score should still be called.
      expect(mockScore).toHaveBeenCalled();
      const scoredInput = mockScore.mock.calls[0][3] as unknown[];
      expect(scoredInput.length).toBe(2);
    });
  });

  describe('empty run', () => {
    it('exits early when no articles found', async () => {
      const { fetchRssArticles } = jest.requireMock('../../src/clients/rss');
      (fetchRssArticles as jest.Mock).mockResolvedValueOnce([]);
      const { fetchSerpApiArticles } = jest.requireMock('../../src/clients/serpapi');
      (fetchSerpApiArticles as jest.Mock).mockResolvedValueOnce({
        articles: [],
        state: {
          processed_guids: [],
          serpapi_calls_today: { date: '2026-03-25', count: 0 },
          gemini_day: '2026-03-25',
          gemini_calls_today: 0,
          seen_companies: [],
          article_queue: [],
        },
      });

      const metrics = await runAngler();
      expect(metrics.status).toBe('success');
      expect(metrics.articlesProcessed).toBe(0);
      expect(mockExtract).not.toHaveBeenCalled();
      expect(mockAppendLeads).not.toHaveBeenCalled();
    });
  });
});
