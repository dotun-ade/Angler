# Angler — Cursor Build Prompt

## What Angler Is

Angler is a lead prospecting agent. It runs every morning, reads tech news RSS feeds and runs targeted SerpAPI searches, identifies companies that match Anchor's ICP, deduplicates against the existing CRM, and appends qualifying prospects directly to the Leads tab of the Orbit CRM sheet. It is the first agent in the Sales track to find net-new companies — every other agent operates on leads that are already in the system.

Angler writes a minimum viable row: business name, entry date, status, primary product, and source. Barnacle handles enrichment of the remaining fields (industry, country, use case, contact person, TTV) after Angler creates the row.

---

## Stack

- **Runtime**: Node.js
- **Deployment**: Railway
- **LLM**: Gemini 2.5 Flash via `@google/generative-ai` SDK. Model set via `GEMINI_MODEL` env var.
- **Google Sheets**: `googleapis` npm package, service account auth
- **RSS parsing**: `rss-parser` npm package
- **HTTP**: `axios` for SerpAPI calls and article fetch
- **Scheduling**: Railway cron job, runs once daily at 06:00 WAT (05:00 UTC, `0 5 * * *`)

---

## Gemini Rate Limits — Critical Constraint

| Limit | Value |
|-------|-------|
| Requests per minute | 5 |
| Tokens per minute | 250,000 |
| Requests per day | **20** |

Angler is designed to use 4–6 Gemini calls per day:
- 1 call: parse Snapper ICP doc into structured criteria
- 1–2 calls: extract and normalise company mentions from article text
- 2–3 calls: score companies against ICP (15 companies per call)

Every Gemini call must be logged: `Gemini calls today: X/20 — Y remaining`.

---

## SerpAPI Budget — Critical Constraint

The SerpAPI account is shared with Barnacle. Total monthly budget: **250 searches**.

**Angler's allocation: maximum 3 searches per day (≈90/month).** Do not exceed this. Track daily SerpAPI usage in the state file and refuse to make further searches once the daily cap is hit. Log clearly when the cap is reached.

---

## Data Sources

### 1. RSS Feeds (primary — no search budget consumed)

Fetch all feeds on every run. Parse each feed for articles published since the last run (tracked by item GUID or `pubDate` in state). Process only new items.

| Feed | URL |
|------|-----|
| TechCabal | `https://techcabal.com/feed/` |
| Disrupt Africa | `https://disrupt-africa.com/feed/` |
| Nairametrics Fintech | `https://nairametrics.com/category/fintech/feed/` |
| The Fintech Times | `https://thefintechtimes.com/feed/` |
| Fintech Nexus | `https://fintechnexus.com/feed/` |

On first run (no state), process items from the last 48 hours only. On subsequent runs, process items newer than the last run timestamp.

For each article: extract title, description/summary, and link. Do **not** fetch the full article body — title + description is sufficient for company extraction.

### 2. SerpAPI (secondary — budget-limited)

Run up to 3 targeted searches per day. Use the Google Search engine (`engine: "google"`). Suggested queries — rotate through these, not all three on the same day:

- `"fintech startup" Africa "Series A" OR "seed funding" 2026`
- `"payments" OR "card issuing" OR "banking API" Africa startup launched 2026`
- `"BaaS" OR "banking as a service" Africa OR Nigeria OR Kenya 2026`

For each search, extract `title`, `snippet`, and `link` from organic results only (skip ads). Treat each result as one article item feeding into the same extraction pipeline as RSS.

---

## ICP Criteria — Snapper Doc

At the start of each run, read the Snapper ICP analysis Google Doc (`SNAPPER_DOC_ID` env var) and make one Gemini call to extract structured ICP criteria. This call is always the first Gemini call of the day.

Prompt:
```
You are reading an ICP (Ideal Customer Profile) analysis document for Anchor, a Nigerian fintech infrastructure company offering banking, payments, and card-issuing APIs.

Extract the following as structured JSON:
- target_geographies: array of country or region names that appear as strong ICP signals
- target_industries: array of industry labels (e.g. "Fintech", "Retail & E-Commerce")
- product_signals: array of keywords or phrases that indicate a company needs Anchor's products (e.g. "virtual cards", "payment collection", "wallet", "disbursement")
- negative_signals: array of keywords or company types that are explicitly poor fit
- stage_signals: array of phrases indicating company stage that converts well (e.g. "Series A", "early stage", "recently launched")

Document:
<DOC_TEXT>

Return only valid JSON, no explanation.
```

Cache this result in memory for the run. Do not make this call again mid-run. If the doc is unavailable or the call fails, proceed with a hardcoded fallback:

```json
{
  "target_geographies": ["Nigeria", "Kenya", "Ghana", "South Africa", "Egypt", "Rwanda"],
  "target_industries": ["Fintech", "SaaS & Tech", "Retail & E-Commerce", "Web3"],
  "product_signals": ["payments", "virtual card", "wallet", "disbursement", "card issuing", "banking API", "payout", "collection", "BaaS", "banking infrastructure"],
  "negative_signals": ["bank", "microfinance bank", "traditional bank", "insurance company"],
  "stage_signals": ["launched", "Series A", "seed", "raised", "new product", "expanding"]
}
```

