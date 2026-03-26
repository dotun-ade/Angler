import { loadConfig } from '../utils/config';
import { AnglerState, loadState, saveState } from '../state/state';
import { GeminiClient, ScoredCompany, ExtractedCompany } from '../clients/gemini';
import { SheetsClient } from '../clients/sheets';
import { logInfo, logError } from '../utils/logger';
import { fetchArticles } from './fetch-articles';
import { extractCompanies } from './extract-companies';
import { scoreCompanies } from './score-companies';
import { writeToCrm, writeRunLog } from './write-crm';
import { planBudget, buildArticleQueue } from '../state/budget';
import { batchPreDedup, exclusionListFilter, loadExclusionList, seenCompanyFilter, crmDedup, withinBatchDedup } from './dedup';
import { normalizeCompanyName } from '../utils/levenshtein';
import { ArticleItem } from '../clients/rss';
import { AuditEntry, createAuditEntry, writeRunAudit } from './audit';
import { checkAndLogIcpDrift } from '../utils/icp-drift';

export interface RunMetrics {
  articlesProcessed: number;
  companiesExtracted: number;
  afterDeduplication: number;
  writtenToCrm: number;
  geminiCallsUsed: number;
  serpApiCallsUsed: number;
  status: 'success' | 'partial' | 'failed';
  notes: string;
}

const GEMINI_DAILY_LIMIT = 20;
const GEMINI_RESERVE = 2;
const EXTRACTION_BATCH_SIZE = 30;
const DAILY_MEDIUM_CAP = 20;

