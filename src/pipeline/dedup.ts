import path from 'path';
import fs from 'fs';
import { ExtractedCompany, ScoredCompany } from '../clients/gemini';
import { SeenCompanyEntry } from '../state/state';
import { normalizedSimilarity, normalizeCompanyName } from '../utils/levenshtein';
import { logInfo, logWarn } from '../utils/logger';

// ---------------------------------------------------------------------------
// exclusionListFilter
// ---------------------------------------------------------------------------

/**
 * Load the exclusion list from config/excluded-companies.json.
 * Returns an empty array if the file is missing (graceful degradation).
 */
export function loadExclusionList(configDir?: string): string[] {
  const dir = configDir ?? path.resolve(__dirname, '../../config');
  const filePath = path.join(dir, 'excluded-companies.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as string[];
  } catch {
    logWarn('excluded-companies.json not found or unreadable; exclusion filter disabled.', { filePath });
    return [];
  }
}

/**
 * Filter out companies that are already known Anchor customers/signups.
 * Uses Levenshtein similarity ≥ 90% (tighter than CRM dedup) since these
 * are intentional exclusions, not fuzzy guesses.
 *
 * @param companies   Companies from extraction batch
 * @param exclusionList  Names loaded from excluded-companies.json
 * @param threshold   Similarity threshold (default 90)
 */
export function exclusionListFilter(
  companies: ExtractedCompany[],
  exclusionList: string[],
  threshold = 90,
): { passed: ExtractedCompany[]; filtered: ExtractedCompany[] } {
  if (exclusionList.length === 0) return { passed: companies, filtered: [] };

  const passed: ExtractedCompany[] = [];
  const filtered: ExtractedCompany[] = [];

  for (const company of companies) {
    let isExcluded = false;
    for (const excluded of exclusionList) {
      if (normalizedSimilarity(excluded, company.company_name) >= threshold) {
        logInfo('Exclusion list filter: removed existing customer', {
          company: company.company_name,
          matchedEntry: excluded,
        });
        isExcluded = true;
        break;
      }
    }
    if (isExcluded) {
      filtered.push(company);
    } else {
      passed.push(company);
    }
  }

  return { passed, filtered };
}

// ---------------------------------------------------------------------------
// batchPreDedup
// ---------------------------------------------------------------------------

/**
 * Pre-dedup within an extraction batch.
 * If the same company appears multiple times (same name, case-insensitive
 * trimmed), keep only the entry with the most signals.
 * Tie-break: keep the first one.
 */