---

## Company Extraction (Gemini)

Group all article items (from RSS + SerpAPI combined) into batches of 15. For each batch, make one Gemini call to extract company mentions.

Prompt:
```
You are extracting company mentions from tech news articles to identify prospective customers for Anchor — a Nigerian fintech infrastructure company offering banking, payments, and card-issuing APIs to businesses.

For each article below, identify any companies mentioned that:
- Are building a product or service (not just investors, journalists, or regulators)
- Appear to be a business that could need payments, cards, or banking infrastructure

For each company found, return:
- company_name: canonical business name (not a product name unless the company is named after its product)
- country: country of operation or HQ if mentioned, else null
- description: one sentence from the article describing what the company does, max 25 words
- source_url: the article link
- signals: array of 1–3 keywords from the article that suggest a payments/banking infrastructure need

Ignore companies that are: traditional banks, regulators, telecoms, journalists, pure software tools with no financial product.

Articles:
<ARTICLES_JSON>

Return a JSON array. One object per company found. Multiple companies per article is fine. If an article mentions no qualifying company, skip it entirely.
```

The `<ARTICLES_JSON>` block is:
```json
[
  { "id": 1, "title": "...", "description": "...", "link": "https://..." },
  ...
]
```

---

## ICP Scoring (Gemini)

After extraction, batch all found companies (15 per call) and score each against the ICP criteria extracted from Snapper.

Prompt:
```
You are scoring prospective companies for Anchor — a Nigerian fintech infrastructure company offering:
- Virtual USD Cards (card issuing for businesses)
- BaaS / Deposit Accounts (banking infrastructure for fintechs)
- Payments (payins and payouts, Naira)
- Virtual Accounts and Sub-Accounts
- Business Banking

ICP criteria:
<ICP_JSON>

For each company below, return:
- company_name: as provided
- confidence: HIGH, MEDIUM, or LOW
- primary_product: the single most likely Anchor product this company would need. Must be exactly one of: ["Cards", "BaaS", "Payments", "Business Banking", "Virtual Accounts", "Global Services", "Digizone"]. Choose "Payments" if unclear between Payments/BaaS.
- match_reason: one sentence, max 20 words, explaining why this company is a fit

Companies:
<COMPANIES_JSON>

Return only HIGH and MEDIUM confidence results. Do not return LOW confidence companies at all. Return valid JSON array only.
```

---

## Filtering and Ranking

After scoring:

1. **Keep only HIGH and MEDIUM** — LOW confidence is discarded (Gemini should not return these but guard anyway)
2. **Deduplicate against existing CRM** — load the `Business Name (Product Name)` column (C) from the Leads sheet. For each scored company, compute Levenshtein similarity against all existing names. If similarity > 80% with any existing row, discard as duplicate. Use a simple Levenshtein implementation (no external library needed — include inline).
3. **Deduplicate against today's batch** — if two sources found the same company, keep the one with the higher confidence, or the first if equal.
4. **Rank** — HIGH confidence first, then MEDIUM. Within each tier, order by article recency.
5. **Take top 10** — if fewer than 10 pass filtering, write all of them. Never pad with LOW confidence.

---

## CRM Write

Append one row per qualifying company to the `Leads` tab. Column mapping:

| Column | Field | Value |
|--------|-------|-------|
| A | S/N | MAX of existing S/N column + auto-increment (1 per new row) |
| B | DRI | Leave blank |
| C | Business Name (Product Name) | Company name from extraction |
| D | Tier | Leave blank |
| E | Entry Date | Today's date, ISO format `YYYY-MM-DD` |
| F | Date of First Engagement | Leave blank |
| G | Last Contact Date | Leave blank |
| H | Status | `Lead` |
| I | Primary Product of Interest | As returned by ICP scoring — must be one of the valid values |
| J | Secondary Products of Interest | Leave blank |
| K | Industry | Leave blank (Barnacle) |
| L | Source | `Angler` |
| M | Country (Registered Address) | Leave blank (Barnacle) |
| N | Est. Annual TTV ($) | Leave blank (Barnacle) |
| O | Global Services Waitlist | Leave blank |
| P | Upsell | Leave blank |
| Q | Use Case | Leave blank (Barnacle) |
| R | Contact Person(s) & Designation | Leave blank (Barnacle) |
| S | Contact Email | Leave blank |
| T | Contact Phone Number | Leave blank |
| U | Notes/Remarks | Source article URL + match reason from ICP scoring. Format: `[Angler YYYY-MM-DD] {match_reason}. Source: {source_url}` |
| V | Other Requested Prod. Of Interest | Leave blank |
| W | Lead Score | Leave blank |

