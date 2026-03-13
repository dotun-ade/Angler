## Angler

Angler is a researcher who reads the tech news every morning looking for companies that might need Anchor's infrastructure. It works through a set of feeds and searches, identifies companies that match the profile of Anchor's best customers, and adds qualifying prospects to the CRM as leads. It does not contact anyone — it just makes sure the sales team has a clean, daily list of warm targets to consider.

Barnacle fills in the remaining profile fields for each lead Angler creates.

### Deployment notes

- Angler persists its run state and API quotas in a JSON file. Configure a persistent volume in Railway and mount it, then set:
  - `ANGLER_STATE_PATH=/app/state/angler_state.json` (or similar) so state survives restarts.

