import { loadConfig } from '../utils/config';
import { AnglerState, loadState, saveState } from '../state/state';
import { GeminiClient, ScoredCompany } from '../clients/gemini';
import { SheetsClient } from '../clients/sheets';
import { logInfo, logError } from '../utils/logger';
import { fetchArticles } from './fetch-articles';
import { extractCompanies } from './extract-companies';
import { scoreCompanies } from './score-companies';
import { writeToCrm, writeRunLog } from './write-crm';
import { planBudget, buildArticleQueue } from '../state/budget';
import { batchPreDedup, seenCompanyFilter, crmDedup, withinBatchDedup } from './dedup';
import { ArticleItem } from '../clients/rss';

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
  let extracted: ReturnType<typeof batchPreDedup> = [];
  try {
    const result = await extractCompanies(articlesToProcess, config, state, geminiClient);
    state = result.state;
    extracted = result.companies;
    companiesExtracted = extracted.length;
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

  const { toScore: toScoreArr, skipped } = seenCompanyFilter(
    batchDeduped,
    state.seen_companies,
    runDateIso,
  );
  toScore = toScoreArr;

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
    }));
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

  // ── State update ────────────────────────────────────────────────────────
  // CRM write happened first — leads are safe even if state save fails.
  state.last_run = runStartedAt.toISOString();
  state.processed_guids = [...state.processed_guids, ...articlesToProcess.map((a) => a.id)];
  state.seen_companies = [
    ...state.seen_companies,
    ...toScore.map((c) => ({
      name: c.company_name.toLowerCase().trim(),
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
