import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { fetchLatestSignal } from "./subscriber.js";
import { loadStrategy, validateSignal } from "./strategist.js";
import { executeSwap } from "./trader.js";
import { initJournal, logTrade, readTrades, printSummary } from "./journal.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "15000");
const MAX_TRADES_PER_RUN = parseInt(process.env.MAX_TRADES_PER_RUN || "3");

let tradesThisRun = 0;
let signalsFetched = 0;
let paymentsMade = 0;

async function tick(): Promise<void> {
  if (tradesThisRun >= MAX_TRADES_PER_RUN) return;

  signalsFetched++;
  const result = await fetchLatestSignal();

  if (result.error) {
    console.error(`  ── Error: ${result.error}`);
    return;
  }

  if (result.paid) paymentsMade++;

  if (!result.signal) return;

  const signal = result.signal;
  const config = loadStrategy();
  const validation = validateSignal(signal, config);

  console.log(
    `  Signal #${signal.id}: ${signal.tokenSymbol || signal.tokenAddress.slice(0, 10)} | conf=${signal.confidence}% | wallets=${signal.triggerWalletCount}`,
  );

  if (!validation.shouldTrade) {
    console.log(`  Skipped: ${validation.reason}`);
    return;
  }

  console.log(`  Strategy passed! Buying...`);
  const trade = await executeSwap(signal, config);

  logTrade(trade);

  if (trade.status === "failed") {
    console.log(`  Trade failed: ${trade.error}`);
  } else {
    tradesThisRun++;
    console.log(`  Trade logged: #${trade.id} (${trade.status})`);
  }
}

async function main() {
  console.log(`\n  ════════════════════════════════════════`);
  console.log(`    Signal Consumer Agent`);
  console.log(`  ════════════════════════════════════════\n`);

  initJournal();

  const config = loadStrategy();
  console.log(`  Strategy:`);
  console.log(`    Min confidence: ${config.minConfidence}%`);
  console.log(
    `    Max market cap: $${(config.maxMarketCap / 1e6).toFixed(1)}M`,
  );
  console.log(`    Buy amount:     $${config.buyAmountUsd}`);
  console.log(`    Chain:          ${config.allowedChains.join(", ")}`);
  console.log(
    `    Publisher:      ${process.env.PUBLISHER_URL || "http://localhost:3001"}`,
  );
  console.log(`    Poll interval:  ${POLL_INTERVAL_MS / 1000}s\n`);

  const existing = readTrades();
  if (existing.length > 0) {
    console.log(`  Resume from ${existing.length} existing trades\n`);
  }

  let tickCount = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick();
    tickCount++;

    if (tradesThisRun >= MAX_TRADES_PER_RUN) {
      console.log(`\n  Reached max ${MAX_TRADES_PER_RUN} trades this run.`);
      break;
    }

    console.log(`\n  Waiting ${POLL_INTERVAL_MS / 1000}s for next poll...\n`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.log(`\n  ── Session Summary ──`);
  console.log(`  Polls:      ${tickCount}`);
  console.log(`  Signals:    ${signalsFetched}`);
  console.log(`  Payments:   ${paymentsMade}`);
  console.log(`  Trades:     ${tradesThisRun}`);
  printSummary();
  console.log();
}

main().catch(console.error);
