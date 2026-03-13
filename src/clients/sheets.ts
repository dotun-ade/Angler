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

  private async ensureLogSheetExists(): Promise<void> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.sheetId,
    });
    const sheets = spreadsheet.data.sheets ?? [];
    const hasLogSheet = sheets.some(
      (s) => s.properties?.title === "Angler Log",
    );
    if (hasLogSheet) return;

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.sheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: "Angler Log",
              },
            },
          },
        ],
      },
    });

    // Write column headers immediately after creating the sheet
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.sheetId,
      range: "'Angler Log'!A1:I1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          "Run Date",
          "Articles Processed",
          "Companies Extracted",
          "After Deduplication",
          "Written to CRM",
          "Gemini Calls Used",
          "SerpAPI Calls Used",
          "Run Status",
          "Notes / Errors",
        ]],
      },
    });
  }

  async getExistingBusinessNames(): Promise<string[]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: "Leads!C:C",
    });
    const values = res.data.values || [];
    return values.slice(1).map((row) => (row[0] as string) || "").filter(Boolean);
  }

  async getMaxSn(): Promise<number> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: "Leads!A:A",
    });
    const values = res.data.values || [];
    let max = 0;
    for (const row of values.slice(1)) {
      const v = Number(row[0]);
      if (!Number.isNaN(v) && v > max) max = v;
    }
    return max;
  }

  async appendLeads(
    companies: ScoredCompany[],
    runDateIso: string,
    runEnv: "production" | "development",
  ): Promise<number> {
    if (companies.length === 0) return 0;

    const today = runDateIso;
    const baseSn = await this.getMaxSn();

    const rows = companies.map((company, index) => {
      const sn = baseSn + index + 1;
      const notes = `[Angler ${today}] ${company.match_reason}. Source: ${company.source_url}`;
      return [
        sn, // A S/N
        "", // B DRI
        company.company_name, // C Business Name (Product Name)
        "", // D Tier
        today, // E Entry Date
        "", // F Date of First Engagement
        "", // G Last Contact Date
        "Lead", // H Status
        company.primary_product, // I Primary Product of Interest
        "", // J Secondary Products of Interest
        "", // K Industry
        "Angler", // L Source
        "", // M Country (Registered Address)
        "", // N Est. Annual TTV ($)
        "", // O Global Services Waitlist
        "", // P Upsell
        "", // Q Use Case
        "", // R Contact Person(s) & Designation
        "", // S Contact Email
        "", // T Contact Phone Number
        notes, // U Notes/Remarks
        "", // V Other Requested Prod. Of Interest
        "", // W Lead Score
      ];
    });

    if (runEnv === "development") {
      console.log("DEV MODE: Would append the following rows to Leads:");
      console.dir(rows, { depth: null });
      return companies.length;
    }

    let attempt = 0;
    const maxAttempts = 3;
    const backoffMs = [1000, 2000, 4000];

    while (true) {
      try {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.sheetId,
          range: "Leads!A:W",
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: {
            values: rows,
          },
        });
        return companies.length;
      } catch (error) {
        attempt += 1;
        if (attempt >= maxAttempts) {
          console.error("Sheets write failure after retries:", error);
          throw error;
        }
        const delay = backoffMs[attempt - 1] ?? 4000;
        console.warn(
          `Sheets write failed (attempt ${attempt}), retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
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

