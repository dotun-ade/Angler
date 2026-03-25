import { GoogleGenerativeAI } from "@google/generative-ai";
import { AnglerConfig } from "../utils/config";
import {
  AnglerState,
  canUseGemini,
  registerGeminiCall,
} from "../state/state";
import { ArticleItem } from "./rss";
import { fetchGoogleDocText } from "./docs";
import { normaliseIndustry } from "../normalisation/industry";
import { normaliseCountry } from "../normalisation/country";
import { normaliseFundingStage } from "../normalisation/funding-stage";
import { normaliseProduct } from "../normalisation/product";
import { sanitiseForPrompt } from "../normalisation/sanitise";
import { isLikelyHeadline } from "../normalisation/headline-detector";
import { logInfo, logWarn, logError } from "../utils/logger";
import { industryPromptList, productPromptList } from "../utils/prompt-helpers";

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
  industry: string | null;   // ← ADDED (Phase 2)
  country: string | null;
  description: string;
  source_url: string;
  signals: string[];
  funding_stage: FundingStage;
  event_type: EventType;
  articleId: string | undefined;
  articleDate: string | undefined;
  website: string | null;
}

export type PrimaryProduct =
  | "Cards"
  | "BaaS"
  | "Payments"
  | "Global Services"
  | "Digizone";

