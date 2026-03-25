/**
 * tests/state/budget.test.ts
 *
 * Strict TDD: all tests written BEFORE implementation of src/state/budget.ts.
 */

import { planBudget, buildArticleQueue, mergeWithQueue, BudgetPlan } from '../../src/state/budget';
import { AnglerState, QueuedArticle } from '../../src/state/state';
import { ArticleItem } from '../../src/clients/rss';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeArticle(id: string, overrides: Partial<ArticleItem> = {}): ArticleItem {
  return {
    id,
    title: `Title for ${id}`,
    description: `Description for ${id}`,
    link: `https://example.com/${id}`,
    pubDate: '2026-03-25T10:00:00Z',
    source: 'TestSource',
    ...overrides,
  };
}

function makeArticles(count: number, prefix = 'art'): ArticleItem[] {
  return Array.from({ length: count }, (_, i) => makeArticle(`${prefix}-${i}`));
}

function makeState(overrides: Partial<AnglerState> = {}): AnglerState {
  return {
    processed_guids: [],
    serpapi_calls_today: { date: '2026-03-25', count: 0 },
    gemini_day: '2026-03-25',
    gemini_calls_today: 0,
    seen_companies: [],
    article_queue: [],
    ...overrides,
  };
}

// Use a fixed current day so tests are time-independent
const CURRENT_DAY = '2026-03-25';
const YESTERDAY = '2026-03-24';

// ─── planBudget tests ─────────────────────────────────────────────────────────

