# Agent Signal Marketplace

An **agent-to-agent signal marketplace** where one agent publishes crypto trading signals and other agents subscribe via **x402 micropayments** — all powered by OnChainOS. This is the first reference implementation of the x402 protocol for autonomous agent commerce.

```
[Smart Money Monitor Agent] → publishes signal → [x402 Payment Gateway] →
→ [Trading Agent A pays $0.01] → validates → executes swap via DEX API
→ [Trading Agent B pays $0.01] → validates → executes swap via DEX API
```

---

## Table of Contents

- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [x402 Payment Flow](#x402-payment-flow)
- [Strategy Configuration](#strategy-configuration)
- [Dashboard](#dashboard)
- [API Reference](#api-reference)
- [Contributing](#contributing)
- [License](#license)

---

## Architecture

```
                        ┌─────────────────────────────┐
                        │     OnChainOS Market API     │
                        │  POST /v6/dex/market/signal  │
                        └─────────────┬───────────────┘
                                      │ polls every 30s
                              ┌───────▼────────┐
                              │   PUBLISHER     │
                              │  (Express 3001) │
                              │                 │
                              │ • SignalPoller  │
                              │ • SignalStore   │
                              │ • x402 Gate     │
                              └───────┬────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
            ┌───────▼──────┐  ┌──────▼───────┐  ┌──────▼───────┐
            │  CONSUMER    │  │  CONSUMER B  │  │  CONSUMER C  │
            │  (CLI + API) │  │  (future)    │  │  (future)    │
            │  :3002       │  │              │  │              │
            │              │  │              │  │              │
            │ • x402 Pay   │  │              │  │              │
            │ • Strategist │  │              │  │              │
            │ • Trader     │  │              │  │              │
            │ • Journal    │  │              │  │              │
            └───────┬──────┘  └──────────────┘  └──────────────┘
                    │
            ┌───────▼──────┐
            │  DASHBOARD   │
            │  (React/Vite)│
            │  :5173       │
            └──────────────┘
```

### Two-Hop Proxy Chain

The dashboard uses a two-hop proxy to avoid CORS issues:

```
Browser (:5173) ──► Publisher (:3001) ──► Consumer (:3002)
```

The publisher proxies `/api/consumer/*` requests to the consumer, and Vite proxies `/api/*` requests to the publisher.

---

## How It Works

### 1. Signal Monitoring (Publisher)

The publisher polls the OnChainOS Market API's `POST /api/v6/dex/market/signal/list` endpoint every 30 seconds. This returns aggregated smart-money/whale trading activity across Solana, identifying tokens being accumulated by top traders.

Signals are filtered by:
- **Minimum 2 trigger wallets** — avoids noise from single-wallet trades
- **Market cap < $10M** — focuses on early-stage tokens
- **Sold ratio < 60%** — filters out tokens where most holders are selling

Each signal is assigned a **confidence score** (0-100%) based on:
- Number of trigger wallets
- Market cap range
- Available liquidity
- Number of unique wallet addresses involved

### 2. x402 Payment (Consumer → Publisher)

When the consumer polls `GET /api/v1/signals/latest`, the publisher returns **HTTP 402 Payment Required** with an x402 payload:

```json
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

The consumer signs the payment authorization (HMAC-SHA256 in simulated mode) and retries with the `x-payment-authorization` header. The publisher verifies the signature and serves the signal.

### 3. Strategy Validation (Consumer)

Each received signal is validated against a configurable strategy:

```typescript
interface StrategyConfig {
  minConfidence: number;   // Minimum signal confidence (default: 70%)
  maxMarketCap: number;    // Maximum market cap cap (default: $5M)
  minLiquidity: number;    // Minimum liquidity (default: $100K)
  buyAmountUsd: number;    // Trade size in USD (default: $10)
  slippagePercent: number; // Slippage tolerance (default: 0.5%)
  allowedChains: string[]; // Allowed chain IDs (default: ["501"])
}
```

### 4. Trade Execution (Consumer)

If the signal passes all validation, the consumer:
1. Fetches a swap quote via `GET /api/v6/dex/aggregator/quote`
2. Submits the swap via `GET /api/v6/dex/aggregator/swap`
3. Returns unsigned transaction data (requires Agentic Wallet to sign + broadcast)
4. Logs the trade to `journal/trades.json`

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Language** | TypeScript 5.5 | Full type safety, ESM modules |
| **API** | OnChainOS Open API | Signal monitoring, DEX aggregation, Market data |
| **Payments** | x402 Protocol | Agent-to-agent micropayments (HTTP 402) |
| **Server** | Express | Publisher API + static dashboard |
| **Client** | Axios, fetch | Authenticated API calls |
| **Dashboard** | React 18 + Vite | Real-time monitoring UI |
| **CLI** | Picocolors | Terminal output formatting |
| **Runtime** | tsx (esbuild) | Direct TypeScript execution |
| **Orchestration** | concurrently | Multi-process dev runner |
| **Crypto** | Node.js crypto | HMAC-SHA256 signature verification |

---

## Project Structure

```
agent-signal-market/
├── packages/
│   ├── publisher/              # Signal publisher agent
│   │   └── src/
│   │       ├── index.ts        # Express server, routes, dashboard proxy
│   │       ├── monitor.ts      # REST-based SignalPoller (30s interval)
│   │       ├── store.ts        # Ring-buffer signal store + confidence scoring
│   │       ├── x402-gate.ts    # HTTP 402 response + HMAC verification
│   │       └── __shared-x402.ts # x402 signature helpers
│   │
│   ├── consumer/               # Signal consumer agent
│   │   └── src/
│   │       ├── index.ts        # CLI entry: poll → pay → trade loop
│   │       ├── subscriber.ts   # x402 payment flow + signal retrieval
│   │       ├── strategist.ts   # Signal validation rules engine
│   │       ├── trader.ts       # DEX quote + swap execution
│   │       ├── journal.ts      # Append-only JSON trade journal
│   │       └── x402-real.ts    # 3 x402 modes (simulated/permit/real)
│   │
│   └── dashboard/              # React dashboard
│       └── src/
│           ├── App.tsx         # SignalFeed, TradeLog, StatusPanel
│           ├── api.ts          # Polling API client
│           └── types.ts        # TypeScript interfaces
│
├── .env.example                # Environment variable template
├── package.json                # Workspace root with concurrently
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- OKX API credentials (from [OnChainOS Dev Portal](https://web3.okx.com/build/dev-portal))

### Installation

```bash
git clone https://github.com/harishkotra/agent-signal-market
cd agent-signal-market
npm install
cp .env.example .env
```

### Configuration

Edit `.env` with your API credentials:

```env
# Publisher credentials
PUBLISHER_OKX_API_KEY=your-api-key
PUBLISHER_OKX_SECRET_KEY=your-secret-key
PUBLISHER_OKX_PASSPHRASE=your-passphrase
PUBLISHER_OKX_PROJECT_ID=your-project-id

# Consumer credentials
CONSUMER_OKX_API_KEY=your-api-key
CONSUMER_OKX_SECRET_KEY=your-secret-key
CONSUMER_OKX_PASSPHRASE=your-passphrase
CONSUMER_OKX_PROJECT_ID=your-project-id

# Publisher wallet (receives x402 payments)
PUBLISHER_WALLET_ADDRESS=0x...

# Consumer wallet (for swap txs)
CONSUMER_WALLET_ADDRESS=<solana-address>

# Strategy
STRATEGY_MIN_CONFIDENCE=50
STRATEGY_MAX_MCAP=5000000
STRATEGY_BUY_AMOUNT_USD=10
STRATEGY_CHAIN=501
```

### Run Everything

```bash
npm run dev
```

This starts three processes concurrently:

| Process | Port | Description |
|---------|------|-------------|
| Publisher | 3001 | Signal monitoring, x402 gate, dashboard static files |
| Consumer | 3002 | x402 payments, strategy validation, trade execution |
| Dashboard | 5173 | React UI with real-time signal feed + trade log |

### Run Individual Components

```bash
npm run publisher   # Signal publisher only (port 3001)
npm run consumer    # Signal consumer only (port 3002)
npm run dashboard   # React dashboard only (port 5173)
```

---

## x402 Payment Flow

The x402 protocol enables agent-to-agent micropayments. Here's the detailed flow:

```
┌─────────┐                    ┌──────────┐
│ Consumer │                    │ Publisher │
└────┬─────┘                    └─────┬────┘
     │                                │
     │  GET /api/v1/signals/latest    │
     ├───────────────────────────────►│
     │                                │
     │  HTTP 402 Payment Required     │
     │  { x402Version, accepts,       │
     │    resource }                  │
     │◄───────────────────────────────┤
     │                                │
     │  Sign HMAC-SHA256:             │
     │  scheme|network|asset|amount|  │
     │  payTo|wallet|timestamp        │
     ├───────  internally  ──────────►│
     │                                │
     │  GET /api/v1/signals/latest    │
     │  x-payment-authorization: {...}│
     ├───────────────────────────────►│
     │                                │
     │  Verify signature + expiry     │
     ├───────  internally  ──────────►│
     │                                │
     │  200 OK { signal: {...} }      │
     │◄───────────────────────────────┤
     │                                │
     │  Validate → Execute swap       │
     │  Log to journal/trades.json    │
     ├───────  internally  ──────────►│
```

### Payment Authorization Modes

| Mode | Description | When to Use |
|------|-------------|-------------|
| `simulated` | HMAC-SHA256 hashed signature (default) | Development, testing |
| `permit` | EIP-3009 permit structure | EVM chains with Permit2 support |
| `real` | OnChainOS `payment pay` CLI placeholder | Production with Agentic Wallet |

---

## Strategy Configuration

All strategy rules are configurable via `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `STRATEGY_MIN_CONFIDENCE` | `70` | Minimum signal confidence (0-100%) |
| `STRATEGY_MAX_MCAP` | `5000000` | Maximum market cap in USD |
| `STRATEGY_MIN_LIQUIDITY` | `100000` | Minimum liquidity in USD |
| `STRATEGY_BUY_AMOUNT_USD` | `10` | Trade size in USD |
| `STRATEGY_SLIPPAGE` | `0.5` | Slippage tolerance (%) |
| `STRATEGY_CHAIN` | `501` | Chain ID(s) to trade (comma-separated) |

Chain IDs: `501` (Solana), `1` (Ethereum), `8453` (Base), `196` (X Layer)

---

## Dashboard

The React dashboard provides real-time monitoring:

- **Status Panel** — Publisher + Consumer health, signal count, trade count
- **Strategy Config** — Current active strategy parameters
- **Signal Feed** — Latest signals with confidence, price, wallet count
- **Trade Log** — Execution history with status, amount, timestamps

![Dashboard Preview](https://raw.githubusercontent.com/harishkotra/agent-signal-market/main/assets/dashboard.png)

---

## API Reference

### Publisher (`:3001`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/signals/latest` | GET | Latest signal (x402-protected) |
| `/api/v1/signals` | GET | All cached signals |
| `/health` | GET | Server status + signal count |
| `/api/consumer/*` | GET | Proxied to consumer |

### Consumer (`:3002`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/consumer/status` | GET | Consumer status + strategy config |
| `/api/consumer/trades` | GET | Trade journal |
| `/api/consumer/last-signal` | GET | Last fetched signal |

---

## Contributing

This project is an open reference implementation for agent-to-agent commerce. Here's how to contribute:

### New Features to Build

1. **Real x402 Settlement**
   - Integrate actual on-chain settlement via OnChainOS `payment pay` skill
   - Connect to Agentic Wallet for TEE-secured signing
   - Replace the simulated HMAC mode with real USDC transfers

2. **Multi-Publisher Support**
   - Subscribe to multiple publishers simultaneously
   - Compare signal quality across publishers (accuracy, timeliness)
   - Rank publishers by historical performance

3. **Strategy Backtesting Engine**
   - Feed historical signal data through the strategist
   - Track win/loss rate per strategy configuration
   - Auto-optimize strategy parameters using genetic algorithms

4. **Slack/Telegram/Discord Alerts**
   - Webhook integration for trade notifications
   - Customizable alert rules (trade executed, high-confidence signal, error)

5. **Advanced Order Types**
   - Limit orders (buy at a specific price)
   - Stop-loss protection
   - Trailing stop orders
   - Partial fill execution

6. **Portfolio Tracker**
   - Track PnL across all trades
   - Token balance aggregation
   - Performance reports (daily/weekly/monthly)

7. **WebSocket Real-Time Updates**
   - Push signal updates to the dashboard via WebSocket
   - Real-time trade status updates
   - Live price charts for tracked tokens

8. **Multi-Consumer Coordination**
   - Distributed consumer agents sharing a signal pool
   - Load-balanced trade execution
   - Consensus-based strategy validation

### Pull Request Process

1. Fork the repo and create a feature branch
2. Run `npm run typecheck` to verify types
3. Update README with details of changes if applicable
4. Submit a PR with a clear description of the change