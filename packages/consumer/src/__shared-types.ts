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

export interface AcceptEntry {
  scheme: "exact";
  network: string;
  asset: string;
  amount: string;
  payTo: string;
}

export interface X402Payload {
  x402Version: string;
  accepts: AcceptEntry[];
  resource: string;
}

export interface PaymentAuthorization {
  signature: string;
  messageHash: string;
  signer: string;
  timestamp: number;
}

export interface TradeResult {
  id: string;
  signalId: string;
  tokenAddress: string;
  chainIndex: string;
  action: "buy" | "sell";
  amountIn: string;
  amountOut: string;
  price: string;
  txHash: string | null;
  status: "pending" | "confirmed" | "failed";
  error: string | null;
  timestamp: number;
}
