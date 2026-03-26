import { AnglerState } from '../state/state';
import { fetchRssArticles, ArticleItem } from '../clients/rss';
import { fetchSerpApiArticles } from '../clients/serpapi';
import { mergeWithQueue } from '../state/budget';
import { logInfo } from '../utils/logger';

export interface FetchResult {
  articles: ArticleItem[];
  state: AnglerState;
  editorialCount: number;
  gnewsCount: number;
  serpCount: number;
  queueCount: number;
}

/**
 * Fetch articles from all sources, merge with carry-over queue, and dedup by ID.
 *
 * Priority order (highest signal first):
 *   queue carry-over → SerpAPI → editorial RSS → GNews
 *
 * Fetch failures from individual RSS feeds are logged and skipped (handled inside
 * fetchRssArticles). A total failure here indicates a broader network issue and
 * should be caught by the caller.
 */
export async function fetchArticles(
  state: AnglerState,
  serpApiKey: string,
): Promise<FetchResult> {
  const queueCarryOver = state.article_queue ?? [];
  if (queueCarryOver.length > 0) {
    logInfo(`Article queue: ${queueCarryOver.length} carry-over articles from previous run(s)`);
  }

  const [rssArticles, serpResult] = await Promise.all([
    fetchRssArticles(state),
    fetchSerpApiArticles(state, serpApiKey),
  ]);

  const editorialArticles = rssArticles.filter((a) => !a.source.startsWith('GNews:'));
  const gnewsArticles = rssArticles.filter((a) => a.source.startsWith('GNews:'));

  // Merge queue first, then fresh sources (in priority order). mergeWithQueue
  // deduplicates by article ID so queue articles that RSS re-encountered aren't
  // processed twice.
  const freshArticles: ArticleItem[] = [
    ...serpResult.articles,
    ...editorialArticles,
    ...gnewsArticles,
  ];
  const articles = mergeWithQueue(queueCarryOver, freshArticles);

  // Drop articles older than 1 year — stale news produces low-quality leads
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const fresh = articles.filter((a) => {
    if (!a.pubDate) return true; // no date = keep (can't confirm it's old)
    const pub = new Date(a.pubDate);
    return isNaN(pub.getTime()) || pub >= oneYearAgo;
  });
  const staleCount = articles.length - fresh.length;
  if (staleCount > 0) {
    logInfo(`Dropped ${staleCount} article(s) older than 1 year`);
  }

  logInfo(
    `Articles collected: ${queueCarryOver.length} queue, ` +
    `${editorialArticles.length} editorial, ${gnewsArticles.length} GNews, ` +
    `${serpResult.articles.length} SerpAPI — ${fresh.length} total (${staleCount} stale dropped)`,
  );

  return {
    articles: fresh,
    state: serpResult.state,
    editorialCount: editorialArticles.length,
    gnewsCount: gnewsArticles.length,
    serpCount: serpResult.articles.length,
    queueCount: queueCarryOver.length,
  };
}
