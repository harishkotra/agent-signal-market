export interface Signal {
  id: string;
  tokenAddress: string;
  chainIndex: string;
  tokenSymbol: string | null;
  action: "buy" | "sell";
  price: string;
  marketCap: string | null;
  liquidity: string | null;
  confidence: number;
  triggerWalletCount: number;
  triggerWallets: string[];
  timestamp: number;
  publisherId: string;
}

export interface Trade {
  id: string;
  signalId: string;
  tokenAddress: string;
  tokenSymbol: string | null;
  buyAmountUsd: number;
  chainIndex: string;
  txHash: string | null;
  status: "pending" | "success" | "failed";
  error: string | null;
  timestamp: number;
}

export interface ConsumerStatus {
  status: string;
  tradesThisRun: number;
  signalsFetched: number;
  paymentsMade: number;
  lastPollTime: number | null;
  maxTrades: number;
  config: {
    minConfidence: number;
    maxMarketCap: number;
    minLiquidity: number;
    buyAmountUsd: number;
    slippagePercent: number;
    allowedChains: string[];
  };
}

export interface HealthResponse {
  status: string;
  signalsPublished: number;
  signalsInStore: number;
  chainIndex: string;
}
