# Building an Agent-to-Agent Signal Marketplace with x402 Micropayments

**How I built a fully autonomous trading system where AI agents pay each other for signals and execute trades — powered by OnChainOS, HTTP 402, and TypeScript.**

---

## The Problem

We talk a lot about "agentic AI" — agents that browse the web, write code, and book flights. But one crucial piece is missing: **how do agents pay each other?**

Traditional payment systems require humans in the loop. API keys tied to credit cards. Manual billing cycles. Invoicing. None of this works when you want Agent A to autonomously pay Agent B for a service — especially when that service costs pennies per request.

Enter **x402**: the protocol that turns HTTP 402 (Payment Required) from a status code that broke the web into the first native agent-to-agent payment mechanism.

## The Project

I built **Agent Signal Marketplace** — a reference implementation of agent-to-agent commerce:

- **Publisher Agent**: Monitors OnChainOS for crypto trading signals (smart-money accumulation on Solana)
- **Consumer Agent**: Pays the publisher via x402, validates signals against a strategy, and executes DEX swaps
- **Dashboard**: Real-time React UI showing signal feed, trade log, and agent status

The entire system runs autonomously — no human intervention from signal detection to trade execution.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Agent Signal Marketplace                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │                PUBLISHER AGENT                    │   │
│  │  ┌────────────┐  ┌──────────┐  ┌──────────────┐ │   │
│  │  │ Signal     │  │ Signal   │  │ x402 Gate    │ │   │
│  │  │ Poller     ├──► Store    ├──► (402 + HMAC) │ │   │
│  │  │ (30s REST) │  │          │  └──────────────┘ │   │
│  │  └────────────┘  └──────────┘                    │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                                │
│           x402 Payment (HTTP 402 + HMAC)                  │
│                          │                                │
│  ┌──────────────────────────────────────────────────┐   │
│  │                CONSUMER AGENT                    │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │   │
│  │  │ x402 Pay │  │ Strategy │  │ Trader       │  │   │
│  │  │ + Fetch  ├──► Validate ├──► (DEX Swap)   │  │   │
│  │  └──────────┘  └──────────┘  └──────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                                │
│  ┌──────────────────────────────────────────────────┐   │
│  │                DASHBOARD (React)                 │   │
│  │  Signal Feed · Trade Log · Status Panel          │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**REST polling over WebSocket**: The OnChainOS signal API supports both, but REST polling is simpler to debug, easier to restart, and doesn't require persistent connection management. A 30-second interval catches all new signals without missing time-sensitive opportunities.

**HMAC-SHA256 for simulated x402**: Real x402 requires on-chain permit signatures (EIP-3009) or direct USDC transfers. For development, HMAC gives us the same security model without gas costs. The system supports three modes — `simulated`, `permit`, and `real` — making it easy to graduate from dev to production.

**Web dashboard over CLI-only**: While the consumer runs as a CLI agent, the React dashboard provides real-time visibility into what the agents are doing. Useful for debugging, monitoring, and demo purposes.

---

## The x402 Protocol Deep Dive

x402 is the most elegant protocol you haven't heard of. Here's how it works:

### Step 1: The 402 Response

When the consumer requests a signal without payment:

```http
GET /api/v1/signals/latest HTTP/1.1
Accept: application/json
```