export function batchPreDedup(companies: ExtractedCompany[]): ExtractedCompany[] {
  // Map from normalised key → best entry so far
  const best = new Map<string, ExtractedCompany>();

  for (const company of companies) {
    const key = normalizeCompanyName(company.company_name);

    if (!best.has(key)) {
      best.set(key, company);
    } else {
      const existing = best.get(key)!;
      // Replace only if the new entry has strictly more signals (tie → keep first)
      if (company.signals.length > existing.signals.length) {
        best.set(key, company);
      }
    }
  }

  // Preserve original order by filtering the original array
  const seen = new Set<string>();
  const result: ExtractedCompany[] = [];

  for (const company of companies) {
    const key = normalizeCompanyName(company.company_name);
    if (!seen.has(key) && best.get(key) === company) {
      seen.add(key);
      result.push(company);
    } else if (!seen.has(key)) {
      seen.add(key);
      result.push(best.get(key)!);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// seenCompanyFilter
// ---------------------------------------------------------------------------

/**
 * Calculate the cutoff date: todayIso minus `days` days, as "YYYY-MM-DD".
 */
function calcCutoffDate(todayIso: string, days: number): string {
  const d = new Date(todayIso);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Filter out companies already scored within the last 30 days, unless this
 * is a fresh event (funding_announcement or product_launch).
 */
export function seenCompanyFilter(
  companies: ExtractedCompany[],
  seenCompanies: SeenCompanyEntry[],
  todayIso: string,
): { toScore: ExtractedCompany[]; skipped: ExtractedCompany[] } {
  const cutoff = calcCutoffDate(todayIso, 30);

  // Build a set of recently-seen normalised names for O(1) lookup
  const recentlySeen = new Set<string>(
    seenCompanies
      .filter((entry) => entry.seen_date >= cutoff)
      .map((entry) => entry.name),
  );

  const toScore: ExtractedCompany[] = [];
  const skipped: ExtractedCompany[] = [];

  for (const company of companies) {
    const normalisedName = normalizeCompanyName(company.company_name);
    const isFreshEvent =
      company.event_type === 'funding_announcement' ||
      company.event_type === 'product_launch';

    if (recentlySeen.has(normalisedName) && !isFreshEvent) {
      skipped.push(company);
    } else {
      toScore.push(company);
    }
  }

  return { toScore, skipped };
}

// ---------------------------------------------------------------------------
// crmDedup
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLD = 80;
const NEAR_MISS_LOWER = 70;

/**
 * Filter out companies that are too similar to existing CRM entries.
 * Default threshold: 80 (percent).
 */
export function crmDedup(
  companies: ScoredCompany[],
  existingNames: string[],
  threshold: number = DEFAULT_THRESHOLD,
): { passed: ScoredCompany[]; filtered: ScoredCompany[] } {
  const passed: ScoredCompany[] = [];
  const filtered: ScoredCompany[] = [];

  for (const company of companies) {
    let reject = false;
    let nearMatch: string | null = null;
    let nearSimilarity = 0;

    for (const existingName of existingNames) {
      const similarity = normalizedSimilarity(existingName, company.company_name);

      if (similarity > threshold) {
        reject = true;
        break;
      }

      // Near-miss: in the 70–80 band (but below threshold)
      if (similarity > NEAR_MISS_LOWER && similarity <= threshold) {
        if (similarity > nearSimilarity) {
          nearSimilarity = similarity;
          nearMatch = existingName;
        }
      }
    }

    if (reject) {
      filtered.push(company);
    } else {
      if (nearMatch !== null) {
        logWarn('Near-miss CRM dedup', {
          company: company.company_name,
          nearMatch,
          similarity: nearSimilarity,
        });
      }
      passed.push(company);
    }
  }

  return { passed, filtered };
}

// ---------------------------------------------------------------------------
// withinBatchDedup
// ---------------------------------------------------------------------------

/**
 * Remove duplicates within the current batch of scored companies.
 * Process in order (first occurrence wins).
 * Default threshold: 80 (percent).
 */
export function withinBatchDedup(
  companies: ScoredCompany[],
  threshold: number = DEFAULT_THRESHOLD,
): { passed: ScoredCompany[]; filtered: ScoredCompany[] } {
  const passed: ScoredCompany[] = [];
  const filtered: ScoredCompany[] = [];
  const acceptedNames: string[] = [];

  for (const company of companies) {
    let reject = false;
    let nearMatch: string | null = null;
    let nearSimilarity = 0;

    for (const acceptedName of acceptedNames) {
      const similarity = normalizedSimilarity(acceptedName, company.company_name);

      if (similarity > threshold) {
        reject = true;
        break;
      }

      // Near-miss: in the 70–80 band (but below threshold)
      if (similarity > NEAR_MISS_LOWER && similarity <= threshold) {
        if (similarity > nearSimilarity) {
          nearSimilarity = similarity;
          nearMatch = acceptedName;
        }
      }
    }

    if (reject) {
      filtered.push(company);
    } else {
      if (nearMatch !== null) {
        logWarn('Near-miss within-batch dedup', {
          company: company.company_name,
          nearMatch,
          similarity: nearSimilarity,
        });
      }
      acceptedNames.push(company.company_name);
      passed.push(company);
    }
  }

  return { passed, filtered };
}
