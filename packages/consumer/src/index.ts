import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fetchLatestSignal } from "./subscriber.js";
import { loadStrategy, validateSignal } from "./strategist.js";
import { executeSwap } from "./trader.js";
import { initJournal, logTrade, readTrades, printSummary } from "./journal.js";
import { getX402Mode } from "./x402-real.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

const CONSUMER_PORT = parseInt(process.env.CONSUMER_PORT || "3002");
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "15000");
const MAX_TRADES_PER_RUN = parseInt(process.env.MAX_TRADES_PER_RUN || "3");

let tradesThisRun = 0;
let signalsFetched = 0;
let paymentsMade = 0;
let tickCount = 0;
let lastPollTime: number | null = null;
let lastSignal: object | null = null;
let consumerStatus: "idle" | "polling" | "trading" | "done" = "idle";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/consumer/status", (_req, res) => {
  const config = loadStrategy();
  res.json({
    status: consumerStatus,
    tradesThisRun,
    signalsFetched,
    paymentsMade,
    lastPollTime,
    maxTrades: MAX_TRADES_PER_RUN,
    x402Mode: getX402Mode(),
    config: {
      minConfidence: config.minConfidence,
      maxMarketCap: config.maxMarketCap,
      minLiquidity: config.minLiquidity,
      buyAmountUsd: config.buyAmountUsd,
      slippagePercent: config.slippagePercent,
      allowedChains: config.allowedChains,
    },
  });
});

app.get("/api/consumer/trades", (_req, res) => {
  res.json({ trades: readTrades() });
});

app.get("/api/consumer/last-signal", (_req, res) => {
  res.json({ signal: lastSignal });
});

async function tick(): Promise<void> {
  if (tradesThisRun >= MAX_TRADES_PER_RUN) {
    consumerStatus = "done";
    return;
  }

  consumerStatus = "polling";
  signalsFetched++;
  lastPollTime = Date.now();
  const result = await fetchLatestSignal();

  if (result.error) {
    console.error(`  ── Error: ${result.error}`);
    consumerStatus = "idle";
    return;
  }

  if (result.paid) paymentsMade++;

  if (!result.signal) {
    consumerStatus = "idle";
    return;
  }

  lastSignal = result.signal;
  const signal = result.signal;
  const config = loadStrategy();
  const validation = validateSignal(signal, config);

  console.log(
    `  Signal #${signal.id}: ${signal.tokenSymbol || signal.tokenAddress.slice(0, 10)} | conf=${signal.confidence}% | wallets=${signal.triggerWalletCount}`,
  );

  if (!validation.shouldTrade) {
    console.log(`  Skipped: ${validation.reason}`);
    consumerStatus = "idle";
    return;
  }

  console.log(`  Strategy passed! Buying...`);
  consumerStatus = "trading";
  const trade = await executeSwap(signal, config);

  logTrade(trade);

  if (trade.status === "failed") {
    console.log(`  Trade failed: ${trade.error}`);
  } else {
    tradesThisRun++;
    console.log(`  Trade logged: #${trade.id} (${trade.status})`);
  }
  consumerStatus = "idle";
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
  console.log(`    x402 mode:      ${getX402Mode()}`);
  console.log(
    `    Publisher:      ${process.env.PUBLISHER_URL || "http://localhost:3001"}`,
  );
  console.log(`    Poll interval:  ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`    API server:     http://localhost:${CONSUMER_PORT}`);

  const existing = readTrades();
  if (existing.length > 0) {
    console.log(`  Resume from ${existing.length} existing trades\n`);
  }

  app.listen(CONSUMER_PORT, () => {
    console.log(`  Consumer API running on http://localhost:${CONSUMER_PORT}`);
    console.log(`  GET /api/consumer/status      → consumer status`);
    console.log(`  GET /api/consumer/trades       → trade journal`);
    console.log(`  GET /api/consumer/last-signal  → last signal`);
    console.log(`  Built by Harish Kotra (https://harishkotra.me)\n`);
  });

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
