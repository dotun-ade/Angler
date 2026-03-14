## Angler

Angler is a researcher who reads the tech news every morning looking for companies that might need Anchor's infrastructure. It works through a set of feeds and searches, identifies companies that match the profile of Anchor's best customers, and adds qualifying prospects to the CRM as leads. It does not contact anyone — it just makes sure the sales team has a clean, daily list of warm targets to consider.

Barnacle fills in the remaining profile fields for each lead Angler creates.

### Customer segments

Angler scores against four Anchor customer segments:

1. **African fintechs** — startups building payments, lending, wallets, or neobanks in African markets that need banking or card-issuing infrastructure.
2. **Global remittance & diaspora** — companies facilitating money transfers into Africa or serving diaspora corridors (e.g. UK→Nigeria, US→Kenya).
3. **USD card issuance in USD-scarce markets** — businesses issuing virtual USD cards in markets where dollar access is restricted (Nigeria, Ghana, Ethiopia, Zimbabwe, Egypt, Sudan).
4. **Global businesses entering African currencies** — international companies expanding into Africa that need local currency accounts, payouts, or payments infrastructure.

### Sources

**Editorial RSS feeds** (processed daily):
TechCabal, Disrupt Africa, Nairametrics, Techpoint Africa, WeeTracker, BusinessDay Nigeria, IT News Africa, The Fintech Times, Future Nexus, PYMNTS, Finextra.

**Google News RSS feeds** (14 keyword queries across all four segments): African fintech funding, payments, Series A/seed rounds, BaaS/card issuing, neobanks, gig/logistics, virtual cards, BNPL, remittance corridors, diaspora fintech, cross-border payments, virtual USD cards, and global Africa expansion.

**SerpAPI** (8 queries/day): targeted searches covering funding signals, remittance/diaspora corridors, USD card issuance in USD-scarce markets, global Africa market entry, and infrastructure/product launches.

### Pipeline

```
Fetch articles → (budget cap + priority sort) → ICP parse → Extract companies
→ Pre-dedup → Seen-companies filter → Score → CRM dedup → Write leads → Log run
```

Priority order when the Gemini budget is tight: carry-over queue → SerpAPI → editorial RSS → Google News. Google News is highest volume and gets dropped first.

### Budgets and quotas

| Resource | Daily cap | Notes |
|---|---|---|
| Gemini API | 20 calls | 1 ICP parse + up to 18 extraction batches (30 articles each) + 1 scoring call. 2 calls always reserved for scoring. |
| SerpAPI | 8 calls | Shared with Barnacle. All 8 queries run every day. |

### Article queue

When the Gemini extraction budget is exhausted before all articles are processed, the overflow is saved to `article_queue` in the state file on the Railway volume. The next run prepends queued articles (highest priority) before fetching fresh ones, so no articles are ever silently dropped. Queue entries older than 5 days are pruned as stale.

### Lead caps

- **HIGH confidence**: all written, no cap.
- **MEDIUM confidence**: written up to a combined daily total of 20 leads.

### Deployment notes

- Angler runs daily at 05:00 UTC via Railway cron (`0 5 * * *`).
- State (API quotas, processed GUIDs, seen companies, article queue) persists in a JSON file. Configure a persistent volume in Railway and set:
  - `ANGLER_STATE_PATH=/app/state/angler_state.json`
- Required environment variables: `GEMINI_API_KEY`, `SERP_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `CRM_SPREADSHEET_ID`, `ICP_DOC_ID`.
