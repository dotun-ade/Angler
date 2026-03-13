import axios from "axios";
import { AnglerState, canUseSerpApi, registerSerpApiCall } from "../state/state";
import { ArticleItem } from "./rss";

const SERPAPI_ENDPOINT = "https://serpapi.com/search";

// All queries run every day up to the daily cap. Ordered by expected signal
// quality — highest-value queries first so cap-hits sacrifice the weakest ones.
const QUERIES: string[] = [
  // Funding announcements — hottest signal, company just got money to spend
  `fintech startup Africa "Series A" OR "seed" funding 2026`,
  `Nigeria OR Kenya OR Ghana fintech raised funding 2026`,
  // Product launches in core markets
  `"payment" OR "wallet" OR "card" startup Africa launch 2026`,
  // Infrastructure-specific signals
  `"BaaS" OR "banking as a service" OR "card issuing" Africa`,
  `"virtual card" OR "card issuing" startup Africa 2026`,
  // Adjacent sectors with high payments need
  `"gig economy" OR "logistics" OR "lending" Africa startup 2026`,
  // Broader sweep for anything missed above
  `fintech Nigeria OR Kenya OR Ghana "launched" OR "expanding" 2026`,
  `"digital wallet" OR "neobank" Africa 2026`,
];

export async function fetchSerpApiArticles(
  state: AnglerState,
  serpApiKey: string,
): Promise<{ articles: ArticleItem[]; state: AnglerState }> {
  let workingState = state;
  const articles: ArticleItem[] = [];
  const seenLinks = new Set<string>();

  for (const query of QUERIES) {
    if (!canUseSerpApi(workingState)) {
      console.log("SerpAPI daily cap reached; skipping remaining queries.");
      break;
    }

    try {
      workingState = registerSerpApiCall(workingState);
      const res = await axios.get(SERPAPI_ENDPOINT, {
        params: {
          api_key: serpApiKey,
          engine: "google",
          q: query,
          num: 20, // 20 results per query instead of default ~10
        },
      });

      const organic = res.data?.organic_results as any[] | undefined;
      if (!organic) {
        console.log(`SerpAPI: no organic results for query: ${query}`);
        continue;
      }

      let newFromQuery = 0;
      for (const r of organic) {
        if (!r.title || !r.link) continue;
        if (seenLinks.has(r.link as string)) continue; // dedup across queries
        seenLinks.add(r.link as string);
        articles.push({
          id: r.link as string,
          title: r.title as string,
          description: (r.snippet as string) || "",
          link: r.link as string,
          pubDate: undefined,
          source: `SerpAPI`,
        });
        newFromQuery++;
      }
      console.log(`SerpAPI query ${workingState.serpapi_calls_today.count}: ${newFromQuery} results`);
    } catch (error) {
      console.error("SerpAPI error; skipping this query.", error);
    }
  }

  console.log(`SerpAPI total: ${articles.length} unique results`);
  return { articles, state: workingState };
}

