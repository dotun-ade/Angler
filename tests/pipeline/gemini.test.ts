/**
 * tests/pipeline/gemini.test.ts
 *
 * Phase 2 TDD: Gemini extraction and scoring pipeline hardening.
 * All tests written BEFORE the implementation changes to gemini.ts.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiClient, ExtractedCompany, ScoredCompany, IcpCriteria, VALID_PRIMARY_PRODUCTS } from '../../src/clients/gemini';
import { AnglerConfig } from '../../src/utils/config';
import { AnglerState } from '../../src/state/state';

// ─── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}));

jest.mock('../../src/utils/logger', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

// ─── Test helpers ──────────────────────────────────────────────────────────────

let mockGenerateContent: jest.Mock;

beforeEach(() => {
  mockGenerateContent = jest.fn();
  (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockImplementation(mockGenerateContent),
    }),
  }));
});

afterEach(() => {
  jest.clearAllMocks();
});

const makeConfig = (): AnglerConfig => ({
  geminiApiKey: 'test-key',
  geminiModel: 'gemini-test-model',
  googleSheetId: 'sheet-id',
  googleServiceAccountJson: '{}',
  serpApiKey: 'serp-key',
  snapperDocId: 'doc-id',
  runEnv: 'production',
});

/**
 * A state that allows Gemini calls (production env, 0 calls used today).
 */
const makeAllowedState = (): AnglerState => ({
  processed_guids: [],
  serpapi_calls_today: { date: '2026-03-25', count: 0 },
  gemini_day: new Date().toISOString().slice(0, 10),
  gemini_calls_today: 0,
  seen_companies: [],
  article_queue: [],
});

/**
 * A state that has already exhausted the Gemini budget for development env.
 * runEnv=development cap is 2; set calls to 2.
 */
const makeExhaustedState = (): AnglerState => ({
  processed_guids: [],
  serpapi_calls_today: { date: '2026-03-25', count: 0 },
  gemini_day: new Date().toISOString().slice(0, 10),
  gemini_calls_today: 2,
  seen_companies: [],
  article_queue: [],
});

const makeDevConfig = (): AnglerConfig => ({
  ...makeConfig(),
  runEnv: 'development',
});

