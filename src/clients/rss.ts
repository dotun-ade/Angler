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
// Editorial feeds — African & global fintech/payments news
// ---------------------------------------------------------------------------
const EDITORIAL_FEEDS: { name: string; url: string }[] = [
  // African fintech
  { name: "TechCabal", url: "https://techcabal.com/feed/" },
  { name: "Disrupt Africa", url: "https://disrupt-africa.com/feed/" },
  { name: "Nairametrics", url: "https://nairametrics.com/feed/" },
  { name: "Techpoint Africa", url: "https://techpoint.africa/feed/" },
  { name: "WeeTracker", url: "https://weetracker.com/feed/" },
  // Ventures Africa returns 526 (Cloudflare SSL error) from Railway's IPs
  { name: "BusinessDay Nigeria", url: "https://businessday.ng/feed/" },
  { name: "IT News Africa", url: "https://www.itnewsafrica.com/feed/" },
  // Global fintech & payments — captures remittance, cross-border, diaspora
  { name: "The Fintech Times", url: "https://thefintechtimes.com/feed/" },
  // Fintech Nexus rebranded to Future Nexus in Feb 2025
  { name: "Future Nexus", url: "https://news.fintechnexus.com/feed/" },
  { name: "PYMNTS", url: "https://www.pymnts.com/feed/" },
  { name: "Finextra", url: "https://www.finextra.com/rss/headlines.aspx" },
  { name: "Fintech Futures", url: "https://www.fintechfutures.com/feed/" },
  // MENA
  { name: "Wamda", url: "https://www.wamda.com/feed" },
  // South Asia
  { name: "Inc42", url: "https://inc42.com/feed/" },
  // Latin America
  { name: "Contxto", url: "https://contxto.com/en/feed/" },
];

