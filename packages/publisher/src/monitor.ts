import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import crypto from "node:crypto";
import axios from "axios";
import dotenv from "dotenv";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

const API_KEY = process.env.PUBLISHER_OKX_API_KEY || "";
const SECRET_KEY = process.env.PUBLISHER_OKX_SECRET_KEY || "";
const PASSPHRASE = process.env.PUBLISHER_OKX_PASSPHRASE || "";
const PROJECT_ID = process.env.PUBLISHER_OKX_PROJECT_ID || "";

function getSignature(
  secretKey: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body: string = "",
): string {
  const message = timestamp + method + requestPath + body;
  const hmac = crypto.createHmac("sha256", secretKey);
  hmac.update(message);
  return hmac.digest("base64");
}

function getHeaders(
  method: string,
  requestPath: string,
  bodyOrQuery: string = "",
) {
  const timestamp = new Date().toISOString().slice(0, -5) + "Z";
  const signature = getSignature(
    SECRET_KEY,
    timestamp,
    method,
    requestPath,
    bodyOrQuery,
  );
  return {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": API_KEY,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": PASSPHRASE,
    "OK-ACCESS-PROJECT": PROJECT_ID,
  };
}

interface ApiToken {
  tokenAddress?: string;
  symbol?: string;
  name?: string;
  marketCapUsd?: string;
  holders?: string;
}

interface ApiSignal {
  chainIndex?: string;
  price?: string;
  timestamp?: string;
  token?: ApiToken;
  triggerWalletCount?: string;
  triggerWalletAddress?: string;
  walletType?: string;
  amountUsd?: string;
  soldRatioPercent?: string;
}

export interface RawSignal {
  tokenAddress: string;
  chainIndex: string;
  tokenSymbol: string | null;
  action: "buy" | "sell";
  price: string;
  marketCap: string | null;
  liquidity: string | null;
  triggerWalletCount: number;
  triggerWallets: string[];
  timestamp: number;
  soldRatioPercent: string | null;
}

export type SignalFilter = (signal: RawSignal) => boolean;

interface ApiSignal {
  chainIndex?: string;
  price?: string;
  timestamp?: string;
  token?: ApiToken;
  triggerWalletCount?: string;
  triggerWalletAddress?: string;
  walletType?: string;
  amountUsd?: string;
}

export class SignalPoller {
  private filters: SignalFilter[] = [];
  private onSignal: (signal: RawSignal) => void;
  private chainIndex: string;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private seenTokens: Set<string> = new Set();

  constructor(chainIndex: string, onSignal: (signal: RawSignal) => void) {
    this.chainIndex = chainIndex;
    this.onSignal = onSignal;
  }

  addFilter(fn: SignalFilter): void {
    this.filters.push(fn);
  }

  private passesFilters(signal: RawSignal): boolean {
    return this.filters.every((fn) => fn(signal));
  }

  async poll(): Promise<void> {
    try {
      const path = "dex/market/signal/list";
      const requestPath = `/api/v6/${path}`;
      const body = {
        chainIndex: this.chainIndex,
        walletType: "1,2,3",
        minAddressCount: "2",
        limit: "10",
      };
      const bodyStr = JSON.stringify(body);
      const headers = getHeaders("POST", requestPath, bodyStr);

      const res = await axios.post(
        `https://web3.okx.com/api/v6/${path}`,
        body,
        { headers },
      );

      if (res.data.code !== "0" || !res.data.data?.length) {
        console.log(`  [Monitor] Polled — no signals found`);
        return;
      }

      for (const raw of res.data.data as ApiSignal[]) {
        const token = raw.token || {};
        const tokenAddress = token.tokenAddress || "";
        if (!tokenAddress || this.seenTokens.has(tokenAddress)) continue;
        this.seenTokens.add(tokenAddress);

        const signal: RawSignal = {
          tokenAddress,
          chainIndex: raw.chainIndex || this.chainIndex,
          tokenSymbol: token.symbol || null,
          action: "buy",
          price: raw.price || "0",
          marketCap: token.marketCapUsd || null,
          liquidity: null,
          triggerWalletCount: parseInt(raw.triggerWalletCount || "0") || 0,
          triggerWallets: raw.triggerWalletAddress
            ? raw.triggerWalletAddress.split(",")
            : [],
          timestamp: parseInt(raw.timestamp || "") || Date.now(),
          soldRatioPercent: raw.soldRatioPercent || null,
        };

        if (this.passesFilters(signal)) {
          console.log(
            `  [Monitor] Signal: ${signal.tokenSymbol || tokenAddress.slice(0, 10)} (${signal.triggerWalletCount} wallets)`,
          );
          this.onSignal(signal);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401") || msg.includes("402")) {
        // auth/payment error — skip silently
      } else if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
        // network error — skip silently
      } else {
        console.log(`  [Monitor] Poll error: ${msg}`);
      }
    }
  }

  start(intervalMs: number = 30000): void {
    console.log(
      `  [Monitor] Polling signal list every ${intervalMs / 1000}s on chain ${this.chainIndex}...`,
    );
    this.poll();
    this.intervalId = setInterval(() => this.poll(), intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
