import { AnglerState, QueuedArticle, currentGeminiDay } from './state';
import { ArticleItem } from '../clients/rss';

export interface BudgetPlan {
  articlesToProcess: ArticleItem[];
  overflow: ArticleItem[];
  extractionBudget: number;  // number of extraction calls available
  maxArticles: number;       // extractionBudget * batchSize
}

/**
 * Given the current state and config values, decide how many articles can be
 * processed in this run and which ones go to the overflow queue.
 *
 * extractionBudget = max(0, callsRemaining - geminiReserve)
 * maxArticles = extractionBudget * extractionBatchSize
 *
 * If articles.length <= maxArticles: all processed, overflow = []
 * If articles.length > maxArticles: first maxArticles processed, rest → overflow
 */
export function planBudget(
  articles: ArticleItem[],
  state: AnglerState,
  opts: {
    geminiDailyLimit: number;
    geminiReserve: number;
    extractionBatchSize: number;
    runEnv: 'production' | 'development';
    currentDay?: string; // injectable for testing; defaults to currentGeminiDay()
  },
): BudgetPlan {
  const today = opts.currentDay ?? currentGeminiDay();

  // Apply dev cap
  const effectiveLimit =
    opts.runEnv === 'development'
      ? Math.min(opts.geminiDailyLimit, 2)
      : opts.geminiDailyLimit;

  // If the stored Gemini day doesn't match today, treat as a fresh day (no calls used)
  const storedDay = state.gemini_day;
  const callsUsed = storedDay === today ? state.gemini_calls_today : 0;

  const callsRemaining = effectiveLimit - callsUsed;
  const extractionBudget = Math.max(0, callsRemaining - opts.geminiReserve);
  const maxArticles = extractionBudget * opts.extractionBatchSize;

  const articlesToProcess = articles.slice(0, maxArticles);
  const overflow = articles.slice(maxArticles);

  return { articlesToProcess, overflow, extractionBudget, maxArticles };
}

/**
 * Convert overflow ArticleItems to QueuedArticles with queued_at timestamp.
 */
export function buildArticleQueue(
  overflow: ArticleItem[],
  now: string, // ISO datetime string
): QueuedArticle[] {
  return overflow.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    link: a.link,
    pubDate: a.pubDate,
    source: a.source,
    queued_at: now,
  }));
}

/**
 * Merge carry-over queue articles with fresh articles, deduplicating by ID.
 * Queue articles come FIRST (they've already waited one run).
 * Returns the merged array with duplicates removed.
 */
export function mergeWithQueue(
  queueArticles: QueuedArticle[],
  freshArticles: ArticleItem[],
): ArticleItem[] {
  const seen = new Set<string>();
  const merged: ArticleItem[] = [];

  // Queue articles first — cast to ArticleItem (they share the same base fields)
  for (const q of queueArticles) {
    if (!seen.has(q.id)) {
      seen.add(q.id);
      merged.push({
        id: q.id,
        title: q.title,
        description: q.description,
        link: q.link,
        pubDate: q.pubDate,
        source: q.source,
      });
    }
  }

  // Fresh articles after — skip any already in the queue
  for (const a of freshArticles) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      merged.push(a);
    }
  }

  return merged;
}
