export const CONFIG_DEFAULTS = {
  pipeline: { extractionBatchSize: 30, scoringBatchSize: 15, maxArticlesPerRun: 200 },
  gemini: { model: 'gemini-2.5-flash', dailyCallLimit: 20, requestsPerMinute: 5 },
  dedup: { similarityThreshold: 0.8, seenCompanyTtlDays: 30 },
  scoring: { minConfidence: 'MEDIUM' as const },
};
