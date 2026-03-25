import axios from "axios";
import { AnglerState, canUseSerpApi, registerSerpApiCall } from "../state/state";
import { ArticleItem } from "./rss";

const SERPAPI_ENDPOINT = "https://serpapi.com/search";

// All queries run every day up to the daily cap (8). Ordered by expected
// signal quality — highest-value queries first so cap-hits drop the weakest.
const QUERIES: string[] = [
  // ── African fintechs (local) — hottest signal ─────────────────────────────
  // Funding = company just got budget to spend on infrastructure
  `fintech startup Africa "Series A" OR "seed" funding 2026`,
  `Nigeria OR Kenya OR Ghana fintech raised funding 2026`,

  // ── Global remittance & diaspora corridors ───────────────────────────────
  // Non-African companies sending money TO Africa are a direct Payments/FX fit
  `"remittance" OR "money transfer" Africa startup launch OR funding 2026`,
  `diaspora fintech "send money" Africa OR Nigeria OR Kenya 2026`,

  // ── USD card issuance / USD-scarce markets ───────────────────────────────
  `"virtual dollar card" OR "USD card" OR "virtual card" Nigeria OR Ghana OR Ethiopia OR Zimbabwe 2026`,

  // ── Global businesses entering African currencies ─────────────────────────
  `startup "Africa expansion" OR "African market" OR "entering Africa" fintech 2026`,

  // ── Infrastructure & product launch sweeps ──────────────────────────────
  `"BaaS" OR "banking as a service" OR "card issuing" Africa`,
  `"digital wallet" OR "neobank" OR "payment" Africa launch 2026`,
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
      const res = await axios.get(SERPAPI_ENDPOINT, {
        params: {
          api_key: serpApiKey,
          engine: "google",
          q: query,
          num: 20, // 20 results per query instead of default ~10
        },
      });
      // Count the call only after a successful HTTP response — a 429 or 5xx
      // should not consume the daily budget.
      workingState = registerSerpApiCall(workingState);

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