export const VALID_PRIMARY_PRODUCTS: PrimaryProduct[] = [
  "Cards",
  "BaaS",
  "Payments",
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
  country: string | null;
  industry: string | null;
  website: string | null;
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
      logInfo("Gemini quota exceeded; using fallback ICP criteria.");
      return { icp: FALLBACK_ICP, state };
    }

    const docText = await fetchGoogleDocText(
      config.snapperDocId,
      config.googleServiceAccountJson,
    );

    if (!docText) {
      logWarn("Snapper doc unavailable; using fallback ICP criteria. Gemini call skipped.");
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
      logError("Gemini ICP parse failed, using fallback ICP criteria.", { error: String(error) });
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

    // Batch size of 30: Gemini 2.5 Flash handles this comfortably within
    // context limits and halves the number of extraction calls needed.
    const EXTRACTION_BATCH_SIZE = 30;
    const batches: ArticleItem[][] = [];
    for (let i = 0; i < articles.length; i += EXTRACTION_BATCH_SIZE) {
      batches.push(articles.slice(i, i + EXTRACTION_BATCH_SIZE));
    }

    for (const batch of batches) {
      if (!canUseGemini(workingState, config.runEnv)) {
        logInfo("Gemini quota exceeded during extraction; stopping further batches.");
        break;
      }

      const model = this.getModel();

      // Sanitise article content before injection
      const articlesJson = JSON.stringify(
        batch.map((a) => ({
          id: a.id ?? a.link,
          title: sanitiseForPrompt(a.title ?? "", 200),
          description: sanitiseForPrompt(a.description ?? "", 2000),
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
        "- country: ISO 2-letter country code (e.g. NG, KE, ZA, EG) of operation or HQ if mentioned, else null",
        "- description: one sentence describing what the company does, max 25 words",
        "- source_url: the article link",
        "- signals: array of 1–3 keywords suggesting a payments/banking infrastructure need",
        '- funding_stage: the company\'s funding stage if mentioned, else null. Must be one of: "pre-seed", "seed", "Series A", "Series B+", "bootstrapped", null',
        '- event_type: the type of news event. Must be one of: "funding_announcement", "product_launch", "expansion", "partnership", "other"',
        "- industry: the company's industry. Must be exactly one of:",
        "<INDUSTRY_LIST>",
        industryPromptList(),
        "</INDUSTRY_LIST>",
        "Use null if none clearly applies.",
        "- website: the company's homepage URL if clearly stated or inferable from the article, else null",
        "",
        "Disambiguation examples:",
        "- A SaaS payroll product in Lagos → HR, not Fintech",
        "- A blockchain supply chain tracker → consider if the core value is logistics; use Web3 only if decentralisation is the product",
        "- A mobile money platform → Fintech",
        "- An online store or B2C marketplace → Retail & E-Commerce",
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = JSON.parse(text) as any[];

        for (const company of parsed) {
          // 1. Reject empty or whitespace-only company names — an empty key
          //    silently merges entries in dedup and can write blank CRM rows.
          if (!company.company_name?.trim()) {
            logWarn("Rejected extraction result: empty company_name", { raw: company });
            continue;
          }

          // 2. Reject headlines misidentified as company names
          if (isLikelyHeadline(company.company_name)) {
            logWarn("Rejected headline as company name", { name: company.company_name });
            continue;
          }

          // 2. Normalise fields
          const normalisedCompany: ExtractedCompany = {
            ...company,
            industry: normaliseIndustry(company.industry),
            country: normaliseCountry(company.country),
            funding_stage: normaliseFundingStage(company.funding_stage) as FundingStage,
            articleId: batch.find((a) => a.link === company.source_url)?.id,
            articleDate: batch.find((a) => a.link === company.source_url)?.pubDate,
            website: company.website ?? null,
          };

          allCompanies.push(normalisedCompany);
        }
      } catch (error) {
        logError("Gemini extraction failed for batch; skipping batch.", { error: String(error) });
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
        logInfo("Gemini quota exceeded during scoring; stopping further batches.");
        break;
      }

      const model = this.getModel();

      // Sanitise company names before injection
      const companiesJson = JSON.stringify(batch.map(c => ({
        ...c,
        company_name: sanitiseForPrompt(c.company_name, 150),
      })));

      const prompt = [
        "You are the best sales prospector in the world, working for Anchor — a fintech infrastructure company based in Nigeria. Your job is to identify every company in this list that could plausibly become an Anchor customer, anywhere in the world.",
        "",
        "ANCHOR'S PRODUCTS AND WHO NEEDS THEM:",
        "",
        "Payments (Naira payins/payouts via API):",
        "  → African fintechs: payment apps, lending, savings, wallets, gig platforms, merchants",
        "  → Global companies disbursing TO Africa: payroll platforms, gig marketplaces, remittance companies paying out in Nigeria/Kenya/Ghana",
        "",
        "BaaS / Deposit Accounts:",
        "  → Fintechs building neobanks, wallets, or financial super-apps on top of banking infrastructure",
        "",
        "Virtual USD Cards (works globally, especially valuable in USD-scarce markets):",
        "  → Companies in Nigeria, Ghana, Ethiopia, Zimbabwe, Egypt, Sudan, or any country with restricted USD access, wanting to give users or employees virtual dollar cards",
        "  → African companies that pay international vendors or subscriptions",
        "  → Global SaaS or e-commerce platforms issuing cards to African customers",
        "",
        "Global Services (cross-border / FX):",
        "  → Remittance companies sending money to Africa from diaspora markets (US, UK, EU, Canada)",
        "  → Import/export businesses needing African currency settlement",
        "  → International companies with African revenue needing FX conversion",
        "",
        "Digizone:",
        "  → Digital goods, airtime/data, and utility bill platforms in Africa",
        "",
        "Additional ICP signals from Anchor's latest analysis:",
        `<ICP_JSON>${JSON.stringify(icp)}</ICP_JSON>`,
        "",
        "SCORING RULES — think in four distinct segments:",
        "",
        "Segment 1 — African fintechs (local):",
        "  HIGH: Operating in Nigeria, Kenya, Ghana, Senegal, Cameroon, Ivory Coast, Egypt, South Africa, Uganda, Angola, Morocco, DRC, or any XAF/XOF zone country; building a financial product; seed/Series A funding or fresh product launch",
        "  MEDIUM: Right product type but no funding trigger, or geography outside the listed core markets but still within Africa (Rwanda, Tanzania, Ethiopia, rest of Africa)",
        "",
        "Segment 2 — Global remittance / diaspora corridors:",
        "  HIGH: Company explicitly sending money TO Africa, or building Africa-facing remittance corridor, with recent funding or launch",
        "  MEDIUM: Cross-border payments company with African exposure but Africa not the primary focus",
        "",
        "Segment 3 — USD card issuance in USD-scarce markets:",
        "  HIGH: Company in or serving Nigeria, Ghana, Ethiopia, Zimbabwe, Egypt, Sudan (or similar) where USD access is restricted, wanting to issue dollar cards; OR any African company needing to pay international vendors",
        "  MEDIUM: Global card issuer expanding to Africa; African company where card need is likely but not stated",
        "",
        "Segment 4 — Global businesses entering African currencies:",
        "  HIGH: Non-African company explicitly announcing African market entry, African operations, or needing to collect/disburse in Naira/KES/GHS/XAF/XOF or any listed African market currency",
        "  MEDIUM: Global company in an adjacent sector (gig economy, e-commerce, SaaS) with Africa in their roadmap or customer base",
        "",
        "ALWAYS EXCLUDE:",
        "- Traditional banks, central banks, MFBs, telcos, and large enterprises with established infrastructure",
        "- Companies with absolutely no Africa connection and no USD-scarce market relevance",
        "- Companies where the case for needing Anchor requires more than one logical step",
        "",
        "For each company you include, return:",
        "- company_name: as provided",
        "- confidence: HIGH or MEDIUM only",
        `- primary_product: must be exactly one of [${VALID_PRIMARY_PRODUCTS.join(", ")}]`,
        "- match_reason: one sharp sentence (max 20 words) — name the specific Anchor product and why this company needs it",
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = JSON.parse(text) as any[];

        for (const company of parsed) {
          // Confidence must be exactly HIGH or MEDIUM
          if (company.confidence !== "HIGH" && company.confidence !== "MEDIUM") {
            logWarn("Rejected company: invalid confidence", { name: company.company_name, confidence: company.confidence });
            continue;
          }

          // Product must be in canonical list
          const normalisedProduct = normaliseProduct(company.primary_product);
          if (!normalisedProduct) {
            logWarn("Rejected company: invalid product", { name: company.company_name, product: company.primary_product });
            continue;
          }

          // match_reason must be non-empty
          if (!company.match_reason || company.match_reason.trim() === "") {
            logWarn("Rejected company: empty match_reason", { name: company.company_name });
            continue;
          }

          const original = companies.find(c => c.company_name === company.company_name);

          // source_url must be present (from original)
          if (!original?.source_url) {
            logWarn("Rejected company: no source_url", { name: company.company_name });
            continue;
          }

          allScored.push({
            ...company,
            primary_product: normalisedProduct as PrimaryProduct,
            source_url: original.source_url,
            articleId: original.articleId,
            articleDate: original.articleDate,
            country: original.country ?? null,
            industry: original.industry ?? null,
            website: original.website ?? null,
          });
        }
      } catch (error) {
        logError("Gemini scoring failed for batch; skipping batch.", { error: String(error) });
      }
    }

    return { scored: allScored, state: workingState };
  }
}