The publisher responds:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": "1.0",
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:196",
    "asset": "0x4ae46a...",
    "amount": "10000",
    "payTo": "0x..."
  }],
  "resource": "/api/v1/signals/latest"
}
```

### Step 2: Sign the Authorization

The consumer creates an HMAC-SHA256 signature over the payment terms:

```typescript
// From x402-real.ts
function createSimulatedAuthorization(
  accept: AcceptEntry,
  walletAddress: string,
  secretKey: string,
) {
  const ts = Date.now();
  const message = [
    accept.scheme,
    accept.network,
    accept.asset,
    accept.amount,
    accept.payTo,
    walletAddress,
    String(ts),
  ].join("|");
  const hmac = crypto.createHmac("sha256", secretKey);
  hmac.update(message);
  return {
    signature: hmac.digest("hex"),
    messageHash: crypto.createHash("sha256").update(message).digest("hex"),
    signer: walletAddress,
    timestamp: ts,
    mode: "simulated",
  };
}
```

### Step 3: Retry with Authorization

```http
GET /api/v1/signals/latest HTTP/1.1
x-payment-authorization: {"signature":"abc123...","signer":"0x...","timestamp":1712345678}
```

The publisher verifies the HMAC and serves the signal. No credit cards. No API keys. Pure cryptographic trust.

---

## The Consumer Agent: From Signal to Swap

The consumer runs a continuous loop:

```typescript
// From index.ts
async function tick(): Promise<void> {
  const result = await fetchLatestSignal();

  if (result.paid) paymentsMade++;
  if (!result.signal) return;

  const config = loadStrategy();
  const validation = validateSignal(result.signal, config);

  if (!validation.shouldTrade) {
    console.log(`  Skipped: ${validation.reason}`);
    return;
  }

  const trade = await executeSwap(result.signal, config);
  logTrade(trade);
}
```

### Strategy Validation

Each signal is validated against five rules:

```typescript
// From strategist.ts
export function validateSignal(signal: Signal, config: StrategyConfig) {
  if (signal.action !== "buy")
    return { shouldTrade: false, reason: "action is not buy" };
  if (!config.allowedChains.includes(signal.chainIndex))
    return { shouldTrade: false, reason: "chain not allowed" };
  if (signal.confidence < config.minConfidence)
    return { shouldTrade: false, reason: "confidence too low" };
  if (parseFloat(signal.marketCap) > config.maxMarketCap)
    return { shouldTrade: false, reason: "market cap too high" };
  if (parseFloat(signal.liquidity) < config.minLiquidity)
    return { shouldTrade: false, reason: "liquidity too low" };
  return { shouldTrade: true, reason: null };
}
```

### DEX Swap Execution

When a signal passes validation, the trader fetches a quote and prepares the swap:

```typescript
// From trader.ts (simplified)
const swapParams = {
  chainIndex: signal.chainIndex,
  fromTokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  toTokenAddress: signal.tokenAddress,
  amount: (config.buyAmountUsd * 1_000_000).toString(),
  userWalletAddress: getWalletAddress(),
  slippagePercent: config.slippagePercent.toString(),
};

// Get quote
const quoteRes = await axios.get(`${BASE_URL}/dex/aggregator/quote?${params}`);

// Execute swap
const swapRes = await axios.get(`${BASE_URL}/dex/aggregator/swap?${params}`, {
  swapMode: "exactIn",
});
```

The DEX aggregator returns unsigned transaction data. Broadcasting requires an Agentic Wallet session to sign and submit.

---

## Data Flow: End to End

```
Timestamp   Component   Action
─────────────────────────────────────────────────────────
T+0s        Publisher   Polls signal list from OnChainOS
T+0.3s      Publisher   Filters: ≥2 wallets, <$10M cap, <60% sold
T+0.3s      Publisher   Computes confidence (trigger wallets + market cap + liquidity)
T+0.3s      Publisher   Publishes signal to in-memory store
─────────────────────────────────────────────────────────
T+1s        Consumer    Polls GET /api/v1/signals/latest
T+1.1s      Publisher   Returns HTTP 402 (payment required)
T+1.2s      Consumer    Signs HMAC-SHA256 authorization
T+1.3s      Consumer    Retries with x-payment-authorization header
T+1.4s      Publisher   Verifies HMAC signature + expiry
T+1.4s      Publisher   Returns signal data (200 OK)
─────────────────────────────────────────────────────────
T+1.5s      Consumer    Validates: confidence ≥ 50%, mcap < $5M, chain = 501
T+1.6s      Consumer    Fetches swap quote via OnChainOS DEX API
T+1.7s      Consumer    Gets route: USDC → wSOL → Token (via Raydium/PancakeSwap)
T+1.8s      Consumer    Submits swap, receives unsigned tx data
T+1.8s      Consumer    Logs trade to journal/trades.json
T+1.8s      Consumer    Displays result in terminal
─────────────────────────────────────────────────────────
T+16s       Consumer    Next poll cycle begins
```

---

## Project Structure

```
agent-signal-market/
├── packages/
│   ├── publisher/
│   │   └── src/
│   │       ├── index.ts         # Express server (3001), dashboard proxy
│   │       ├── monitor.ts       # REST signal poller (30s)
│   │       ├── store.ts         # Ring buffer + confidence scoring
│   │       ├── x402-gate.ts     # 402 responses + HMAC verification
│   │       └── __shared-x402.ts # Signature helpers
│   │
│   ├── consumer/
│   │   └── src/
│   │       ├── index.ts         # CLI: poll → pay → trade loop
│   │       ├── subscriber.ts    # x402 payment flow
│   │       ├── strategist.ts    # Validation rules
│   │       ├── trader.ts        # DEX quote + swap
│   │       ├── journal.ts       # JSON trade log
│   │       └── x402-real.ts     # 3 payment modes
│   │
│   └── dashboard/
│       └── src/
│           ├── App.tsx          # React components
│           ├── api.ts           # Polling client
│           └── types.ts         # TypeScript interfaces
├── .env.example
└── package.json
```

---

## Lessons Learned

### 1. API Design Matters

The OnChainOS DEX aggregator uses GET (not POST) for swap execution. This was unexpected — most DEX APIs use POST for state-changing operations. Always check the actual API behavior before coding assumptions.

### 2. Token Decimals Are Not Optional

Different tokens have different decimal places: USDC uses 6, SOL uses 9, ETH uses 18. Getting the `amount` parameter wrong means sending 0.01 SOL instead of $10 worth. The aggregator won't warn you — it will just return a 400 error.

```typescript
// For USDC (6 decimals): $10 = 10 * 10^6 = 10,000,000 units
amount = (buyAmountUsd * 1_000_000).toString();

