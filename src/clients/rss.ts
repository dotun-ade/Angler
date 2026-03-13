import Parser from "rss-parser";
import { AnglerState } from "../state/state";

export interface ArticleItem {
  id: string;
  title: string;
  description: string;
  link: string;
  pubDate?: string;
  source: string;
}

// ---------------------------------------------------------------------------
// Editorial feeds — African & global fintech news
// ---------------------------------------------------------------------------
const EDITORIAL_FEEDS: { name: string; url: string }[] = [
  { name: "TechCabal", url: "https://techcabal.com/feed/" },
  { name: "Disrupt Africa", url: "https://disrupt-africa.com/feed/" },
  { name: "Nairametrics", url: "https://nairametrics.com/feed/" },
  { name: "The Fintech Times", url: "https://thefintechtimes.com/feed/" },
  // Fintech Nexus rebranded to Future Nexus in Feb 2025
  { name: "Future Nexus", url: "https://news.fintechnexus.com/feed/" },
  { name: "Techpoint Africa", url: "https://techpoint.africa/feed/" },
  { name: "WeeTracker", url: "https://weetracker.com/feed/" },
  // Ventures Africa returns 526 (Cloudflare SSL error) from Railway's IPs
  { name: "BusinessDay Nigeria", url: "https://businessday.ng/feed/" },
  { name: "IT News Africa", url: "https://www.itnewsafrica.com/feed/" },
];

// ---------------------------------------------------------------------------
// Google News RSS — free keyword-based feeds, no API budget consumed.
// Each query returns ~10 fresh results per day. Queries target Anchor's ICP:
// African fintechs that need payments, cards, or banking infrastructure.
// ---------------------------------------------------------------------------
const GN = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const GOOGLE_NEWS_FEEDS: { name: string; url: string }[] = [
  // Broad fintech sweep
  {
    name: "GNews: Africa fintech startup",
    url: GN("fintech startup Africa"),
  },
  // Funding signals — hottest leads
  {
    name: "GNews: Africa payments funding",
    url: GN("payments startup Nigeria OR Kenya OR Ghana funding"),
  },
  {
    name: "GNews: Africa Series A seed",
    url: GN('"Series A" OR "seed round" Africa startup 2026'),
  },
  // Infrastructure-specific
  {
    name: "GNews: BaaS card issuing Africa",
    url: GN('"card issuing" OR "banking as a service" OR BaaS Africa'),
  },
  // Product launch signals
  {
    name: "GNews: Africa neobank wallet launch",
    url: GN('"neobank" OR "digital bank" OR "digital wallet" Africa launch 2026'),
  },
  // Adjacent high-need verticals
  {
    name: "GNews: Africa gig logistics fintech",
    url: GN('"gig economy" OR "logistics" Africa fintech payments 2026'),
  },
  // Virtual cards specifically
  {
    name: "GNews: Africa virtual card",
    url: GN('"virtual card" Africa startup 2026'),
  },
  // Lending and BNPL — always need disbursement infrastructure
  {
    name: "GNews: Africa lending BNPL",
    url: GN('"lending" OR "BNPL" OR "buy now pay later" Africa startup funding'),
  },
];

const FEEDS: { name: string; url: string }[] = [
  ...EDITORIAL_FEEDS,
  ...GOOGLE_NEWS_FEEDS,
];

const parser = new Parser();

function isNewSinceLastRun(
  itemDate: Date | undefined,
  lastRunIso: string | undefined,
): boolean {
  if (!lastRunIso) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    return itemDate ? itemDate >= cutoff : true;
  }
  if (!itemDate) return false;
  return itemDate > new Date(lastRunIso);
}

export async function fetchRssArticles(state: AnglerState): Promise<ArticleItem[]> {
  const articles: ArticleItem[] = [];

  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      let newCount = 0;
      let skippedProcessed = 0;
      let skippedOld = 0;

      for (const item of parsed.items) {
        const guid = (item.guid as string) || (item.link as string) || "";
        if (!guid) continue;

        if (state.processed_guids.includes(guid)) {
          skippedProcessed++;
          continue;
        }

        const pubDate = item.pubDate ? new Date(item.pubDate) : undefined;
        if (!isNewSinceLastRun(pubDate, state.last_run)) {
          skippedOld++;
          continue;
        }

        articles.push({
          id: guid,
          title: (item.title as string) || "",
          description: (item.contentSnippet as string) || (item.content as string) || "",
          link: (item.link as string) || "",
          pubDate: item.pubDate,
          source: feed.name,
        });
        newCount++;
      }

      console.log(
        `RSS ${feed.name}: ${newCount} new, ${skippedProcessed} already processed, ${skippedOld} too old`,
      );
    } catch (error) {
      console.error(`Failed to fetch RSS from ${feed.name}:`, error);
    }
  }

  return articles;
}

