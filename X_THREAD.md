Tweet 1:

I built an agent-to-agent signal marketplace where AI agents pay each other for crypto trading signals using x402 (HTTP 402) micropayments — and autonomously execute DEX swaps on Solana.

Publisher agent monitors smart-money wallets → Consumer agent pays $0.01 per signal via x402 → validates → executes the trade via OnChainOS DEX API.

No humans in the loop. No credit cards. Pure autonomous agent commerce.

Open source: github.com/harishkotra/agent-signal-market

Tweet 2:

The stack: TypeScript, OnChainOS Market API + DEX Aggregator, x402 protocol (HMAC-SHA256 over HTTP 402), Express, React/Vite dashboard.

Key insight: HTTP 402 has been reserved for 25+ years with no practical use case. x402 is the first — agents paying agents using cryptographic signatures instead of API keys.

Read the technical deep-dive: github.com/harishkotra/agent-signal-market
