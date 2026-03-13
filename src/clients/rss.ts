import Parser from "rss-parser";
import { AnglerState } from "../state/state";

export interface ArticleItem {
  id: string;
  title: string;
  description: string;
  link: string;
  pubDate: string | undefined;
  source: string;
}

const FEEDS: { name: string; url: string }[] = [
  { name: "TechCabal", url: "https://techcabal.com/feed/" },
  { name: "Disrupt Africa", url: "https://disrupt-africa.com/feed/" },
  { name: "Nairametrics Fintech", url: "https://nairametrics.com/category/fintech/feed/" },
  { name: "The Fintech Times", url: "https://thefintechtimes.com/feed/" },
  { name: "Fintech Nexus", url: "https://fintechnexus.com/feed/" },
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
      for (const item of parsed.items) {
        const guid = (item.guid as string) || (item.link as string) || "";
        if (!guid) continue;
        if (state.processed_guids.includes(guid)) continue;

        const pubDate = item.pubDate ? new Date(item.pubDate) : undefined;
        if (!isNewSinceLastRun(pubDate, state.last_run)) continue;

        articles.push({
          id: guid,
          title: (item.title as string) || "",
          description: (item.contentSnippet as string) || (item.content as string) || "",
          link: (item.link as string) || "",
          pubDate: item.pubDate,
          source: feed.name,
        });
      }
    } catch (error) {
      console.error(`Failed to fetch RSS from ${feed.name}:`, error);
    }
  }

  return articles;
}

