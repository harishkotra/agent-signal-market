import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { SignalPoller } from "./monitor.js";
import { SignalStore } from "./store.js";
import { createX402Router } from "./x402-gate.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

const PORT = parseInt(process.env.PUBLISHER_PORT || "3001");
const CHAIN = process.env.SIGNAL_CHAIN || "501";
const PAY_TO = process.env.PUBLISHER_WALLET_ADDRESS || "";
const VERIFICATION_SECRET = process.env.PUBLISHER_OKX_SECRET_KEY || "";
const POLL_INTERVAL = parseInt(
  process.env.PUBLISHER_POLL_INTERVAL_MS || "30000",
);
const DASHBOARD_DIR = resolve(__dirname, "../../dashboard/dist");

if (!PAY_TO) {
  console.error("\n  Missing PUBLISHER_WALLET_ADDRESS in .env\n");
  process.exit(1);
}

if (!VERIFICATION_SECRET) {
  console.error("\n  Missing PUBLISHER_OKX_SECRET_KEY in .env\n");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const store = new SignalStore();
const signalCount = { value: 0 };

const poller = new SignalPoller(CHAIN, (raw) => {
  const signal = store.add(raw);
  console.log(
    `  Published: #${signal.id} — ${signal.tokenSymbol || signal.tokenAddress.slice(0, 10)} @ $${parseFloat(signal.price).toFixed(8)}`,
  );
});

poller.addFilter((s) => s.triggerWalletCount >= 2);
poller.addFilter((s) => {
  if (!s.marketCap) return true;
  return parseFloat(s.marketCap) < 10_000_000;
});
poller.addFilter((s) => {
  if (!s.soldRatioPercent) return true;
  return parseFloat(s.soldRatioPercent) < 60;
});

app.use(
  "/api/v1",
  createX402Router(store, PAY_TO, VERIFICATION_SECRET, signalCount),
);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    signalsPublished: signalCount.value,
    signalsInStore: store.all().length,
    chainIndex: CHAIN,
  });
});

app.use("/api/consumer", async (req, res, next) => {
  try {
    const consumerUrl = `http://localhost:${process.env.CONSUMER_PORT || 3002}${req.originalUrl}`;
    const resp = await fetch(consumerUrl);
    const data = await resp.json();
    res.json(data);
  } catch {
    res.status(503).json({ error: "consumer not available" });
  }
});

app.use(express.static(DASHBOARD_DIR));

app.get("*", (_req, res) => {
  res.sendFile(join(DASHBOARD_DIR, "index.html"));
});

async function main() {
  console.log(`\n  ════════════════════════════════════════`);
  console.log(`    Signal Publisher Agent`);
  console.log(`  ════════════════════════════════════════\n`);
  console.log(`  Chain:    ${CHAIN}`);
  console.log(`  Pay to:   ${PAY_TO}`);
  console.log(`  Port:     ${PORT}\n`);

  poller.start(POLL_INTERVAL);

  app.listen(PORT, () => {
    console.log(`\n  Dashboard:   http://localhost:${PORT}`);
    console.log(`  Signals API: http://localhost:${PORT}/api/v1/signals`);
    console.log(`  Health:      http://localhost:${PORT}/health\n`);
  });
}

main().catch(console.error);
