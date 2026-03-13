import { loadConfig } from "../utils/config";
import {
  AnglerState,
  loadState,
  saveState,
} from "../state/state";
import { fetchRssArticles } from "../clients/rss";
import { fetchSerpApiArticles } from "../clients/serpapi";
import { GeminiClient } from "../clients/gemini";
import { SheetsClient, RunLogEntry } from "../clients/sheets";
import { similarityPercentage } from "../utils/levenshtein";

export async function runAngler(): Promise<void> {
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
  let status: RunLogEntry["status"] = "success";
  let notes = "";

  try {
    const [rssArticles, serpResult] = await Promise.all([
      fetchRssArticles(state),
      fetchSerpApiArticles(state, config.serpApiKey),
    ]);
    state = serpResult.state;

    const allArticles = [...rssArticles, ...serpResult.articles];
    articlesProcessed = allArticles.length;
    console.log(
      `Articles collected: ${rssArticles.length} from RSS, ${serpResult.articles.length} from SerpAPI — ${articlesProcessed} total`,
    );

    if (articlesProcessed === 0) {
      console.log("No new articles to process. Exiting early.");
      state.last_run = runStartedAt.toISOString();
      saveState(state);
      return;
    }

    if (config.runEnv === "development" && articlesProcessed > 10) {
      allArticles.splice(10);
      articlesProcessed = allArticles.length;
      console.log(`DEV MODE: capped to ${articlesProcessed} articles`);
    }

    const { icp, state: stateAfterIcp } = await geminiClient.parseIcpDoc(
      config,
      state,
    );
    state = stateAfterIcp;

    const { companies: extracted, state: stateAfterExtraction } =
      await geminiClient.extractCompaniesFromArticles(
        config,
        state,
        allArticles,
      );
    state = stateAfterExtraction;
    companiesExtracted = extracted.length;
    console.log(`Extraction: ${companiesExtracted} companies found across ${allArticles.length} articles`);

    // Pre-dedup within batch: if the same company appeared in multiple
    // articles, score it once (keeping the entry with the most signals).
    const seenExtracted = new Map<string, typeof extracted[number]>();
    for (const company of extracted) {
      const key = company.company_name.toLowerCase().trim();
      const existing = seenExtracted.get(key);
      if (!existing || company.signals.length > existing.signals.length) {
        seenExtracted.set(key, company);
      }
    }
    const batchDeduped = Array.from(seenExtracted.values());
    if (batchDeduped.length < extracted.length) {
      console.log(`Batch pre-dedup: ${extracted.length} → ${batchDeduped.length} unique companies`);
    }

    // Skip companies we already scored in the last 30 days, UNLESS this
    // article reports a fresh event (funding or product launch) — that
    // changes the urgency and warrants a fresh look.
    const previouslySeen = new Set(state.seen_companies.map((e) => e.name));
    const toScore = batchDeduped.filter((company) => {
      const key = company.company_name.toLowerCase().trim();
      if (!previouslySeen.has(key)) return true;
      const isFreshEvent =
        company.event_type === "funding_announcement" ||
        company.event_type === "product_launch";
      if (isFreshEvent) {
        console.log(`Re-scoring ${company.company_name}: fresh ${company.event_type}`);
        return true;
      }
      return false;
    });
    const skippedSeen = batchDeduped.length - toScore.length;
    if (skippedSeen > 0) {
      console.log(`Seen-companies filter: skipped ${skippedSeen} already-evaluated companies`);
    }
    console.log(`Sending ${toScore.length} companies to scoring`);

    const { scored, state: stateAfterScoring } =
      await geminiClient.scoreCompanies(config, state, icp, toScore);
    state = stateAfterScoring;

    const highCount = scored.filter((c) => c.confidence === "HIGH").length;
    const medCount = scored.filter((c) => c.confidence === "MEDIUM").length;
    console.log(`Scoring: ${scored.length} qualified (${highCount} HIGH, ${medCount} MEDIUM)`);

    const existingNames = await sheetsClient.getExistingBusinessNames();
    console.log(`CRM deduplication: checking against ${existingNames.length} existing leads`);

    const dedupedToday: typeof scored = [];
    const seenThisBatch: string[] = [];
    let filteredByCrm = 0;
    let filteredByBatch = 0;

    for (const company of scored) {
      const name = company.company_name;

      let isDuplicateExisting = false;
      for (const existing of existingNames) {
        const sim = similarityPercentage(existing, name);
        if (sim > 80) {
          isDuplicateExisting = true;
          break;
        }
      }
      if (isDuplicateExisting) {
        filteredByCrm++;
        continue;
      }

      let isDuplicateToday = false;
      for (const seen of seenThisBatch) {
        const sim = similarityPercentage(seen, name);
        if (sim > 80) {
          isDuplicateToday = true;
          break;
        }
      }
      if (isDuplicateToday) {
        filteredByBatch++;
        continue;
      }

      seenThisBatch.push(name);
      dedupedToday.push(company);
    }

    afterDeduplication = dedupedToday.length;
    console.log(
      `Deduplication: ${afterDeduplication} remain (${filteredByCrm} matched CRM, ${filteredByBatch} matched batch)`,
    );

    // Sort: HIGH before MEDIUM, then by article recency within each tier.
    dedupedToday.sort((a, b) => {
      const confOrder = (c: "HIGH" | "MEDIUM") => (c === "HIGH" ? 0 : 1);
      const confDiff = confOrder(a.confidence) - confOrder(b.confidence);
      if (confDiff !== 0) return confDiff;
      const dateA = a.articleDate ? new Date(a.articleDate).getTime() : 0;
      const dateB = b.articleDate ? new Date(b.articleDate).getTime() : 0;
      return dateB - dateA;
    });

    // Take ALL HIGH confidence leads — never leave a hot lead behind.
    // Fill remaining slots with MEDIUM leads up to a daily cap of 20.
    const DAILY_MEDIUM_CAP = 20;
    const highLeads = dedupedToday.filter((c) => c.confidence === "HIGH");
    const mediumLeads = dedupedToday.filter((c) => c.confidence === "MEDIUM");
    const mediumSlots = Math.max(0, DAILY_MEDIUM_CAP - highLeads.length);
    const finalLeads = [...highLeads, ...mediumLeads.slice(0, mediumSlots)];
    console.log(
      `Final: ${highLeads.length} HIGH (all kept) + ${Math.min(mediumLeads.length, mediumSlots)} of ${mediumLeads.length} MEDIUM = ${finalLeads.length} leads`,
    );

    writtenToCrm = await sheetsClient.appendLeads(
      finalLeads,
      runDateIso,
      config.runEnv,
    );

    const processedIds = allArticles.map((a) => a.id);
    state.last_run = runStartedAt.toISOString();
    state.processed_guids = [...state.processed_guids, ...processedIds];

    // Record all scored companies so we don't re-score them tomorrow
    const newSeenEntries = toScore.map((c) => ({
      name: c.company_name.toLowerCase().trim(),
      seen_date: runDateIso,
    }));
    state.seen_companies = [...state.seen_companies, ...newSeenEntries];

    saveState(state);
  } catch (error) {
    console.error("Angler run encountered an error:", error);
    status = "partial";
    notes = String(error instanceof Error ? error.message : error);
  } finally {
    const geminiAfter = state.gemini_calls_today;
    const serpAfter = state.serpapi_calls_today.count;

    const logEntry: RunLogEntry = {
      runDateIso,
      articlesProcessed,
      companiesExtracted,
      afterDeduplication,
      writtenToCrm,
      geminiCallsUsed: geminiAfter - geminiBefore,
      serpApiCallsUsed: serpAfter - serpBefore,
      status,
      notes,
    };

    try {
      const sheetsClientForLog = new SheetsClient(config);
      await sheetsClientForLog.appendRunLog(logEntry);
    } catch (logError) {
      console.error("Failed to write Angler run log:", logError);
    }
  }
}