const makeArticle = (overrides: Partial<{ id: string; title: string; description: string; link: string; pubDate?: string; source: string }> = {}) => ({
  id: overrides.id ?? 'article-1',
  title: overrides.title ?? 'Test Article',
  description: overrides.description ?? 'A test article description.',
  link: overrides.link ?? 'https://example.com/article-1',
  pubDate: overrides.pubDate ?? '2026-03-25',
  source: overrides.source ?? 'TestFeed',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeGeminiExtractionResponse = (companies: any[]) => ({
  response: {
    text: () => JSON.stringify(companies),
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeGeminiScoringResponse = (companies: any[]) => ({
  response: {
    text: () => JSON.stringify(companies),
  },
});

const FALLBACK_ICP: IcpCriteria = {
  target_geographies: ['Nigeria'],
  target_industries: ['Fintech'],
  product_signals: ['payments'],
  stage_signals: ['seed'],
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('GeminiClient.extractCompaniesFromArticles', () => {

  // ── Sanitisation ─────────────────────────────────────────────────────────────

  describe('sanitisation', () => {
    it('should not crash when article title contains double-quote characters', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle({ title: 'Company "XYZ" Raises $10M' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([]),
      );

      await expect(
        client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]),
      ).resolves.not.toThrow();

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('should not crash when article title contains curly braces', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle({ title: '{Special} Article {Title}' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([]),
      );

      await expect(
        client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]),
      ).resolves.not.toThrow();
    });

    it('should truncate long descriptions (over 2000 chars) before injecting into prompt', async () => {
      const client = new GeminiClient(makeConfig());
      const longDesc = 'A'.repeat(5000);
      const article = makeArticle({ description: longDesc });

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([]),
      );

      await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      const prompt = mockGenerateContent.mock.calls[0][0] as string;
      // The sanitised description should be 2000 chars, not 5000
      expect(prompt).not.toContain('A'.repeat(2001));
    });
  });

  // ── Post-extraction normalisation: country ─────────────────────────────────

  describe('country normalisation', () => {
    it('should normalise "Nigeria" to "NG"', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'Paystack',
          country: 'Nigeria',
          description: 'A payment company.',
          source_url: article.link,
          signals: ['payments'],
          funding_stage: 'seed',
          event_type: 'funding_announcement',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(1);
      expect(companies[0].country).toBe('NG');
    });

    it('should normalise "United States" to "US"', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'AcmeCorp',
          country: 'United States',
          description: 'A US company.',
          source_url: article.link,
          signals: ['payments'],
          funding_stage: null,
          event_type: 'other',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(1);
      expect(companies[0].country).toBe('US');
    });

    it('should return null for an unrecognised country like "Narnia"', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'NarniaFintech',
          country: 'Narnia',
          description: 'A fictional company.',
          source_url: article.link,
          signals: ['payments'],
          funding_stage: null,
          event_type: 'other',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(1);
      expect(companies[0].country).toBeNull();
    });

    it('should preserve null country when Gemini returns null', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'SomeCompany',
          country: null,
          description: 'Company with unknown country.',
          source_url: article.link,
          signals: [],
          funding_stage: null,
          event_type: 'other',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(1);
      expect(companies[0].country).toBeNull();
    });
  });

  // ── Post-extraction normalisation: industry ────────────────────────────────

  describe('industry normalisation', () => {
    it('should normalise "Financial Technology" to "Fintech"', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'FintechCo',
          industry: 'Financial Technology',
          country: 'NG',
          description: 'A fintech company.',
          source_url: article.link,
          signals: ['payments'],
          funding_stage: 'seed',
          event_type: 'funding_announcement',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(1);
      expect(companies[0].industry).toBe('Fintech');
    });

    it('should return null industry for unrecognised value "garbage_industry_xyz"', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'WeirdCo',
          industry: 'garbage_industry_xyz',
          country: 'NG',
          description: 'A company with unknown industry.',
          source_url: article.link,
          signals: [],
          funding_stage: null,
          event_type: 'other',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(1);
      expect(companies[0].industry).toBeNull();
    });

    it('should preserve a canonical industry value "Fintech" as-is', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'FintechCo',
          industry: 'Fintech',
          country: 'NG',
          description: 'A fintech company.',
          source_url: article.link,
          signals: ['payments'],
          funding_stage: 'seed',
          event_type: 'funding_announcement',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(1);
      expect(companies[0].industry).toBe('Fintech');
    });

    it('should normalise industry null to null', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'SomeCo',
          industry: null,
          country: 'NG',
          description: 'Company with null industry.',
          source_url: article.link,
          signals: [],
          funding_stage: null,
          event_type: 'other',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(1);
      expect(companies[0].industry).toBeNull();
    });
  });

  // ── Post-extraction normalisation: funding_stage ───────────────────────────

  describe('funding_stage normalisation', () => {
    it('should normalise "Series A" to canonical value', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'SeriesACo',
          country: 'NG',
          description: 'A Series A company.',
          source_url: article.link,
          signals: ['funding'],
          funding_stage: 'Series A',
          event_type: 'funding_announcement',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(1);
      // normaliseFundingStage('Series A') → 'series_a'
      expect(companies[0].funding_stage).toBe('series_a');
    });

    it('should return null for invalid funding stage "invalid_stage"', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'BadStageCo',
          country: 'NG',
          description: 'A company.',
          source_url: article.link,
          signals: [],
          funding_stage: 'invalid_stage',
          event_type: 'other',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(1);
      expect(companies[0].funding_stage).toBeNull();
    });

    it('should normalise "seed round" to canonical seed', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'SeedCo',
          country: 'KE',
          description: 'A seed-stage company.',
          source_url: article.link,
          signals: ['seed funding'],
          funding_stage: 'seed round',
          event_type: 'funding_announcement',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(1);
      expect(companies[0].funding_stage).toBe('seed');
    });
  });

  // ── Headline rejection ─────────────────────────────────────────────────────

  describe('headline rejection', () => {
    it('should reject a company name that is a headline (verb + many words)', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'Nigerian Fintech Paystack Raises $200M in Series B',
          country: 'NG',
          description: 'Paystack raised money.',
          source_url: article.link,
          signals: ['funding'],
          funding_stage: 'Series B+',
          event_type: 'funding_announcement',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(0);
    });

    it('should include a valid short company name "Paystack"', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'Paystack',
          country: 'NG',
          description: 'A Nigerian payment company.',
          source_url: article.link,
          signals: ['payments'],
          funding_stage: 'seed',
          event_type: 'funding_announcement',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(1);
      expect(companies[0].company_name).toBe('Paystack');
    });

    it('should reject a company name ending with a question mark', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'Will African Fintechs Dominate Payments?',
          country: null,
          description: 'A speculative headline.',
          source_url: article.link,
          signals: [],
          funding_stage: null,
          event_type: 'other',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(0);
    });

    it('should reject a company name with more than 6 words', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'This Is A Very Long Company Name Here',
          country: 'NG',
          description: 'Too many words.',
          source_url: article.link,
          signals: [],
          funding_stage: null,
          event_type: 'other',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(0);
    });

    it('should log a warning when a headline is rejected', async () => {
      const { logWarn } = require('../../src/utils/logger');
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'Fintech Startup Launches New Card Product',
          country: 'NG',
          description: 'Headline disguised as company.',
          source_url: article.link,
          signals: [],
          funding_stage: null,
          event_type: 'other',
        }]),
      );

      await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(logWarn).toHaveBeenCalledWith(
        'Rejected headline as company name',
        expect.objectContaining({ name: 'Fintech Startup Launches New Card Product' }),
      );
    });
  });

  // ── Batch processing ───────────────────────────────────────────────────────

  describe('batch processing', () => {
    it('should process two articles and return companies from both', async () => {
      const client = new GeminiClient(makeConfig());
      const article1 = makeArticle({ id: 'a1', link: 'https://example.com/1' });
      const article2 = makeArticle({ id: 'a2', link: 'https://example.com/2' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([
          {
            company_name: 'CompanyA',
            country: 'NG',
            description: 'Company A.',
            source_url: article1.link,
            signals: ['payments'],
            funding_stage: 'seed',
            event_type: 'funding_announcement',
          },
          {
            company_name: 'CompanyB',
            country: 'KE',
            description: 'Company B.',
            source_url: article2.link,
            signals: ['wallet'],
            funding_stage: 'seed',
            event_type: 'product_launch',
          },
        ]),
      );

      const { companies } = await client.extractCompaniesFromArticles(
        makeConfig(), makeAllowedState(), [article1, article2],
      );

      expect(companies).toHaveLength(2);
      expect(companies.map(c => c.company_name)).toContain('CompanyA');
      expect(companies.map(c => c.company_name)).toContain('CompanyB');
    });

    it('should return empty array when given empty articles list', async () => {
      const client = new GeminiClient(makeConfig());

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), []);

      expect(companies).toHaveLength(0);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return empty array when Gemini returns empty array', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(0);
    });

    it('should skip batch and not crash when Gemini returns malformed JSON', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue({
        response: { text: () => 'this is not json at all!!!' },
      });

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(0);
    });

    it('should attach articleId and articleDate from the source article', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle({ id: 'guid-abc', link: 'https://example.com/abc', pubDate: '2026-03-20' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiExtractionResponse([{
          company_name: 'Flutterwave',
          country: 'NG',
          description: 'African payments unicorn.',
          source_url: article.link,
          signals: ['payments'],
          funding_stage: 'Series B+',
          event_type: 'funding_announcement',
        }]),
      );

      const { companies } = await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      expect(companies).toHaveLength(1);
      expect(companies[0].articleId).toBe('guid-abc');
      expect(companies[0].articleDate).toBe('2026-03-20');
    });
  });

  // ── Gemini budget ──────────────────────────────────────────────────────────

  describe('budget enforcement', () => {
    it('should not call generateContent when Gemini budget is exhausted (dev env)', async () => {
      const client = new GeminiClient(makeDevConfig());
      const article = makeArticle();

      const { companies } = await client.extractCompaniesFromArticles(
        makeDevConfig(), makeExhaustedState(), [article],
      );

      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(companies).toHaveLength(0);
    });

    it('should call generateContent when budget allows (dev env, 0 calls used)', async () => {
      const client = new GeminiClient(makeDevConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(makeGeminiExtractionResponse([]));

      await client.extractCompaniesFromArticles(
        makeDevConfig(),
        { ...makeAllowedState(), gemini_calls_today: 0 },
        [article],
      );

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });
  });

  // ── Prompt content verification ────────────────────────────────────────────

  describe('prompt construction', () => {
    it('should include ISO country code instruction in the extraction prompt', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(makeGeminiExtractionResponse([]));

      await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      const prompt = mockGenerateContent.mock.calls[0][0] as string;
      expect(prompt).toContain('ISO 2-letter country code');
    });

    it('should include industry list in the extraction prompt', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(makeGeminiExtractionResponse([]));

      await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      const prompt = mockGenerateContent.mock.calls[0][0] as string;
      // industryPromptList() includes 'Fintech'
      expect(prompt).toContain('Fintech');
      expect(prompt).toContain('industry');
    });

    it('should include disambiguation examples in the extraction prompt', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle();

      mockGenerateContent.mockResolvedValue(makeGeminiExtractionResponse([]));

      await client.extractCompaniesFromArticles(makeConfig(), makeAllowedState(), [article]);

      const prompt = mockGenerateContent.mock.calls[0][0] as string;
      expect(prompt.toLowerCase()).toContain('disambiguation');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCORING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('GeminiClient.scoreCompanies', () => {

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeExtractedCompany = (overrides: any = {}): ExtractedCompany => ({
    company_name: overrides.company_name ?? 'TestCo',
    industry: overrides.industry ?? 'Fintech',
    country: overrides.country ?? 'NG',
    description: overrides.description ?? 'A test company.',
    source_url: overrides.source_url ?? 'https://example.com/article-1',
    signals: overrides.signals ?? ['payments'],
    funding_stage: overrides.funding_stage !== undefined ? overrides.funding_stage : 'seed',
    event_type: overrides.event_type ?? 'funding_announcement',
    articleId: overrides.articleId ?? 'article-1',
    articleDate: overrides.articleDate ?? '2026-03-25',
    website: overrides.website ?? null,
  } as ExtractedCompany);

  // ── Confidence validation ──────────────────────────────────────────────────

  describe('confidence validation', () => {
    it('should include a company with confidence "HIGH"', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'HighCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'HighCo',
          confidence: 'HIGH',
          primary_product: 'Payments',
          match_reason: 'Needs payment infrastructure for wallet product.',
        }]),
      );

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(scored).toHaveLength(1);
      expect(scored[0].confidence).toBe('HIGH');
    });

    it('should include a company with confidence "MEDIUM"', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'MedCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'MedCo',
          confidence: 'MEDIUM',
          primary_product: 'BaaS',
          match_reason: 'Adjacent fintech product, possible BaaS need.',
        }]),
      );

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(scored).toHaveLength(1);
      expect(scored[0].confidence).toBe('MEDIUM');
    });

    it('should reject a company with confidence "Low" (wrong case)', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'LowCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'LowCo',
          confidence: 'Low',
          primary_product: 'Payments',
          match_reason: 'Might need payments.',
        }]),
      );

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(scored).toHaveLength(0);
    });

    it('should reject a company with confidence "VERY_HIGH"', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'VeryHighCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'VeryHighCo',
          confidence: 'VERY_HIGH',
          primary_product: 'Payments',
          match_reason: 'Definitely needs payments.',
        }]),
      );

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(scored).toHaveLength(0);
    });

    it('should log a warning when confidence is invalid', async () => {
      const { logWarn } = require('../../src/utils/logger');
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'BadConfCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'BadConfCo',
          confidence: 'EXTREME',
          primary_product: 'Payments',
          match_reason: 'Strong need for payments.',
        }]),
      );

      await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(logWarn).toHaveBeenCalledWith(
        'Rejected company: invalid confidence',
        expect.objectContaining({ name: 'BadConfCo' }),
      );
    });
  });

  // ── Product validation ─────────────────────────────────────────────────────

  describe('product validation', () => {
    it('should include a company with primary_product "Payments"', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'PayCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'PayCo',
          confidence: 'HIGH',
          primary_product: 'Payments',
          match_reason: 'Needs payment collection API.',
        }]),
      );

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(scored).toHaveLength(1);
      expect(scored[0].primary_product).toBe('Payments');
    });

    it('should normalise primary_product "payments" (lowercase) to canonical "Payments" and include it', async () => {
      // normaliseProduct is case-insensitive: it lowercases before lookup,
      // so "payments" → "Payments" (not rejected).
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'CaseSensitiveCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'CaseSensitiveCo',
          confidence: 'HIGH',
          primary_product: 'payments',
          match_reason: 'Needs payment collection.',
        }]),
      );

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      // normaliseProduct('payments') returns 'Payments', so the company passes through
      expect(scored).toHaveLength(1);
      expect(scored[0].primary_product).toBe('Payments');
    });

    it('should reject a company with primary_product "InvalidProduct"', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'InvalidProdCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'InvalidProdCo',
          confidence: 'HIGH',
          primary_product: 'InvalidProduct',
          match_reason: 'Needs something.',
        }]),
      );

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(scored).toHaveLength(0);
    });

    it('should log a warning when product is invalid', async () => {
      const { logWarn } = require('../../src/utils/logger');
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'BadProdCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'BadProdCo',
          confidence: 'HIGH',
          primary_product: 'WireTransfer',
          match_reason: 'Needs wire transfers.',
        }]),
      );

      await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(logWarn).toHaveBeenCalledWith(
        'Rejected company: invalid product',
        expect.objectContaining({ name: 'BadProdCo' }),
      );
    });

    it('should pass all 7 canonical products through correctly', async () => {
      const products = VALID_PRIMARY_PRODUCTS;

      for (const product of products) {
        // Re-create mock and client each iteration so the client picks up the new mock
        jest.clearAllMocks();
        mockGenerateContent = jest.fn();
        (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
          getGenerativeModel: jest.fn().mockReturnValue({
            generateContent: jest.fn().mockImplementation(mockGenerateContent),
          }),
        }));

        // Client must be created AFTER the mock is updated so it captures the new mock
        const client = new GeminiClient(makeConfig());
        const company = makeExtractedCompany({ company_name: `${product}Co` });

        mockGenerateContent.mockResolvedValue(
          makeGeminiScoringResponse([{
            company_name: `${product}Co`,
            confidence: 'HIGH',
            primary_product: product,
            match_reason: `Needs ${product} infrastructure.`,
          }]),
        );

        const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

        expect(scored).toHaveLength(1);
        expect(scored[0].primary_product).toBe(product);
      }
    });
  });

  // ── match_reason validation ────────────────────────────────────────────────

  describe('match_reason validation', () => {
    it('should reject a company with empty match_reason ""', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'NoReasonCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'NoReasonCo',
          confidence: 'HIGH',
          primary_product: 'Payments',
          match_reason: '',
        }]),
      );

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(scored).toHaveLength(0);
    });

    it('should reject a company with whitespace-only match_reason "   "', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'SpacesReasonCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'SpacesReasonCo',
          confidence: 'HIGH',
          primary_product: 'Payments',
          match_reason: '   ',
        }]),
      );

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(scored).toHaveLength(0);
    });

    it('should include a company with a valid non-empty match_reason', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'GoodReasonCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'GoodReasonCo',
          confidence: 'HIGH',
          primary_product: 'Cards',
          match_reason: 'Needs virtual USD cards for vendor payments.',
        }]),
      );

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(scored).toHaveLength(1);
      expect(scored[0].match_reason).toBe('Needs virtual USD cards for vendor payments.');
    });

    it('should log a warning when match_reason is empty', async () => {
      const { logWarn } = require('../../src/utils/logger');
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'EmptyReasonCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'EmptyReasonCo',
          confidence: 'HIGH',
          primary_product: 'Payments',
          match_reason: '',
        }]),
      );

      await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(logWarn).toHaveBeenCalledWith(
        'Rejected company: empty match_reason',
        expect.objectContaining({ name: 'EmptyReasonCo' }),
      );
    });
  });

  // ── source_url / original lookup ───────────────────────────────────────────

  describe('source_url validation', () => {
    it('should copy source_url, articleId, articleDate from the original extracted company', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({
        company_name: 'Moniepoint',
        source_url: 'https://techcabal.com/moniepoint',
        articleId: 'guid-xyz',
        articleDate: '2026-03-10',
      });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'Moniepoint',
          confidence: 'HIGH',
          primary_product: 'BaaS',
          match_reason: 'Building banking infrastructure for SMEs.',
        }]),
      );

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(scored).toHaveLength(1);
      expect(scored[0].source_url).toBe('https://techcabal.com/moniepoint');
      expect(scored[0].articleId).toBe('guid-xyz');
      expect(scored[0].articleDate).toBe('2026-03-10');
    });

    it('should reject a scored company with no matching original (no source_url)', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'KnownCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'UnknownCo', // doesn't match any original
          confidence: 'HIGH',
          primary_product: 'Payments',
          match_reason: 'Needs payment infrastructure.',
        }]),
      );

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(scored).toHaveLength(0);
    });

    it('should log a warning when source_url lookup fails', async () => {
      const { logWarn } = require('../../src/utils/logger');
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'KnownCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'GhostCo',
          confidence: 'HIGH',
          primary_product: 'Payments',
          match_reason: 'Needs payments.',
        }]),
      );

      await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(logWarn).toHaveBeenCalledWith(
        'Rejected company: no source_url',
        expect.objectContaining({ name: 'GhostCo' }),
      );
    });
  });

  // ── Batch processing ───────────────────────────────────────────────────────

  describe('batch processing', () => {
    it('should skip batch and not crash when Gemini returns malformed JSON during scoring', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany();

      mockGenerateContent.mockResolvedValue({
        response: { text: () => '### not valid json ###' },
      });

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(scored).toHaveLength(0);
    });

    it('should return empty scored array when given empty companies list', async () => {
      const client = new GeminiClient(makeConfig());

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, []);

      expect(scored).toHaveLength(0);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should not call generateContent when Gemini budget is exhausted (dev env)', async () => {
      const client = new GeminiClient(makeDevConfig());
      const company = makeExtractedCompany();

      const { scored } = await client.scoreCompanies(
        makeDevConfig(), makeExhaustedState(), FALLBACK_ICP, [company],
      );

      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(scored).toHaveLength(0);
    });
  });

  // ── Prompt construction ────────────────────────────────────────────────────

  describe('prompt construction', () => {
    it('should include productPromptList content in the scoring prompt', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany();

      mockGenerateContent.mockResolvedValue(makeGeminiScoringResponse([]));

      await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      const prompt = mockGenerateContent.mock.calls[0][0] as string;
      // productPromptList() includes entries for each canonical product
      expect(prompt).toContain('Payments');
      expect(prompt).toContain('Digizone');
      expect(prompt).toContain('Global Services');
    });

    it('should sanitise company names before injecting into scoring prompt', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'Company "With Quotes"' });

      mockGenerateContent.mockResolvedValue(makeGeminiScoringResponse([]));

      await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      const prompt = mockGenerateContent.mock.calls[0][0] as string;
      // After sanitiseForPrompt, double quotes should be replaced with single quotes
      expect(prompt).not.toContain('Company "With Quotes"');
    });
  });

  // ── normalised product on output ───────────────────────────────────────────

  describe('product normalisation on output', () => {
    it('should set primary_product to the normalised canonical form', async () => {
      const client = new GeminiClient(makeConfig());
      const company = makeExtractedCompany({ company_name: 'PaymentsCo' });

      mockGenerateContent.mockResolvedValue(
        makeGeminiScoringResponse([{
          company_name: 'PaymentsCo',
          confidence: 'HIGH',
          primary_product: 'Payments',
          match_reason: 'Processing payments for African fintechs.',
        }]),
      );

      const { scored } = await client.scoreCompanies(makeConfig(), makeAllowedState(), FALLBACK_ICP, [company]);

      expect(scored).toHaveLength(1);
      expect(scored[0].primary_product).toBe('Payments');
    });
  });

  // ── Integration ────────────────────────────────────────────────────────────

  describe('integration: extraction → scoring', () => {
    it('should apply normalisation end-to-end from extraction through scoring', async () => {
      const client = new GeminiClient(makeConfig());
      const article = makeArticle({
        id: 'article-end-to-end',
        link: 'https://techcabal.com/e2e',
        pubDate: '2026-03-25',
      });

      // First Gemini call: extraction
      mockGenerateContent.mockResolvedValueOnce(
        makeGeminiExtractionResponse([{
          company_name: 'Anchor Test Co',
          industry: 'Financial Technology',
          country: 'Nigeria',
          description: 'A payment company in Nigeria.',
          source_url: article.link,
          signals: ['payments', 'wallet'],
          funding_stage: 'Series A',
          event_type: 'funding_announcement',
        }]),
      );

      // Second Gemini call: scoring
      mockGenerateContent.mockResolvedValueOnce(
        makeGeminiScoringResponse([{
          company_name: 'Anchor Test Co',
          confidence: 'HIGH',
          primary_product: 'Payments',
          match_reason: 'Nigerian fintech needing payment collection API.',
        }]),
      );

      const { companies, state: stateAfterExtraction } = await client.extractCompaniesFromArticles(
        makeConfig(), makeAllowedState(), [article],
      );

      expect(companies).toHaveLength(1);
      expect(companies[0].country).toBe('NG');
      expect(companies[0].industry).toBe('Fintech');
      expect(companies[0].funding_stage).toBe('series_a');

      const { scored } = await client.scoreCompanies(
        makeConfig(), stateAfterExtraction, FALLBACK_ICP, companies,
      );

      expect(scored).toHaveLength(1);
      expect(scored[0].company_name).toBe('Anchor Test Co');
      expect(scored[0].primary_product).toBe('Payments');
      expect(scored[0].source_url).toBe(article.link);
      expect(scored[0].articleId).toBe(article.id);
      expect(scored[0].articleDate).toBe(article.pubDate);
    });
  });
});
