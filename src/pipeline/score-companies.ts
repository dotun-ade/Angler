import { AnglerConfig } from '../utils/config';
import { AnglerState } from '../state/state';
import { GeminiClient, ExtractedCompany, ScoredCompany, IcpCriteria } from '../clients/gemini';
import { logInfo } from '../utils/logger';

/**
 * Score extracted companies against the ICP using Gemini.
 *
 * Returns only companies that qualified (HIGH or MEDIUM confidence).
 * Batching is handled inside GeminiClient.
 *
 * On Gemini failure the caller is responsible for the fallback — per the plan,
 * never silently drop companies that were successfully extracted.
 */
export async function scoreCompanies(
  companies: ExtractedCompany[],
  icp: IcpCriteria,
  config: AnglerConfig,
  state: AnglerState,
  geminiClient: GeminiClient,
): Promise<{ scored: ScoredCompany[]; state: AnglerState }> {
  const { scored, state: newState } = await geminiClient.scoreCompanies(
    config,
    state,
    icp,
    companies,
  );
  const highCount = scored.filter((c) => c.confidence === 'HIGH').length;
  const medCount = scored.filter((c) => c.confidence === 'MEDIUM').length;
  logInfo(`Scoring: ${scored.length} qualified (${highCount} HIGH, ${medCount} MEDIUM)`);
  return { scored, state: newState };
}
