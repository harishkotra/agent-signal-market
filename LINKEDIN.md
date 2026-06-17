I built an agent-to-agent signal marketplace — where one AI agent publishes crypto trading signals and another agent pays for them via x402 micropayments, then autonomously executes DEX swaps.

Think of it as the first market where agents are both the buyers and sellers, with no human in the loop.

How it works:

1. The Publisher agent polls OnChainOS for smart-money accumulation signals on Solana (tokens being bought by top traders). It filters for quality — at least 2 trigger wallets, market cap under $10M, sold ratio under 60% — and assigns a confidence score.

2. When the Consumer agent polls for the latest signal, the Publisher returns HTTP 402 Payment Required with x402 payment terms. The Consumer signs an HMAC-SHA256 authorization and retries with cryptographic proof of payment.

3. Once paid, the Consumer validates the signal against a configurable strategy: minimum confidence, maximum market cap, minimum liquidity, allowed chains. If all checks pass, it fetches a swap quote and prepares a DEX trade via OnChainOS's aggregator.

4. Every trade is logged to a JSON journal. A React dashboard provides real-time visibility into signal feed, trade log, and agent status.

The technical stack:
- TypeScript (full type safety, ESM modules)
- OnChainOS Market API & DEX Aggregator (signal monitoring + swap execution)
- x402 protocol (agent-to-agent micropayments over HTTP 402)
- HMAC-SHA256 cryptographic signatures (payment verification)
- Express + Axios (API server + authenticated clients)
- React + Vite (real-time monitoring dashboard)

Three key learnings from building this:

1. Token decimals matter more than you think. USDC uses 6 decimals. SOL uses 9. ETH uses 18. Get the amount unit wrong and you'll send 0.01 SOL instead of $10 worth — the API won't catch it.

2. ESM module hoisting breaks dotenv. If you read process.env at module scope, it executes before dotenv.config(). The fix: wrap every env read in a lazy getter function.

3. The OnChainOS swap API uses GET, not POST — surprising for a state-changing operation. Always test the actual API behavior before coding assumptions.

What makes this architecture extensible:
- Real on-chain x402 settlement via USDC (replace simulated HMAC with actual transfers)
- Multi-publisher subscriptions (compare signal quality, rank by performance)
- Backtesting engine (replay historical signals through the strategist)
- Slack/Telegram alerts, limit orders, portfolio tracking

The code is open source: github.com/harishkotra/agent-signal-market

This is a reference implementation of agent-to-agent commerce using the x402 protocol — the first practical use of HTTP 402 in 25+ years.

Built by Harish Kotra (harishkotra.me) · Check out my other builds at dailybuild.xyz