// ---------------------------------------------------------------------------
// Google News RSS — free keyword-based feeds, no API budget consumed.
// Each query returns ~10 fresh results per day. Queries target Anchor's ICP:
// African fintechs that need payments, cards, or banking infrastructure.
// ---------------------------------------------------------------------------
const GN = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const GOOGLE_NEWS_FEEDS: { name: string; url: string }[] = [
  // ── African fintech (local segment) ───────────────────────────────────────
  {
    name: "GNews: Africa fintech startup",
    url: GN("fintech startup Africa"),
  },
  {
    name: "GNews: Africa payments funding",
    url: GN("payments startup Nigeria OR Kenya OR Ghana funding"),
  },
  {
    name: "GNews: Africa Series A seed",
    url: GN('"Series A" OR "seed round" Africa startup 2026'),
  },
  {
    name: "GNews: BaaS card issuing Africa",
    url: GN('"card issuing" OR "banking as a service" OR BaaS Africa'),
  },
  {
    name: "GNews: Africa neobank wallet launch",
    url: GN('"neobank" OR "digital bank" OR "digital wallet" Africa launch 2026'),
  },
  {
    name: "GNews: Africa gig mobility fintech",
    url: GN('"gig economy" OR "ride-hailing" OR "mobility" OR "fleet management" Africa fintech payments 2026'),
  },
  {
    name: "GNews: Africa virtual card",
    url: GN('"virtual card" Africa startup 2026'),
  },
  {
    name: "GNews: Africa lending BNPL",
    url: GN('"lending" OR "BNPL" OR "buy now pay later" Africa startup funding'),
  },

  // ── Global remittance & diaspora corridors ───────────────────────────────
  {
    name: "GNews: remittance Africa corridor",
    url: GN('"remittance" OR "money transfer" Africa 2026'),
  },
  {
    name: "GNews: diaspora fintech",
    url: GN('diaspora fintech OR "send money" Africa Nigeria OR Kenya OR Ghana 2026'),
  },
  {
    name: "GNews: cross-border payments Africa",
    url: GN('"cross-border payments" OR "cross-border" Africa startup 2026'),
  },
  {
    name: "GNews: remittance Europe to Africa",
    url: GN('remittance OR "money transfer" Africa Europe OR UK OR France OR Germany startup 2026'),
  },
  {
    name: "GNews: remittance Asia to Africa",
    url: GN('remittance OR "money transfer" Africa Asia OR China OR India OR UAE startup 2026'),
  },
  {
    name: "GNews: remittance North America to Africa",
    url: GN('remittance OR "money transfer" Africa "United States" OR USA OR Canada startup 2026'),
  },

  // ── USD card issuance / USD-scarce markets ───────────────────────────────
  {
    name: "GNews: virtual USD card Africa",
    url: GN('"virtual dollar card" OR "USD card" OR "dollar card" Africa startup 2026'),
  },
  {
    name: "GNews: virtual USD card MENA Asia",
    url: GN('"virtual dollar card" OR "USD card" OR "dollar card" "Middle East" OR Pakistan OR Turkey OR Bangladesh OR Lebanon startup 2026'),
  },
  {
    name: "GNews: virtual USD card LatAm",
    url: GN('"virtual dollar card" OR "USD card" OR "dollar card" "Latin America" OR Argentina OR Venezuela OR Colombia OR Ecuador startup 2026'),
  },

  // ── MENA fintech ─────────────────────────────────────────────────────────
  {
    name: "GNews: MENA fintech funding",
    url: GN('fintech startup "Middle East" OR UAE OR "Saudi Arabia" OR Egypt funding 2026'),
  },
  {
    name: "GNews: MENA payments neobank",
    url: GN('"digital wallet" OR "neobank" OR payments "Middle East" OR UAE startup 2026'),
  },

  // ── South & Southeast Asia fintech ───────────────────────────────────────
  {
    name: "GNews: South Asia fintech funding",
    url: GN('fintech startup India OR Pakistan OR Bangladesh OR "Sri Lanka" funding 2026'),
  },
  {
    name: "GNews: Southeast Asia fintech",
    url: GN('fintech startup "Southeast Asia" OR Indonesia OR Philippines OR Vietnam funding 2026'),
  },

  // ── Latin America fintech ─────────────────────────────────────────────────
  {
    name: "GNews: LatAm fintech funding",
    url: GN('fintech startup "Latin America" OR Brazil OR Mexico OR Colombia OR Argentina funding 2026'),
  },
  {
    name: "GNews: LatAm payments remittance",
    url: GN('payments OR remittance "Latin America" startup funding 2026'),
  },

  // ── Global businesses entering African currencies ─────────────────────────
  {
    name: "GNews: global company Africa expansion",
    url: GN('startup "Africa expansion" OR "entering Africa" OR "African market" launch 2026'),
  },
  {
    name: "GNews: global fintech Africa market entry",
    url: GN('fintech "Africa" "market entry" OR "expand" OR "launch" 2026'),
  },
];

const FEEDS: { name: string; url: string }[] = [
  ...EDITORIAL_FEEDS,
  ...GOOGLE_NEWS_FEEDS,
];

// 8 s per feed — prevents one slow/hanging feed from blocking the entire run.
// Individual feed errors are caught and skipped; the timeout just ensures the
// catch fires within a predictable window.
const parser = new Parser({ timeout: 8000 });

export async function fetchRssArticles(state: AnglerState): Promise<ArticleItem[]> {
  const articles: ArticleItem[] = [];

  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      let newCount = 0;
      let skippedProcessed = 0;

      for (const item of parsed.items) {
        const guid = (item.guid as string) || (item.link as string) || "";
        if (!guid) continue;

        if (state.processed_guids.includes(guid)) {
          skippedProcessed++;
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
        `RSS ${feed.name}: ${newCount} new, ${skippedProcessed} already processed`,
      );
    } catch (error) {
      console.error(`Failed to fetch RSS from ${feed.name}:`, error);
    }
  }

  return articles;
}

