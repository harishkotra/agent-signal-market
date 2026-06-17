import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { SignalMonitor } from "./monitor.js";
import { SignalStore } from "./store.js";
import { createX402Router } from "./x402-gate.js";
import { createPaymentAuthorization } from "./__shared-x402.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

const PORT = parseInt(process.env.PUBLISHER_PORT || "3001");
const CHAIN = process.env.SIGNAL_CHAIN || "501";
const PAY_TO = process.env.PUBLISHER_WALLET_ADDRESS || "";
const VERIFICATION_SECRET = process.env.PUBLISHER_OKX_SECRET_KEY || "";

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

const monitor = new SignalMonitor(CHAIN, (raw) => {
  const signal = store.add(raw);
  console.log(
    `  Published: #${signal.id} — ${signal.tokenSymbol || signal.tokenAddress.slice(0, 10)} @ $${parseFloat(signal.price).toFixed(8)}`,
  );
});

monitor.addFilter((s) => s.triggerWalletCount >= 2);
monitor.addFilter((s) => {
  if (!s.marketCap) return true;
  return parseFloat(s.marketCap) < 10_000_000;
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

async function main() {
  console.log(`\n  ════════════════════════════════════════`);
  console.log(`    Signal Publisher Agent`);
  console.log(`  ════════════════════════════════════════\n`);
  console.log(`  Chain:    ${CHAIN}`);
  console.log(`  Pay to:   ${PAY_TO}`);
  console.log(`  Port:     ${PORT}\n`);

  await monitor.connect();

  app.listen(PORT, () => {
    console.log(`\n  Server running on http://localhost:${PORT}`);
    console.log(`  GET /api/v1/signals/latest  → x402-protected signal`);
    console.log(`  GET /health                 → server status\n`);
  });
}

main().catch(console.error);
