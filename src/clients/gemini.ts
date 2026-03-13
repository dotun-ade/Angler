import { GoogleGenerativeAI } from "@google/generative-ai";
import { AnglerConfig } from "../utils/config";
import {
  AnglerState,
  canUseGemini,
  registerGeminiCall,
} from "../state/state";
import { ArticleItem } from "./rss";
import { fetchGoogleDocText } from "./docs";

export interface IcpCriteria {
  target_geographies: string[];
  target_industries: string[];
  product_signals: string[];
  negative_signals?: string[];
  stage_signals: string[];
}

export type FundingStage = "pre-seed" | "seed" | "Series A" | "Series B+" | "bootstrapped" | null;
export type EventType = "funding_announcement" | "product_launch" | "expansion" | "partnership" | "other" | null;

export interface ExtractedCompany {
  company_name: string;
  country: string | null;
  description: string;
  source_url: string;
  signals: string[];
  funding_stage: FundingStage;
  event_type: EventType;
  articleId: string | undefined;
  articleDate: string | undefined;
}

export type PrimaryProduct =
  | "Cards"
  | "BaaS"
  | "Payments"
  | "Business Banking"
  | "Virtual Accounts"
  | "Global Services"
  | "Digizone";

export const VALID_PRIMARY_PRODUCTS: PrimaryProduct[] = [
  "Cards",
  "BaaS",
  "Payments",
  "Business Banking",
  "Virtual Accounts",
  "Global Services",
  "Digizone",
];

export interface ScoredCompany {
  company_name: string;
  confidence: "HIGH" | "MEDIUM";
  primary_product: PrimaryProduct;
  match_reason: string;
  source_url: string;
  articleId: string | undefined;
  articleDate: string | undefined;
}

const FALLBACK_ICP: IcpCriteria = {
  target_geographies: ["Nigeria", "Kenya", "Ghana", "South Africa", "Egypt", "Rwanda"],
  target_industries: ["Fintech", "SaaS & Tech", "Retail & E-Commerce", "Web3"],
  product_signals: [
    "payments",
    "virtual card",
    "wallet",
    "disbursement",
    "card issuing",
    "banking API",
    "payout",
    "collection",
    "BaaS",
    "banking infrastructure",
    "remittance",
  ],
  stage_signals: ["launched", "Series A", "seed", "raised", "new product", "expanding"],
};

export class GeminiClient {
  private genAi: GoogleGenerativeAI;
  private modelName: string;

  constructor(config: AnglerConfig) {
    this.genAi = new GoogleGenerativeAI(config.geminiApiKey);
    this.modelName = config.geminiModel || "gemini-2.5-flash";
  }

  private getModel() {
    return this.genAi.getGenerativeModel({ model: this.modelName });
  }

  private stripJsonFences(text: string): string {
    // Gemini sometimes wraps JSON in ```json ... ``` or ``` ... ``` despite
    // being told not to. Strip fences before parsing.
    return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  }

  async parseIcpDoc(
    config: AnglerConfig,
    state: AnglerState,
  ): Promise<{ icp: IcpCriteria; state: AnglerState }> {
    if (!canUseGemini(state, config.runEnv)) {
      console.log("Gemini quota exceeded; using fallback ICP criteria.");
      return { icp: FALLBACK_ICP, state };
    }

    const docText = await fetchGoogleDocText(
      config.snapperDocId,
      config.googleServiceAccountJson,
    );

    if (!docText) {
      console.warn("Snapper doc unavailable; using fallback ICP criteria. Gemini call skipped.");
      return { icp: FALLBACK_ICP, state };
    }

    const prompt = [
      "You are reading an ICP (Ideal Customer Profile) analysis document for Anchor, a Nigerian fintech infrastructure company offering banking, payments, and card-issuing APIs.\n",
      "Extract the following as structured JSON:",
      "- target_geographies: array of country or region names that appear as strong ICP signals",
      '- target_industries: array of industry labels (e.g. "Fintech", "Retail & E-Commerce")',
      '- product_signals: array of keywords or phrases that indicate a company needs Anchor\'s products (e.g. "virtual cards", "payment collection", "wallet", "disbursement")',
      "- negative_signals: array of keywords or company types that are explicitly poor fit",
      '- stage_signals: array of phrases indicating company stage that converts well (e.g. "Series A", "early stage", "recently launched")',
      "",
      "Document:",
      `<DOC_TEXT>${docText}</DOC_TEXT>`,
      "",
      "Return only valid JSON, no explanation.",
    ].join("\n");

    try {
      const model = this.getModel();
      const updatedState = registerGeminiCall(state, config.runEnv);
      const result = await model.generateContent(prompt);
      const text = this.stripJsonFences(result.response.text());
      const parsed = JSON.parse(text) as IcpCriteria;
      return { icp: parsed, state: updatedState };
    } catch (error) {
      console.error("Gemini ICP parse failed, using fallback ICP criteria.", error);
      return { icp: FALLBACK_ICP, state };
    }
  }