// For WSOL (9 decimals): 0.714 SOL @ $14/SOL
amount = Math.floor((buyAmountUsd / solPrice) * 1e9).toString();
```

### 3. ESM Import Hoisting Is Tricky

In ESM modules, `import` statements are hoisted above all other code. This means `process.env.*` reads at module scope will execute before `dotenv.config()`. The fix: wrap all env reads in lazy getter functions.

```typescript
// ❌ Breaks in ESM
const API_KEY = process.env.API_KEY || "";

// ✅ Works in ESM
function getApiKey(): string {
  return process.env.API_KEY || "";
}
```

### 4. The 402 Status Code Is Alive

HTTP 402 was reserved in HTTP/1.1 but never standardized. x402 is the first practical use case. The protocol is elegantly simple: respond with 402 + payment terms, retry with cryptographic proof of payment, get the resource. No new HTTP methods, no custom headers required beyond the standard `x-payment-authorization`.

---

## Running It Yourself

```bash
# Clone and install
git clone https://github.com/harishkotra/agent-signal-market
cd agent-signal-market
npm install
cp .env.example .env

# Edit .env with your API keys (from web3.okx.com/build/dev-portal)

# Run everything
npm run dev
```

Behind the scenes, `npm run dev` uses `concurrently` to start three processes:

| Process | Port | Purpose |
|---------|------|---------|
| Publisher | 3001 | Signal monitoring + x402 gate |
| Consumer | 3002 | Payment + trading agent |
| Dashboard | 5173 | React monitoring UI |

---

## What's Next

The architecture is designed for extension. Here are the most impactful additions:

1. **Real on-chain x402 settlement** via USDC transfers on Base/X Layer
2. **Multi-publisher subscription** — compare signal quality, rank by performance
3. **Backtesting engine** — replay historical signals through the strategist
4. **WebSocket real-time updates** — push trades to the dashboard live
5. **Portfolio tracking** — PnL, win rate, token balance aggregation
6. **Telegram/Slack integration** — alerts when trades execute
7. **Limit orders** — buy the dip, take profit at a target price

---

## Conclusion

Agent-to-agent commerce is coming. The x402 protocol shows us a path forward: use HTTP's built-in payment signal (402), pair it with cryptographic signatures, and suddenly agents can pay each other autonomously.

This project is a reference implementation — not a production trading system. But it demonstrates that the plumbing works. Agents can discover each other's services, negotiate payment terms, verify payments, and deliver value — all without human intervention.

The code is open source at [github.com/harishkotra/agent-signal-market](https://github.com/harishkotra/agent-signal-market). Fork it, extend it, build the next generation of agent services.

---

*Built by [Harish Kotra](https://harishkotra.me) · More builds at [dailybuild.xyz](https://dailybuild.xyz)*