describe('planBudget', () => {
  // Test 1: Fresh state, all articles fit
  it('fresh state (0 calls used) processes all articles when they fit within budget', () => {
    const articles = makeArticles(10);
    const state = makeState({ gemini_day: CURRENT_DAY, gemini_calls_today: 0 });

    const result = planBudget(articles, state, {
      geminiDailyLimit: 20,
      geminiReserve: 2,
      extractionBatchSize: 30,
      runEnv: 'production',
      currentDay: CURRENT_DAY,
    });

    expect(result.extractionBudget).toBe(18); // 20 - 2 reserve
    expect(result.maxArticles).toBe(540);     // 18 * 30
    expect(result.articlesToProcess).toHaveLength(10);
    expect(result.overflow).toHaveLength(0);
  });

  // Test 2: State with 18 calls used → extractionBudget=0
  it('exhausted budget (18 calls used, limit 20, reserve 2) moves all articles to overflow', () => {
    const articles = makeArticles(5);
    const state = makeState({ gemini_day: CURRENT_DAY, gemini_calls_today: 18 });

    const result = planBudget(articles, state, {
      geminiDailyLimit: 20,
      geminiReserve: 2,
      extractionBatchSize: 30,
      runEnv: 'production',
      currentDay: CURRENT_DAY,
    });

    expect(result.extractionBudget).toBe(0);
    expect(result.maxArticles).toBe(0);
    expect(result.articlesToProcess).toHaveLength(0);
    expect(result.overflow).toHaveLength(5);
  });

  // Test 3: Partial budget — 15 calls used, limit 20, reserve 2 → 3 remaining
  it('partial budget (15 calls used) allows remaining articles within maxArticles', () => {
    const articles = makeArticles(50);
    const state = makeState({ gemini_day: CURRENT_DAY, gemini_calls_today: 15 });

    const result = planBudget(articles, state, {
      geminiDailyLimit: 20,
      geminiReserve: 2,
      extractionBatchSize: 30,
      runEnv: 'production',
      currentDay: CURRENT_DAY,
    });

    expect(result.extractionBudget).toBe(3); // 20 - 15 - 2
    expect(result.maxArticles).toBe(90);     // 3 * 30
    expect(result.articlesToProcess).toHaveLength(50); // 50 <= 90, all fit
    expect(result.overflow).toHaveLength(0);
  });

  // Test 4: 50 articles, extractionBudget=1, batch=30 → first 30 processed, 20 overflow
  it('splits articles when count exceeds maxArticles (50 articles, budget=1, batch=30)', () => {
    const articles = makeArticles(50);
    const state = makeState({ gemini_day: CURRENT_DAY, gemini_calls_today: 19 }); // 20 - 19 - 0 reserve = 1

    const result = planBudget(articles, state, {
      geminiDailyLimit: 20,
      geminiReserve: 0,
      extractionBatchSize: 30,
      runEnv: 'production',
      currentDay: CURRENT_DAY,
    });

    expect(result.extractionBudget).toBe(1);
    expect(result.maxArticles).toBe(30);
    expect(result.articlesToProcess).toHaveLength(30);
    expect(result.overflow).toHaveLength(20);
    // First 30 should be processed, last 20 overflow
    expect(result.articlesToProcess[0].id).toBe('art-0');
    expect(result.overflow[0].id).toBe('art-30');
  });

  // Test 5: development mode caps effective limit at 2
  it('development mode caps limit at 2 (limit=20, reserve=1, 0 calls → budget=1, maxArticles=30)', () => {
    const articles = makeArticles(5);
    const state = makeState({ gemini_day: CURRENT_DAY, gemini_calls_today: 0 });

    const result = planBudget(articles, state, {
      geminiDailyLimit: 20,
      geminiReserve: 1,
      extractionBatchSize: 30,
      runEnv: 'development',
      currentDay: CURRENT_DAY,
    });

    // effective limit = min(20, 2) = 2; calls remaining = 2 - 1 reserve = 1
    expect(result.extractionBudget).toBe(1);
    expect(result.maxArticles).toBe(30);
    expect(result.articlesToProcess).toHaveLength(5); // 5 <= 30
    expect(result.overflow).toHaveLength(0);
  });

  // Test 6: development mode, 2 calls already used → budget=0
  it('development mode with 2 calls used → extractionBudget=0', () => {
    const articles = makeArticles(3);
    const state = makeState({ gemini_day: CURRENT_DAY, gemini_calls_today: 2 });

    const result = planBudget(articles, state, {
      geminiDailyLimit: 20,
      geminiReserve: 0,
      extractionBatchSize: 30,
      runEnv: 'development',
      currentDay: CURRENT_DAY,
    });

    // effective limit = 2; calls remaining = 2 - 2 = 0
    expect(result.extractionBudget).toBe(0);
    expect(result.maxArticles).toBe(0);
    expect(result.articlesToProcess).toHaveLength(0);
    expect(result.overflow).toHaveLength(3);
  });

  // Test 7: gemini_day is yesterday → fresh day, callsRemaining = effectiveLimit
  it('resets to fresh day when gemini_day is yesterday', () => {
    const articles = makeArticles(10);
    // State claims 19 calls, but they were on yesterday's Gemini day
    const state = makeState({ gemini_day: YESTERDAY, gemini_calls_today: 19 });

    const result = planBudget(articles, state, {
      geminiDailyLimit: 20,
      geminiReserve: 2,
      extractionBatchSize: 30,
      runEnv: 'production',
      currentDay: CURRENT_DAY, // today is different from gemini_day
    });

    // Fresh day: callsRemaining = 20; extractionBudget = 20 - 2 = 18
    expect(result.extractionBudget).toBe(18);
    expect(result.maxArticles).toBe(540);
    expect(result.articlesToProcess).toHaveLength(10);
    expect(result.overflow).toHaveLength(0);
  });

  // Test 8: empty articles array
  it('handles empty articles array gracefully', () => {
    const articles: ArticleItem[] = [];
    const state = makeState({ gemini_day: CURRENT_DAY, gemini_calls_today: 5 });

    const result = planBudget(articles, state, {
      geminiDailyLimit: 20,
      geminiReserve: 2,
      extractionBatchSize: 30,
      runEnv: 'production',
      currentDay: CURRENT_DAY,
    });

    expect(result.articlesToProcess).toHaveLength(0);
    expect(result.overflow).toHaveLength(0);
  });

  // Test 9: geminiReserve=0 → extractionBudget = callsRemaining
  it('geminiReserve=0 means extractionBudget equals callsRemaining', () => {
    const articles = makeArticles(5);
    const state = makeState({ gemini_day: CURRENT_DAY, gemini_calls_today: 10 });

    const result = planBudget(articles, state, {
      geminiDailyLimit: 20,
      geminiReserve: 0,
      extractionBatchSize: 30,
      runEnv: 'production',
      currentDay: CURRENT_DAY,
    });

    // callsRemaining = 20 - 10 = 10; extractionBudget = 10 - 0 = 10
    expect(result.extractionBudget).toBe(10);
    expect(result.maxArticles).toBe(300);
  });
});

// ─── buildArticleQueue tests ──────────────────────────────────────────────────

describe('buildArticleQueue', () => {
  const NOW = '2026-03-25T12:00:00.000Z';

  // Test 10: converts ArticleItem array to QueuedArticle with queued_at=now
  it('converts ArticleItem array to QueuedArticle with queued_at set to now', () => {
    const articles = makeArticles(3);
    const result = buildArticleQueue(articles, NOW);

    expect(result).toHaveLength(3);
    result.forEach((q: QueuedArticle) => {
      expect(q.queued_at).toBe(NOW);
    });
  });

  // Test 11: empty array → empty array
  it('returns empty array when given empty overflow', () => {
    const result = buildArticleQueue([], NOW);
    expect(result).toEqual([]);
  });

  // Test 12: all required fields preserved
  it('preserves all ArticleItem fields in the QueuedArticle', () => {
    const article = makeArticle('test-id', {
      title: 'My Title',
      description: 'My Desc',
      link: 'https://example.com/test',
      pubDate: '2026-03-20T08:00:00Z',
      source: 'MySource',
    });

    const result = buildArticleQueue([article], NOW);
    expect(result).toHaveLength(1);

    const q = result[0];
    expect(q.id).toBe('test-id');
    expect(q.title).toBe('My Title');
    expect(q.description).toBe('My Desc');
    expect(q.link).toBe('https://example.com/test');
    expect(q.pubDate).toBe('2026-03-20T08:00:00Z');
    expect(q.source).toBe('MySource');
    expect(q.queued_at).toBe(NOW);
  });
});

