import fs from 'fs';
import path from 'path';
import { ExtractedCompany } from '../clients/gemini';
import { logError } from '../utils/logger';

export type AuditDecision = 'written' | 'deduped' | 'rejected';

export interface AuditEntry {
  run_date: string;
  company_name: string;
  source_url: string;
  article_id?: string;
  article_date?: string;
  // Extracted fields
  industry: string | null;
  country: string | null;
  funding_stage: string | null;
  event_type: string | null;
  signals: string[];
  // Scoring (populated after scoring stage; absent if company was rejected before scoring)
  confidence?: 'HIGH' | 'MEDIUM';
  primary_product?: string;
  match_reason?: string;
  // Final decision
  decision: AuditDecision;
  reason: string;
}

const AUDIT_PATH = path.resolve(
  process.env.ANGLER_STATE_PATH
    ? path.join(path.dirname(process.env.ANGLER_STATE_PATH), 'run_audit.json')
    : './state/run_audit.json',
);

/**
 * Build a base audit entry from an extracted company.
 * Call augmentWithScoring() after the scoring stage, then finalise() at the
 * decision point.
 */
export function createAuditEntry(
  company: ExtractedCompany,
  runDate: string,
): AuditEntry {
  return {
    run_date: runDate,
    company_name: company.company_name,
    source_url: company.source_url,
    article_id: company.articleId,
    article_date: company.articleDate,
    industry: company.industry ?? null,
    country: company.country ?? null,
    funding_stage: company.funding_stage ?? null,
    event_type: company.event_type ?? null,
    signals: company.signals,
    decision: 'rejected', // default; overwritten at decision point
    reason: '',
  };
}

/**
 * Persist the current run's audit entries to run_audit.json.
 * Overwrites the previous run's audit — useful for post-run debugging.
 */
export function writeRunAudit(entries: AuditEntry[]): void {
  try {
    const dir = path.dirname(AUDIT_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(AUDIT_PATH, JSON.stringify(entries, null, 2), 'utf8');
  } catch (error) {
    logError('Failed to write run_audit.json', { error: String(error) });
  }
}
