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

    const { scored, state: stateAfterScoring } =
      await geminiClient.scoreCompanies(config, state, icp, extracted);
    state = stateAfterScoring;

    const highCount = scored.filter((c) => c.confidence === "HIGH").length;
    const medCount = scored.filter((c) => c.confidence === "MEDIUM").length;
    console.log(`Scoring: ${scored.length} qualified (${highCount} HIGH, ${medCount} MEDIUM)`);

    const existingNames = await sheetsClient.getExistingBusinessNames();
    console.log(`CRM deduplication: checking against ${existingNames.length} existing leads`);

    const dedupedToday: typeof scored = [];
    const seenNames: string[] = [];
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
      for (const seen of seenNames) {
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

      seenNames.push(name);
      dedupedToday.push(company);
    }

    afterDeduplication = dedupedToday.length;
    console.log(
      `Deduplication: ${afterDeduplication} remain (${filteredByCrm} matched CRM, ${filteredByBatch} matched batch)`,
    );

    dedupedToday.sort((a, b) => {
      const confOrder = (c: "HIGH" | "MEDIUM") => (c === "HIGH" ? 0 : 1);
      const confDiff = confOrder(a.confidence) - confOrder(b.confidence);
      if (confDiff !== 0) return confDiff;
      const dateA = a.articleDate ? new Date(a.articleDate).getTime() : 0;
      const dateB = b.articleDate ? new Date(b.articleDate).getTime() : 0;
      return dateB - dateA;
    });

    const topTen = dedupedToday.slice(0, 10);

    writtenToCrm = await sheetsClient.appendLeads(
      topTen,
      runDateIso,
      config.runEnv,
    );

    const processedIds = allArticles.map((a) => a.id);
    state.last_run = runStartedAt.toISOString();
    state.processed_guids = [...state.processed_guids, ...processedIds];

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

