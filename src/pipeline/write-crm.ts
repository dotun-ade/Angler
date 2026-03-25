import { AnglerConfig } from '../utils/config';
import { SheetsClient, RunLogEntry } from '../clients/sheets';
import { ScoredCompany } from '../clients/gemini';
import { logInfo, logError } from '../utils/logger';

/**
 * Append scored companies to the Leads sheet with retry (handled inside SheetsClient).
 * Returns the number of rows written.
 *
 * Throws on write failure after retries — caller should save to overflow queue.
 */
export async function writeToCrm(
  companies: ScoredCompany[],
  runDateIso: string,
  config: AnglerConfig,
  sheetsClient: SheetsClient,
): Promise<number> {
  const written = await sheetsClient.appendLeads(companies, runDateIso, config.runEnv);
  logInfo(`CRM write: ${written} leads written`);
  return written;
}

/**
 * Append a run summary entry to the Angler Log sheet.
 * Errors here are logged but never re-thrown — a failed log write must not
 * fail the run or mask the real outcome.
 */
export async function writeRunLog(
  entry: RunLogEntry,
  sheetsClient: SheetsClient,
): Promise<void> {
  try {
    await sheetsClient.appendRunLog(entry);
  } catch (error) {
    logError('Failed to write Angler run log', { error: String(error) });
  }
}
