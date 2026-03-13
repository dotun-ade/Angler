import axios from "axios";
import { AnglerState, canUseSerpApi, registerSerpApiCall } from "../state/state";
import { ArticleItem } from "./rss";

const SERPAPI_ENDPOINT = "https://serpapi.com/search";

const QUERY_ROTATION = [
  `"fintech startup" Africa "Series A" OR "seed funding" 2026`,
  `"payments" OR "card issuing" OR "banking" Africa startup`,
  `"BaaS" OR "banking as a service" Africa OR Nigeria OR Kenya`,
];

function pickQueriesForToday(): string[] {
  const today = new Date().toISOString().slice(0, 10);
  const hash = today.split("-").join("");
  const idx = Number(hash) % QUERY_ROTATION.length;
  const ordered = [
    QUERY_ROTATION[idx],
    QUERY_ROTATION[(idx + 1) % QUERY_ROTATION.length],
    QUERY_ROTATION[(idx + 2) % QUERY_ROTATION.length],
  ];
  return ordered;
}

export async function fetchSerpApiArticles(
  state: AnglerState,
  serpApiKey: string,
): Promise<{ articles: ArticleItem[]; state: AnglerState }> {
  let workingState = state;
  const articles: ArticleItem[] = [];

  const queries = pickQueriesForToday();

  for (const query of queries) {
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
        },
      });

      const organic = res.data?.organic_results as any[] | undefined;
      if (!organic) continue;

      for (const r of organic) {
        if (!r.title || !r.link) continue;
        articles.push({
          id: r.link as string,
          title: r.title as string,
          description: (r.snippet as string) || "",
          link: r.link as string,
          pubDate: undefined,
          source: "SerpAPI",
        });
      }
    } catch (error) {
      console.error("SerpAPI error; skipping this query.", error);
    }
  }

  return { articles, state: workingState };
}

