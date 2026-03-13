import { runAngler } from "./pipeline/runAngler";

async function main() {
  try {
    await runAngler();
  } catch (error) {
    console.error("Angler run failed:", error);
    process.exitCode = 1;
  }
}

void main();