// ─── mergeWithQueue tests ─────────────────────────────────────────────────────

describe('mergeWithQueue', () => {
  // Test 13: no queue, fresh articles → returns fresh articles
  it('returns fresh articles when queue is empty', () => {
    const fresh = makeArticles(3, 'fresh');
    const result = mergeWithQueue([], fresh);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('fresh-0');
    expect(result[1].id).toBe('fresh-1');
    expect(result[2].id).toBe('fresh-2');
  });

  // Test 14: queue articles come first in output
  it('places queue articles before fresh articles in the merged result', () => {
    const queuedArticles: QueuedArticle[] = [
      { id: 'q-0', title: 'Q0', description: 'D', link: 'https://q0', source: 'S', queued_at: '2026-03-24T10:00:00Z' },
      { id: 'q-1', title: 'Q1', description: 'D', link: 'https://q1', source: 'S', queued_at: '2026-03-24T10:00:00Z' },
    ];
    const fresh = makeArticles(2, 'fresh');

    const result = mergeWithQueue(queuedArticles, fresh);

    expect(result).toHaveLength(4);
    expect(result[0].id).toBe('q-0');
    expect(result[1].id).toBe('q-1');
    expect(result[2].id).toBe('fresh-0');
    expect(result[3].id).toBe('fresh-1');
  });

  // Test 15: duplicate by ID — queue version kept, fresh duplicate removed
  it('deduplicates by id keeping the queue version (first occurrence wins)', () => {
    const queuedArticles: QueuedArticle[] = [
      { id: 'abc', title: 'Queue version', description: 'D', link: 'https://q', source: 'S', queued_at: '2026-03-24T10:00:00Z' },
    ];
    const fresh: ArticleItem[] = [
      makeArticle('abc', { title: 'Fresh version' }),
      makeArticle('xyz'),
    ];

    const result = mergeWithQueue(queuedArticles, fresh);

    expect(result).toHaveLength(2);
    // 'abc' should appear once, from the queue (title = 'Queue version')
    const abc = result.find((a: ArticleItem) => a.id === 'abc');
    expect(abc).toBeDefined();
    expect(abc!.title).toBe('Queue version');
    // 'xyz' should also be present
    expect(result.find((a: ArticleItem) => a.id === 'xyz')).toBeDefined();
  });

  // Test 16: empty queue and empty fresh → empty array
  it('returns empty array when both queue and fresh are empty', () => {
    const result = mergeWithQueue([], []);
    expect(result).toEqual([]);
  });

  // Test 17: queue-only, no fresh articles → queue articles returned as ArticleItems
  it('returns queue articles as ArticleItems when there are no fresh articles', () => {
    const queuedArticles: QueuedArticle[] = [
      { id: 'q-0', title: 'Queued', description: 'Desc', link: 'https://q0', source: 'Src', queued_at: '2026-03-24T10:00:00Z' },
    ];

    const result = mergeWithQueue(queuedArticles, []);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('q-0');
    expect(result[0].title).toBe('Queued');
    // queued_at is not on ArticleItem — but the cast is valid because they share base fields
    // The returned value should be usable as an ArticleItem
    expect(result[0].source).toBe('Src');
  });

  // Bonus test 18: multiple duplicates in fresh, only unique ones added
  it('handles multiple duplicates across queue and fresh correctly', () => {
    const queuedArticles: QueuedArticle[] = [
      { id: 'dup-1', title: 'Queue dup-1', description: 'D', link: 'https://dup1', source: 'S', queued_at: '2026-03-24T10:00:00Z' },
      { id: 'dup-2', title: 'Queue dup-2', description: 'D', link: 'https://dup2', source: 'S', queued_at: '2026-03-24T10:00:00Z' },
    ];
    const fresh: ArticleItem[] = [
      makeArticle('dup-1', { title: 'Fresh dup-1' }), // duplicate with queue
      makeArticle('dup-2', { title: 'Fresh dup-2' }), // duplicate with queue
      makeArticle('unique-1'),
    ];

    const result = mergeWithQueue(queuedArticles, fresh);

    expect(result).toHaveLength(3); // dup-1, dup-2, unique-1
    expect(result[0].title).toBe('Queue dup-1'); // queue version wins
    expect(result[1].title).toBe('Queue dup-2'); // queue version wins
    expect(result[2].id).toBe('unique-1');
  });
});
