export interface RssSource {
  url: string;
  name: string;
  priority: number;  // 1 (highest) to 3 (lowest)
}

export interface AnglerConfig {
  sources: {
    editorial: RssSource[];
    googleNews: RssSource[];
  };
  pipeline: {
    extractionBatchSize: number;  // default 30
    scoringBatchSize: number;     // default 15
    maxArticlesPerRun: number;    // default 200
  };
  gemini: {
    model: string;               // e.g. "gemini-2.5-flash"
    dailyCallLimit: number;      // default 20
    requestsPerMinute: number;   // default 5
  };
  dedup: {
    similarityThreshold: number; // 0-1, default 0.8
    seenCompanyTtlDays: number;  // default 30
  };
  scoring: {
    minConfidence: 'HIGH' | 'MEDIUM';  // default 'MEDIUM'
  };
}
