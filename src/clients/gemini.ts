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

export interface ExtractedCompany {
  company_name: string;
  country: string | null;
  description: string;
  source_url: string;
  signals: string[];
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
        "For each article below, identify any companies mentioned that:",
        "- Are building a product or service (not just investors, journalists, or regulators)",
        "- Appear to be a business that could need payments, virtual card issuing, or banking infrastructure",
        "",
        "For each company found, return:",
        "- company_name: canonical business name (not a product name unless the company is named after its product)",
        "- country: country of operation or HQ if mentioned, else null",
        "- description: one sentence from the article describing what the company does, max 25 words",
        "- source_url: the article link",
        "- signals: array of 1–3 keywords from the article that suggest a payments/banking infrastructure need",
        "",
        "Ignore companies that are: traditional banks, regulators, telecoms, journalists, pure software tools with no financial product.",
        "",
        "Articles:",
        `<ARTICLES_JSON>${articlesJson}</ARTICLES_JSON>`,
        "",
        "Return a JSON array. One object per company found. Multiple companies per article is fine. If an article mentions no qualifying company, skip it entirely.",
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
        "You are scoring prospective companies for Anchor — a Nigerian fintech infrastructure company offering:",
        "- Virtual USD Cards (card issuing for businesses)",
        "- BaaS / Deposit Accounts (banking infrastructure for fintechs)",
        "- Payments (payins and payouts, Naira)",
        "- Virtual Accounts and Sub-Accounts",
        "- Business Banking",
        "- Global Services (cross-border / FX products)",
        "- Digizone (digital goods and services)",
        "",
        "ICP criteria:",
        `<ICP_JSON>${JSON.stringify(icp)}</ICP_JSON>`,
        "",
        "For each company below, return:",
        "- company_name: as provided",
        "- confidence: HIGH, MEDIUM, or LOW",
        `- primary_product: the single most likely Anchor product this company would need. Must be exactly one of: [${validProductsList}]. Choose "Payments" if unclear between Payments/BaaS.`,
        "- match_reason: one sentence, max 20 words, explaining why this company is a fit",
        "",
        "Companies:",
        `<COMPANIES_JSON>${companiesJson}</COMPANIES_JSON>`,
        "",
        "Return only HIGH and MEDIUM confidence results. Do not return LOW confidence companies at all. Return valid JSON array only.",
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

