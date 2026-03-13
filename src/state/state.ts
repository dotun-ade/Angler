import fs from "fs";
import path from "path";

export interface SerpApiUsage {
  date: string;
  count: number;
}

export interface AnglerState {
  last_run?: string;
  processed_guids: string[];
  serpapi_calls_today: SerpApiUsage;
  gemini_day?: string;
  gemini_calls_today: number;
}

const STATE_PATH = path.resolve(
  process.env.ANGLER_STATE_PATH || "./state/angler_state.json",
);
const SERPAPI_DAILY_CAP = 8;
const GEMINI_DAILY_CAP = 20;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Gemini day runs from 07:00 UTC to 07:00 UTC.
// We represent a "Gemini day" by the UTC date of its 07:00 start.
function currentGeminiDay(): string {
  const now = new Date();
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDate = now.getUTCDate();
  const utcHour = now.getUTCHours();

  // Start from today's UTC midnight
  const startOfToday = new Date(Date.UTC(utcYear, utcMonth, utcDate));

  // If before 07:00 UTC, the Gemini day started at 07:00 UTC yesterday
  if (utcHour < 7) {
    startOfToday.setUTCDate(startOfToday.getUTCDate() - 1);
  }

  return startOfToday.toISOString().slice(0, 10);
}

export function loadState(): AnglerState {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as AnglerState;

    const serpDate = parsed.serpapi_calls_today?.date || todayIsoDate();
    const serpCount =
      serpDate === todayIsoDate() ? parsed.serpapi_calls_today.count : 0;

    const currentDay = currentGeminiDay();
    const storedGeminiDay = parsed.gemini_day || currentDay;
    const geminiCalls =
      storedGeminiDay === currentDay ? parsed.gemini_calls_today : 0;

    return {
      last_run: parsed.last_run,
      processed_guids: parsed.processed_guids || [],
      serpapi_calls_today: { date: serpDate, count: serpCount },
      gemini_day: storedGeminiDay,
      gemini_calls_today: geminiCalls,
    };
  } catch {
    return {
      processed_guids: [],
      serpapi_calls_today: { date: todayIsoDate(), count: 0 },
      gemini_day: currentGeminiDay(),
      gemini_calls_today: 0,
    };
  }
}

export function saveState(state: AnglerState): void {
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const trimmedGuids =
    state.processed_guids.length > 2000
      ? state.processed_guids.slice(-2000)
      : state.processed_guids;

  const payload: AnglerState = {
    ...state,
    processed_guids: trimmedGuids,
  };

  fs.writeFileSync(STATE_PATH, JSON.stringify(payload, null, 2), "utf8");
}

export function canUseSerpApi(state: AnglerState): boolean {
  const date = todayIsoDate();
  const usage =
    state.serpapi_calls_today.date === date
      ? state.serpapi_calls_today.count
      : 0;
  return usage < SERPAPI_DAILY_CAP;
}

export function registerSerpApiCall(state: AnglerState): AnglerState {
  const date = todayIsoDate();
  const current =
    state.serpapi_calls_today.date === date
      ? state.serpapi_calls_today.count
      : 0;
  const updated: AnglerState = {
    ...state,
    serpapi_calls_today: { date, count: current + 1 },
  };
  console.log(
    `SerpAPI calls today: ${updated.serpapi_calls_today.count}/${SERPAPI_DAILY_CAP}`,
  );
  if (updated.serpapi_calls_today.count >= SERPAPI_DAILY_CAP) {
    console.log("SerpAPI daily cap reached; skipping further searches.");
  }
  return updated;
}

export function canUseGemini(state: AnglerState, runEnv: "production" | "development"): boolean {
  const limit = runEnv === "development" ? 2 : GEMINI_DAILY_CAP;
  const currentDay = currentGeminiDay();
  const storedDay = state.gemini_day || currentDay;
  const calls = storedDay === currentDay ? state.gemini_calls_today : 0;
  return calls < limit;
}

export function registerGeminiCall(
  state: AnglerState,
  runEnv: "production" | "development",
): AnglerState {
  const day = currentGeminiDay();
  const limit = runEnv === "development" ? 2 : GEMINI_DAILY_CAP;
  const current =
    state.gemini_day === day ? state.gemini_calls_today : 0;
  const updated: AnglerState = {
    ...state,
    gemini_day: day,
    gemini_calls_today: current + 1,
  };
  const remaining = Math.max(limit - updated.gemini_calls_today, 0);
  console.log(
    `Gemini calls today: ${updated.gemini_calls_today}/${limit} — ${remaining} remaining`,
  );
  return updated;
}