Use `spreadsheets.values.append` with `valueInputOption: 'USER_ENTERED'` and `insertDataOption: 'INSERT_ROWS'`.

**S/N calculation**: before writing, read the current max value in column A. Assign S/N = max + 1 for the first new row, max + 2 for the second, and so on. Do not rely on row count — there are gaps in the existing S/N sequence.

---

## State Management

Persist state to `./state/angler_state.json`. Create the file if it does not exist.

```json
{
  "last_run": "2026-03-14T05:00:00Z",
  "processed_guids": ["guid1", "guid2"],
  "serpapi_calls_today": {
    "date": "2026-03-14",
    "count": 2
  },
  "gemini_day": "2026-03-14",
  "gemini_calls_today": 5
}
```

- `last_run`: ISO timestamp of the last successful run. Used to filter RSS items by pubDate.
- `processed_guids`: array of article GUIDs (or URLs if no GUID) already processed. Cap at 2,000 entries — trim oldest when limit is reached.
- `serpapi_calls_today`: resets when `date` changes. Blocks further SerpAPI calls when `count >= 3`.
- `gemini_day` / `gemini_calls_today`: track Gemini quota. A "day" runs 07:00–07:00 UTC (same convention as other agents). Reset when `gemini_day` changes.

Update state at the end of each successful run. If the run fails mid-way, do not update `last_run` — this causes the next run to re-process recent articles, which is safer than missing them.

---

## Run Log

Append one row per run to an `Angler Log` tab in the same Google Sheet as the CRM (create tab if it does not exist).

| Column | Field |
|--------|-------|
| A | Run Date (ISO) |
| B | Articles Processed |
| C | Companies Extracted |
| D | After Deduplication |
| E | Written to CRM |
| F | Gemini Calls Used |
| G | SerpAPI Calls Used |
| H | Run Status (`success` / `partial` / `failed`) |
| I | Notes / Errors |

---

## Error Handling

- **RSS feed unavailable**: skip that feed, continue with others. Log which feeds failed.
- **SerpAPI error**: log and skip that query. Do not retry — it counts against quota even on failure.
- **Gemini failure on ICP parse**: use the hardcoded fallback criteria. Log that fallback was used.
- **Gemini failure on extraction or scoring**: log the error. Skip affected batch — do not write partial results.
- **Sheets write failure**: retry up to 3 times with exponential backoff (1s, 2s, 4s). If all retries fail, log full details to console and mark run as `partial`.
- Never crash silently. All errors must reach console.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_MODEL` | Gemini model string (default: `gemini-2.5-flash`) |
| `GEMINI_API_KEY` | Google AI API key |
| `GOOGLE_SHEET_ID` | ID of the Orbit CRM Google Sheet (same sheet as Sobek/Barnacle) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account credentials (stringified JSON) |
| `SERPAPI_KEY` | SerpAPI key — shared with Barnacle. Treat as scarce. |
| `SNAPPER_DOC_ID` | Google Doc ID of the Snapper ICP analysis document |
| `RUN_ENV` | `production` or `development`. In development: use max 2 Gemini calls, do not write to CRM (log intended writes to console instead), process max 10 articles. |

---

## README Requirements

Describe Angler as a human worker. Example framing:

> Angler is a researcher who reads the tech news every morning looking for companies that might need Anchor's infrastructure. It works through a set of feeds and searches, identifies companies that match the profile of Anchor's best customers, and adds qualifying prospects to the CRM as leads. It does not contact anyone — it just makes sure the sales team has a clean, daily list of warm targets to consider.

Do not reference VSM, System 4, or architectural classification. Do not mention other agents by role — mention them by name only where the relationship is relevant (e.g., "Barnacle fills in the remaining profile fields for each lead Angler creates").

---

## Out of Scope for This Build

- Fetching full article bodies — title + description only
- LinkedIn scraping — ToS
- Email address discovery — Barnacle handles contact enrichment
- Auto-promoting leads to any status beyond `Lead`
- Slack notifications — not needed; prospects appear in the CRM
- Deduplication against tabs other than `Leads` (Outbound Qual. Leads, Cards Inbounds, etc.) — Leads tab only for now

---

## Definition of Done

- [ ] Angler runs end-to-end in `development` mode without errors, logging intended CRM writes to console
- [ ] RSS feeds are fetched and only new articles (since last run) are processed
- [ ] SerpAPI daily cap (3) is enforced and logged
- [ ] Gemini ICP parse produces valid structured criteria (or falls back gracefully)
- [ ] Company extraction and ICP scoring pipeline returns HIGH/MEDIUM companies only
- [ ] Deduplication correctly skips companies already in the Leads sheet (test with an existing name)
- [ ] CRM writes contain all required fields; S/N is correct; no existing rows are modified
- [ ] `Angler Log` tab is created and populated after each run
- [ ] State file is written correctly and `processed_guids` prevents re-processing on next run
- [ ] README written in human-worker voice
