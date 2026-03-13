export type RunEnv = "production" | "development";

export interface AnglerConfig {
  geminiModel: string;
  geminiApiKey: string;
  googleSheetId: string;
  googleServiceAccountJson: string;
  serpApiKey: string;
  snapperDocId: string;
  runEnv: RunEnv;
}

export function loadConfig(): AnglerConfig {
  const {
    GEMINI_MODEL,
    GEMINI_API_KEY,
    GOOGLE_SHEET_ID,
    GOOGLE_SERVICE_ACCOUNT_JSON,
    SERPAPI_KEY,
    SNAPPER_DOC_ID,
    RUN_ENV,
  } = process.env;

  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required");
  if (!GOOGLE_SHEET_ID) throw new Error("GOOGLE_SHEET_ID is required");
  if (!GOOGLE_SERVICE_ACCOUNT_JSON)
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is required");
  if (!SERPAPI_KEY) throw new Error("SERPAPI_KEY is required");
  if (!SNAPPER_DOC_ID) throw new Error("SNAPPER_DOC_ID is required");

  const runEnv: RunEnv =
    RUN_ENV === "production" || RUN_ENV === "development"
      ? RUN_ENV
      : "development";

  return {
    geminiModel: GEMINI_MODEL || "gemini-2.5-flash",
    geminiApiKey: GEMINI_API_KEY,
    googleSheetId: GOOGLE_SHEET_ID,
    googleServiceAccountJson: GOOGLE_SERVICE_ACCOUNT_JSON,
    serpApiKey: SERPAPI_KEY,
    snapperDocId: SNAPPER_DOC_ID,
    runEnv,
  };
}

