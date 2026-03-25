import { AnglerConfig } from '../utils/config';
import { AnglerState } from '../state/state';
import { GeminiClient, ExtractedCompany } from '../clients/gemini';
import { ArticleItem } from '../clients/rss';
import { logInfo } from '../utils/logger';

/**
 * Extract companies from articles using Gemini.
 *
 * Batching is handled inside GeminiClient. Returns all extracted companies
 * across all batches and the updated state (Gemini call count).
 *
 * Throws on Gemini quota exhaustion or malformed response — callers should
 * catch and decide whether to skip or abort.
 */
export async function extractCompanies(
  articles: ArticleItem[],
  config: AnglerConfig,
  state: AnglerState,
  geminiClient: GeminiClient,
): Promise<{ companies: ExtractedCompany[]; state: AnglerState }> {
  const { companies, state: newState } = await geminiClient.extractCompaniesFromArticles(
    config,
    state,
    articles,
  );
  logInfo(`Extraction: ${companies.length} companies found across ${articles.length} articles`);
  return { companies, state: newState };
}