export async function runAngler(): Promise<RunMetrics> {
  const runStartedAt = new Date();
  const runDateIso = runStartedAt.toISOString().slice(0, 10);
  const config = loadConfig();
  let state: AnglerState = loadState();

  const geminiBefore = state.gemini_calls_today;
  const serpBefore = state.serpapi_calls_today.count;

  const geminiClient = new GeminiClient(config);
  const sheetsClient = new SheetsClient(config);

  let articlesProcessed = 0;
  let companiesExtracted = 0;
  let afterDeduplication = 0;
  let writtenToCrm = 0;
  let status: 'success' | 'partial' | 'failed' = 'success';
  const notesParts: string[] = [];

  // Articles processed through extraction (for state.processed_guids)
  let articlesToProcess: ArticleItem[] = [];
  // Companies that passed the seen-filter (for state.seen_companies)
  let toScore: ReturnType<typeof seenCompanyFilter>['toScore'] = [];
  // Audit trail: keyed by company_name for easy lookup and augmentation
  const auditMap = new Map<string, AuditEntry>();

  // ── Stage 1: Fetch ──────────────────────────────────────────────────────
  let allArticles: ArticleItem[];
  try {
    const fetchResult = await fetchArticles(state, config.serpApiKey);
    state = fetchResult.state;
    allArticles = fetchResult.articles;
    articlesProcessed = allArticles.length;
  } catch (error) {
    // A total fetch failure (all sources down) is logged as failed — no articles,
    // nothing to process.
    logError('Fetch stage failed', { stage: 'fetch', error: String(error), affectedCount: 0 });
    status = 'failed';
    notesParts.push(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    state.last_run = runStartedAt.toISOString();
    saveState(state);
    const metrics = buildMetrics(0, 0, 0, 0, 0, 0, status, notesParts);
    await writeRunLog({ runDateIso, ...metrics }, sheetsClient);
    return metrics;
  }

  if (articlesProcessed === 0) {
    logInfo('No new articles to process. Exiting early.');
    state.last_run = runStartedAt.toISOString();
    saveState(state);
    return buildMetrics(0, 0, 0, 0, 0, 0, 'success', []);
  }

  if (config.runEnv === 'development' && articlesProcessed > 10) {
    allArticles = allArticles.slice(0, 10);
    articlesProcessed = allArticles.length;
    logInfo(`DEV MODE: capped to ${articlesProcessed} articles`);
  }

  // ── Stage 2: ICP + budget planning ─────────────────────────────────────
  const { icp, state: stateAfterIcp } = await geminiClient.parseIcpDoc(config, state);
  state = stateAfterIcp;
  checkAndLogIcpDrift(icp, state.last_icp);
  state.last_icp = icp;

  const { articlesToProcess: budgetedArticles, overflow } = planBudget(allArticles, state, {
    geminiDailyLimit: GEMINI_DAILY_LIMIT,
    geminiReserve: GEMINI_RESERVE,
    extractionBatchSize: EXTRACTION_BATCH_SIZE,
    runEnv: config.runEnv,
  });

  articlesToProcess = budgetedArticles;
  articlesProcessed = articlesToProcess.length;

  if (overflow.length > 0) {
    state.article_queue = buildArticleQueue(overflow, runStartedAt.toISOString());
    logInfo(
      `Article budget cap: processing ${articlesProcessed}, queuing ${overflow.length} for tomorrow ` +
      `(${GEMINI_DAILY_LIMIT - GEMINI_RESERVE} extraction calls × ${EXTRACTION_BATCH_SIZE} batch size)`,
    );
  } else {
    state.article_queue = [];
  }

  // ── Stage 3: Extraction ─────────────────────────────────────────────────
  let extracted: ExtractedCompany[] = [];
  try {
    const result = await extractCompanies(articlesToProcess, config, state, geminiClient);
    state = result.state;
    extracted = result.companies;
    companiesExtracted = extracted.length;
    // Seed audit map with every extracted company
    for (const c of extracted) {
      auditMap.set(c.company_name, createAuditEntry(c, runDateIso));
    }
  } catch (error) {
    logError('Extraction stage failed', {
      stage: 'extraction',
      error: String(error),
      affectedCount: articlesToProcess.length,
      overflowQueueUsed: false,
    });
    status = 'partial';
    notesParts.push(`Extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    // extracted stays []
  }

  // ── Stage 4: Pre-score dedup ────────────────────────────────────────────
  const batchDeduped = batchPreDedup(extracted);
  if (batchDeduped.length < extracted.length) {
    logInfo(`Batch pre-dedup: ${extracted.length} → ${batchDeduped.length} unique companies`);
  }
  // Mark companies removed by batch pre-dedup
  for (const c of extracted) {
    if (!batchDeduped.includes(c)) {
      const entry = auditMap.get(c.company_name);
      if (entry) { entry.decision = 'deduped'; entry.reason = 'duplicate within extraction batch'; }
    }
  }

  // Exclusion list filter — remove existing Anchor customers/signups before scoring
  const exclusionList = loadExclusionList();
  const { passed: afterExclusion, filtered: excludedCompanies } = exclusionListFilter(batchDeduped, exclusionList);
  if (excludedCompanies.length > 0) {
    logInfo(`Exclusion list: removed ${excludedCompanies.length} existing customer(s)`);
    for (const c of excludedCompanies) {
      const entry = auditMap.get(c.company_name);
      if (entry) { entry.decision = 'rejected'; entry.reason = 'matched exclusion list (existing customer)'; }
    }
  }

  const { toScore: toScoreArr, skipped } = seenCompanyFilter(
    afterExclusion,
    state.seen_companies,
    runDateIso,
  );
  toScore = toScoreArr;
  // Mark companies skipped by the seen-company filter
  for (const c of skipped) {
    const entry = auditMap.get(c.company_name);
    if (entry) { entry.decision = 'rejected'; entry.reason = 'seen within 30 days (no fresh event)'; }
  }

  if (skipped.length > 0) {
    logInfo(`Seen-companies filter: skipped ${skipped.length} already-evaluated companies`);
  }
  logInfo(`Sending ${toScore.length} companies to scoring`);

  // ── Stage 5: Scoring ────────────────────────────────────────────────────
  let scored: ScoredCompany[];
  try {
    const result = await scoreCompanies(toScore, icp, config, state, geminiClient);
    state = result.state;
    scored = result.scored;
    // Augment audit entries with scoring data
    for (const s of scored) {
      const entry = auditMap.get(s.company_name);
      if (entry) {
        entry.confidence = s.confidence;
        entry.primary_product = s.primary_product;
        entry.match_reason = s.match_reason;
      }
    }
  } catch (error) {
    // Never silently drop successfully extracted companies — default to MEDIUM.
    logError('Scoring stage failed; defaulting to MEDIUM confidence', {
      stage: 'scoring',
      error: String(error),
      affectedCount: toScore.length,
    });
    status = 'partial';
    notesParts.push(`Scoring failed: ${error instanceof Error ? error.message : String(error)}`);
    scored = toScore.map((c) => ({
      company_name: c.company_name,
      confidence: 'MEDIUM' as const,
      primary_product: 'Payments' as const,
      match_reason: 'Scoring unavailable — defaulted to MEDIUM confidence',
      source_url: c.source_url,
      articleId: c.articleId,
      articleDate: c.articleDate,
      country: c.country ?? null,
      industry: c.industry ?? null,
      website: c.website ?? null,
    }));
    for (const s of scored) {
      const entry = auditMap.get(s.company_name);
      if (entry) { entry.confidence = s.confidence; entry.primary_product = s.primary_product; entry.match_reason = s.match_reason; }
    }
  }

  // ── Stage 6: CRM dedup ──────────────────────────────────────────────────
  let finalLeads: ScoredCompany[] = [];
  try {
    const existingNames = await sheetsClient.getExistingBusinessNames();
    logInfo(`CRM deduplication: checking against ${existingNames.length} existing leads`);

    const { passed: crmPassed, filtered: crmFiltered } = crmDedup(scored, existingNames);
    const { passed: batchPassed, filtered: batchFiltered } = withinBatchDedup(crmPassed);
    logInfo(
      `Deduplication: ${batchPassed.length} remain ` +
      `(${crmFiltered.length} matched CRM, ${batchFiltered.length} matched batch)`,
    );
    // Audit: mark deduped companies
    for (const c of crmFiltered) {
      const entry = auditMap.get(c.company_name);
      if (entry) { entry.decision = 'deduped'; entry.reason = 'matched existing CRM lead'; }
    }
    for (const c of batchFiltered) {
      const entry = auditMap.get(c.company_name);
      if (entry) { entry.decision = 'deduped'; entry.reason = 'duplicate within run batch'; }
    }

    // Sort HIGH before MEDIUM, then by recency within each tier
    batchPassed.sort((a, b) => {
      const order = (c: 'HIGH' | 'MEDIUM') => (c === 'HIGH' ? 0 : 1);
      const diff = order(a.confidence) - order(b.confidence);
      if (diff !== 0) return diff;
      const dateA = a.articleDate ? new Date(a.articleDate).getTime() : 0;
      const dateB = b.articleDate ? new Date(b.articleDate).getTime() : 0;
      return dateB - dateA;
    });

    // Take ALL HIGH leads; fill remaining slots with MEDIUM up to daily cap
    const highLeads = batchPassed.filter((c) => c.confidence === 'HIGH');
    const mediumLeads = batchPassed.filter((c) => c.confidence === 'MEDIUM');
    const mediumSlots = Math.max(0, DAILY_MEDIUM_CAP - highLeads.length);
    finalLeads = [...highLeads, ...mediumLeads.slice(0, mediumSlots)];
    afterDeduplication = finalLeads.length;
    // Audit: mark MEDIUM leads dropped by cap
    for (const c of mediumLeads.slice(mediumSlots)) {
      const entry = auditMap.get(c.company_name);
      if (entry) { entry.decision = 'rejected'; entry.reason = 'MEDIUM daily cap reached'; }
    }
    logInfo(
      `Final: ${highLeads.length} HIGH (all kept) + ` +
      `${Math.min(mediumLeads.length, mediumSlots)} of ${mediumLeads.length} MEDIUM = ` +
      `${finalLeads.length} leads`,
    );
  } catch (error) {
    logError('Dedup stage failed; saving articles to overflow queue', {
      stage: 'dedup',
      error: String(error),
      affectedCount: scored.length,
      overflowQueueUsed: true,
    });
    status = 'partial';
    notesParts.push(`Dedup failed: ${error instanceof Error ? error.message : String(error)}`);
    state.article_queue = [
      ...(state.article_queue ?? []),
      ...buildArticleQueue(articlesToProcess, runStartedAt.toISOString()),
    ];
  }

  // ── Stage 7: CRM write ──────────────────────────────────────────────────
  try {
    writtenToCrm = await writeToCrm(finalLeads, runDateIso, config, sheetsClient);
  } catch (error) {
    logError('CRM write failed; saving articles to overflow queue', {
      stage: 'write',
      error: String(error),
      affectedCount: finalLeads.length,
      overflowQueueUsed: true,
    });
    status = 'partial';
    notesParts.push(`CRM write failed: ${error instanceof Error ? error.message : String(error)}`);
    state.article_queue = [
      ...(state.article_queue ?? []),
      ...buildArticleQueue(articlesToProcess, runStartedAt.toISOString()),
    ];
    writtenToCrm = 0;
  }

  // ── Audit: mark written leads + write audit file ────────────────────────
  for (const c of finalLeads) {
    const entry = auditMap.get(c.company_name);
    if (entry) { entry.decision = 'written'; entry.reason = `${c.confidence} confidence — ${c.match_reason}`; }
  }
  writeRunAudit(Array.from(auditMap.values()));

  // ── State update ────────────────────────────────────────────────────────
  // CRM write happened first — leads are safe even if state save fails.
  state.last_run = runStartedAt.toISOString();
  state.last_run_status = status;
  state.processed_guids = [...state.processed_guids, ...articlesToProcess.map((a) => a.id)];
  state.seen_companies = [
    ...state.seen_companies,
    ...toScore.map((c) => ({
      name: normalizeCompanyName(c.company_name),
      seen_date: runDateIso,
    })),
  ];
  saveState(state);

  // ── Run log ─────────────────────────────────────────────────────────────
  const geminiAfter = state.gemini_calls_today;
  const serpAfter = state.serpapi_calls_today.count;
  const metrics = buildMetrics(
    articlesProcessed,
    companiesExtracted,
    afterDeduplication,
    writtenToCrm,
    geminiAfter - geminiBefore,
    serpAfter - serpBefore,
    status,
    notesParts,
  );
  await writeRunLog({ runDateIso, ...metrics }, sheetsClient);
  return metrics;
}

function buildMetrics(
  articlesProcessed: number,
  companiesExtracted: number,
  afterDeduplication: number,
  writtenToCrm: number,
  geminiCallsUsed: number,
  serpApiCallsUsed: number,
  status: RunMetrics['status'],
  notesParts: string[],
): RunMetrics {
  return {
    articlesProcessed,
    companiesExtracted,
    afterDeduplication,
    writtenToCrm,
    geminiCallsUsed,
    serpApiCallsUsed,
    status,
    notes: notesParts.join(' '),
  };
}
