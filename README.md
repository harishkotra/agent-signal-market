# Agent Signal Marketplace

An **agent-to-agent signal marketplace** where one agent publishes crypto trading signals and other agents subscribe via **x402 micropayments** — all powered by OnChainOS.

```
[Smart Money Monitor Agent] → publishes signal → [x402 Payment Gateway] → 
→ [Trading Agent A pays $0.01] → auto-swaps via DEX API
→ [Trading Agent B pays $0.01] → auto-swaps via DEX API
```

## Architecture

```
                        OnChainOS Signal WS
                               │
                     ┌─────────▼─────────┐
                     │  PUBLISHER AGENT   │
                     │  (Express server)  │
                     │                    │
                     │  Signals served    │
                     │  via HTTP 402 +    │
                     │  x402 verification │
                     └─────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼───────┐ ┌─────▼────────┐ ┌────▼────────┐
     │ Consumer A     │ │ Consumer B   │ │ Consumer C  │
     │ pays $0.01     │ │ pays $0.01   │ │ pays $0.01  │
     │ per signal →   │ │ per signal   │ │ per signal  │
     │ auto-trades    │ │ filters out  │ │ auto-trades │
     └────────────────┘ └──────────────┘ └─────────────┘
```

### Flow

```
1. Publisher subscribes to OnChainOS signal WebSocket
   → Filters: ≥2 smart money wallets, mcap < $10M
   → Computes confidence score

2. Consumer polls GET /api/v1/signals/latest
   → Publisher returns HTTP 402 with x402 payment requirements

3. Consumer signs x402 authorization
   → Retries with X-Payment-Authorization header

4. Publisher verifies authorization → serves signal

5. Consumer validates signal against strategy:
   - confidence ≥ 70%?
   - market cap < $5M?
   - liquidity ≥ $100K?
   If yes → executes swap via OnChainOS DEX API

6. Trade logged to local journal (JSON)
```

## Getting Started

```bash
# Install
git clone <repo> && cd agent-signal-market
npm install

# Set up credentials
cp .env.example .env
# Fill in your OKX API keys (publisher + consumer) from:
# https://web3.okx.com/build/dev-portal
```

### Run the Publisher

```bash
npm run publisher
```

Starts:
- WebSocket connection to OnChainOS signal channel
- Express server on port 3001
- GET `/api/v1/signals/latest` — x402-protected signal endpoint
- GET `/health` — server status

### Run the Consumer

```bash
npm run consumer
```

Polls the publisher every 15s, pays per signal via x402, validates against strategy, executes trades, and logs results to `journal/trades.json`.

## How x402 Payments Work

```
Consumer                          Publisher
   │                                 │
   │── GET /api/v1/signals/latest ──▶│
   │◀─ HTTP 402 + x402Payload ──────│
   │     { accepts: [{              │
   │       scheme: "exact",         │
   │       amount: "10000",         │
   │       asset: "0x4ae46a...",   │
   │       network: "eip155:196"   │
   │     }]}                        │
   │                                 │
   │── sign x402 authorization ──── │
   │                                 │
   │── GET /signals/latest ────────▶│
   │   X-Payment-Authorization: sig │
   │◀─ 200 { signal: {...} } ───────│
```

## Project Structure

```
agent-signal-market/
├── packages/
│   ├── publisher/        # Signal publisher agent
│   │   ├── src/
│   │   │   ├── index.ts         # Express server, routes
│   │   │   ├── monitor.ts       # OnChainOS WS signal listener
│   │   │   ├── store.ts         # In-memory signal store + confidence scoring
│   │   │   └── x402-gate.ts     # HTTP 402 + signature verification
│   │   └── package.json
│   ├── consumer/         # Signal consumer agent
│   │   ├── src/
│   │   │   ├── index.ts         # CLI entry (poll → pay → trade loop)
│   │   │   ├── subscriber.ts    # x402 payment + signal retrieval
│   │   │   ├── strategist.ts    # Signal validation rules
│   │   │   ├── trader.ts        # OnChainOS DEX swap execution
│   │   │   └── journal.ts       # Trade logging to JSON file
│   │   └── package.json
│   └── shared/           # Shared types (reference only, inlined into packages)
├── .env.example
├── package.json          # Workspace root
└── README.md
```

## Tech Stack

- **TypeScript 5** — full type safety
- **OnChainOS Open API** — Market API (signals), DEX API (swaps), Agentic Wallet (signing)
- **x402 Protocol** — agent-to-agent micropayments
- **Express** — publisher API server
- **WebSocket** — real-time signal monitoring
- **Axios** — authenticated DEX API calls
- **Picocolors** — terminal output

## What Makes This Unique

- **First reference implementation** of agent-to-agent payments using x402 protocol
- **Autonomous pipeline**: signal → payment → validation → trade execution, no human in the loop
- **Composable**: anyone can run a publisher, anyone can run a consumer — open protocol
- **TEE-secured**: all signing happens inside Agentic Wallet's Trusted Execution Environment

## Contributing

Ideas to extend:

- **Real x402 settlement** — integrate actual on-chain settlement via OnChainOS Payment skills
- **Consumer dashboard** — web UI showing trade history, PnL, signal quality
- **Multi-publisher** — subscribe to multiple publishers, compare signal quality
- **Slack/Telegram alerts** — notify on trades
- **Strategy backtesting** — test strategies against historical signal data

---

Built by [Harish Kotra](https://harishkotra.me) — more builds at [dailybuild.xyz](https://dailybuild.xyz)