  async extractCompaniesFromArticles(
    config: AnglerConfig,
    state: AnglerState,
    articles: ArticleItem[],
  ): Promise<{ companies: ExtractedCompany[]; state: AnglerState }> {
    const allCompanies: ExtractedCompany[] = [];
    let workingState = state;

    const batches: ArticleItem[][] = [];
    for (let i = 0; i < articles.length; i += 15) {
      batches.push(articles.slice(i, i + 15));
    }

    for (const batch of batches) {
      if (!canUseGemini(workingState, config.runEnv)) {
        console.log("Gemini quota exceeded during extraction; stopping further batches.");
        break;
      }

      const model = this.getModel();
      const articlesJson = JSON.stringify(
        batch.map((a, index) => ({
          id: index + 1,
          title: a.title,
          description: a.description,
          link: a.link,
        })),
      );

      const prompt = [
        "You are extracting company mentions from tech news articles to identify prospective customers for Anchor — a Nigerian fintech infrastructure company offering banking, payments, and card-issuing APIs to businesses.",
        "",
        "For each article, identify companies that are BUILDING a product or service and could plausibly need payments infrastructure, card issuing, or banking APIs. Be inclusive at this stage — scoring happens later.",
        "",
        "For each company found, return:",
        "- company_name: canonical business name",
        "- country: country of operation or HQ if mentioned, else null",
        "- description: one sentence describing what the company does, max 25 words",
        "- source_url: the article link",
        "- signals: array of 1–3 keywords suggesting a payments/banking infrastructure need",
        '- funding_stage: the company\'s funding stage if mentioned, else null. Must be one of: "pre-seed", "seed", "Series A", "Series B+", "bootstrapped", null',
        '- event_type: the type of news event. Must be one of: "funding_announcement", "product_launch", "expansion", "partnership", "other"',
        "",
        "Skip: traditional banks, central banks, microfinance banks, regulators, telecoms, pure media companies, law firms, investors/VCs.",
        "",
        "Articles:",
        `<ARTICLES_JSON>${articlesJson}</ARTICLES_JSON>`,
        "",
        "Return a JSON array. Multiple companies per article is fine. If no qualifying company is mentioned, return an empty array.",
      ].join("\n");

      try {
        workingState = registerGeminiCall(workingState, config.runEnv);
        const result = await model.generateContent(prompt);
        const text = this.stripJsonFences(result.response.text());
        const parsed = JSON.parse(text) as ExtractedCompany[];

        for (const company of parsed) {
          const sourceArticle = batch.find((a) => a.link === company.source_url);
          allCompanies.push({
            ...company,
            articleId: sourceArticle?.id,
            articleDate: sourceArticle?.pubDate,
          });
        }
      } catch (error) {
        console.error("Gemini extraction failed for batch; skipping batch.", error);
      }
    }

    return { companies: allCompanies, state: workingState };
  }

