import { runAngler } from "./pipeline/runAngler";
import { loadState, currentGeminiDay, acquireLock, releaseLock } from "./state/state";

const GEMINI_DAILY_CAP = 20;

function runHealthCheck(): void {
  const state = loadState();
  const today = currentGeminiDay();
  const geminiUsed =
    state.gemini_day === today ? state.gemini_calls_today : 0;

  const health = {
    last_run: state.last_run ?? null,
    last_run_status: state.last_run_status ?? null,
    gemini_calls_remaining: Math.max(0, GEMINI_DAILY_CAP - geminiUsed),
    overflow_queue_depth: state.article_queue.length,
  };

  process.stdout.write(JSON.stringify(health, null, 2) + "\n");
}

async function main() {
  if (process.argv.includes("--health")) {
    runHealthCheck();
    return;
  }

  if (!acquireLock()) {
    process.exitCode = 1;
    return;
  }

  try {
    await runAngler();
  } catch (error) {
    console.error("Angler run failed:", error);
    process.exitCode = 1;
  } finally {
    releaseLock();
  }
}

void main();

