import { google, sheets_v4 } from "googleapis";
import { AnglerConfig } from "../utils/config";
import { ScoredCompany } from "./gemini";

export interface RunLogEntry {
  runDateIso: string;
  articlesProcessed: number;
  companiesExtracted: number;
  afterDeduplication: number;
  writtenToCrm: number;
  geminiCallsUsed: number;
  serpApiCallsUsed: number;
  status: "success" | "partial" | "failed";
  notes: string;
}

const RETRY_BACKOFF_MS = [1000, 2000, 4000];

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= maxAttempts) throw error;
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt - 1] ?? 4000));
    }
  }
}

export class SheetsClient {
  private sheets: sheets_v4.Sheets;
  private sheetId: string;

  constructor(config: AnglerConfig) {
    const credentials = JSON.parse(config.googleServiceAccountJson);
    const jwt = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    this.sheets = google.sheets({ version: "v4", auth: jwt });
    this.sheetId = config.googleSheetId;
  }

  private readonly LOG_HEADERS = [
    "Run Date",
    "Articles Processed",
    "Companies Extracted",
    "After Deduplication",
    "Written to CRM",
    "Gemini Calls Used",
    "SerpAPI Calls Used",
    "Run Status",
    "Notes / Errors",
  ];

  private async ensureLogSheetExists(): Promise<void> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.sheetId,
    });
    const sheets = spreadsheet.data.sheets ?? [];
    const hasLogSheet = sheets.some(
      (s) => s.properties?.title === "Angler Log",
    );

    if (!hasLogSheet) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.sheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: "Angler Log" },
              },
            },
          ],
        },
      });
    }

    // Always ensure headers are present in row 1 — covers both new sheets
    // and existing sheets that were created before this fix was deployed.
    const headerRes = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: "'Angler Log'!A1:I1",
    });
    const existingHeader = headerRes.data.values?.[0];
    if (!existingHeader || existingHeader.length === 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range: "'Angler Log'!A1:I1",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [this.LOG_HEADERS] },
      });
    }
  }

  async getExistingBusinessNames(): Promise<string[]> {
    const res = await withRetry(() =>
      this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: "Leads!C:C",
      }),
    );
    const values = res.data.values || [];
    return values.slice(1).map((row) => (row[0] as string) || "").filter(Boolean);
  }

  async appendLeads(
    companies: ScoredCompany[],
    runDateIso: string,
    runEnv: "production" | "development",
  ): Promise<number> {
    if (companies.length === 0) return 0;

    const today = runDateIso;

    const rows = companies.map((company) => {
      const useCase = `[Angler ${today}] ${company.match_reason}. Source: ${company.source_url}`;
      return [
        "", // A S/N
        "", // B DRI
        company.company_name, // C Business Name (Product Name)
        "", // D Tier
        today, // E Entry Date
        "", // F Date of First Engagement
        "", // G Last Contact Date
        "Lead", // H Status
        company.primary_product, // I Primary Product of Interest
        "", // J Secondary Products of Interest
        company.industry ?? "", // K Industry
        "Angler", // L Source
        company.country ?? "", // M Country (Registered Address)
        "", // N Est. Annual TTV ($)
        "", // O Global Services Waitlist
        "", // P Upsell
        useCase, // Q Use Case
        "", // R Contact Person(s) & Designation
        "", // S Contact Email
        "", // T Contact Phone Number
        company.website ?? "", // U Notes/Remarks
        "", // V Other Requested Prod. Of Interest
        "", // W Lead Score
      ];
    });

    if (runEnv === "development") {
      console.log("DEV MODE: Would append the following rows to Angler:");
      console.dir(rows, { depth: null });
      return companies.length;
    }

    await withRetry(() =>
      this.sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: "Angler!A:W",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: rows },
      }),
    );
    return companies.length;
  }

  async appendRunLog(entry: RunLogEntry): Promise<void> {
    const rows = [
      [
        entry.runDateIso,
        entry.articlesProcessed,
        entry.companiesExtracted,
        entry.afterDeduplication,
        entry.writtenToCrm,
        entry.geminiCallsUsed,
        entry.serpApiCallsUsed,
        entry.status,
        entry.notes,
      ],
    ];

    try {
      await this.ensureLogSheetExists();
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: "'Angler Log'!A:I",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: rows },
      });
    } catch (error) {
      console.error("Failed to append to Angler Log:", error);
    }
  }
}