  async scoreCompanies(
    config: AnglerConfig,
    state: AnglerState,
    icp: IcpCriteria,
    companies: ExtractedCompany[],
  ): Promise<{ scored: ScoredCompany[]; state: AnglerState }> {
    const allScored: ScoredCompany[] = [];
    let workingState = state;

    const batches: ExtractedCompany[][] = [];
    for (let i = 0; i < companies.length; i += 15) {
      batches.push(companies.slice(i, i + 15));
    }

    for (const batch of batches) {
      if (!canUseGemini(workingState, config.runEnv)) {
        console.log("Gemini quota exceeded during scoring; stopping further batches.");
        break;
      }

      const model = this.getModel();
      const companiesJson = JSON.stringify(batch);
      const validProductsList = VALID_PRIMARY_PRODUCTS.map((p) => `"${p}"`).join(", ");
      const prompt = [
        "You are a senior sales manager at Anchor, a Nigerian fintech infrastructure company. You are reviewing a list of companies to decide which ones to add to the sales pipeline.",
        "",
        "Anchor's products:",
        "- Payments: Naira payins and payouts via API. Best for: payment apps, lending apps, savings apps, gig platforms disbursing to workers, merchants collecting online.",
        "- Virtual Accounts / Sub-Accounts: unique account numbers per customer for reconciliation. Best for: marketplaces, aggregators, any company collecting from many payers.",
        "- BaaS / Deposit Accounts: full banking infrastructure. Best for: fintechs building neobanks, wallets, or financial super-apps.",
        "- Virtual USD Cards: issue USD cards to businesses or their customers. Works globally. Best for: companies paying international vendors, SaaS tools, import/export businesses, consumer card products.",
        "- Business Banking: bank accounts for businesses. Best for: startups and SMEs that need a business account.",
        "- Global Services: cross-border and FX solutions.",
        "- Digizone: digital goods and airtime/data.",
        "",
        "Anchor's core markets: Nigeria, Kenya, Ghana. Cards work globally but Africa-based companies are preferred.",
        "",
        "Additional ICP signals from Anchor's latest analysis:",
        `<ICP_JSON>${JSON.stringify(icp)}</ICP_JSON>`,
        "",
        "SCORING RULES:",
        "",
        "Score HIGH if the company clearly needs Anchor's infrastructure AND has a strong timing signal:",
        "- Operating or launching in Nigeria, Kenya, or Ghana",
        "- Building a financial product: wallet, payment app, lending, savings, remittance, card product, or any platform that moves money",
        "- Has a clear trigger: funding_stage is 'seed', 'Series A', or 'Series B+', OR event_type is 'funding_announcement' or 'product_launch'",
        "- Is a startup or growth-stage company, not a bank, MFB, telco, or large enterprise",
        "",
        "Score MEDIUM if the company is a plausible fit but something is unclear or indirect:",
        "- Right geography but product is adjacent (e-commerce, logistics, HR tech, gig economy) rather than explicitly financial",
        "- Right product type but geography is outside core markets (South Africa, Egypt, Rwanda, rest of Africa)",
        "- Clear fit but no timing trigger visible in the article",
        "- Series B+ with a clear need (may already have infrastructure, but worth a conversation)",
        "",
        "Do NOT return companies that are:",
        "- Traditional banks, microfinance banks, telcos, or large enterprises with their own infrastructure",
        "- Outside Africa with no clear Africa-facing product",
        "- Companies where the connection to Anchor's products requires more than one logical step",
        "",
        "For each company you include, return:",
        "- company_name: as provided",
        "- confidence: HIGH or MEDIUM only",
        `- primary_product: must be exactly one of [${validProductsList}]`,
        "- match_reason: one sharp sentence (max 20 words) stating WHY they need Anchor — be specific, not generic",
        "",
        "Companies to score:",
        `<COMPANIES_JSON>${companiesJson}</COMPANIES_JSON>`,
        "",
        "Return valid JSON array only. Omit LOW confidence companies entirely.",
      ].join("\n");

      try {
        workingState = registerGeminiCall(workingState, config.runEnv);
        const result = await model.generateContent(prompt);
        const text = this.stripJsonFences(result.response.text());
        const parsed = JSON.parse(text) as ScoredCompany[];

        for (const company of parsed) {
          if (company.confidence !== "HIGH" && company.confidence !== "MEDIUM") {
            continue;
          }
          if (!VALID_PRIMARY_PRODUCTS.includes(company.primary_product)) {
            continue;
          }

          // Match by company_name only — Gemini does not return source_url in
          // scoring output, so matching on it would always fail and leave
          // source_url / articleDate undefined.
          const original = companies.find(
            (c) => c.company_name === company.company_name,
          );

          allScored.push({
            ...company,
            source_url: original?.source_url ?? "",
            articleId: original?.articleId,
            articleDate: original?.articleDate,
          });
        }
      } catch (error) {
        console.error("Gemini scoring failed for batch; skipping batch.", error);
      }
    }

    return { scored: allScored, state: workingState };
  }
}

