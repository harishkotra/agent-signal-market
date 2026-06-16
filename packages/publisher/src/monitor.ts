import type { Signal } from "./__shared-types.js";

export type SignalFilter = (signal: RawSignal) => boolean;

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
}

export class SignalMonitor {
  private ws: WebSocket | null = null;
  private filters: SignalFilter[] = [];
  private onSignal: (signal: RawSignal) => void;
  private chainIndex: string;

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

  async connect(): Promise<void> {
    const url = "wss://wsdex.okx.com/ws/v6/dex";

    console.log(
      `  [Monitor] Connecting to OnChainOS signal WS on chain ${this.chainIndex}...`,
    );

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      const subscribeMsg = {
        op: "subscribe",
        args: [
          {
            channel: "dex-market-new-signal-openapi",
            chainIndex: this.chainIndex,
          },
        ],
      };
      this.ws!.send(JSON.stringify(subscribeMsg));
      console.log(
        `  [Monitor] Subscribed to dex-market-new-signal-openapi on chain ${this.chainIndex}`,
      );
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);

        if (data.event === "subscribe") return;
        if (data.arg?.channel !== "dex-market-new-signal-openapi") return;

        const raw = data.data;
        if (!raw) return;

        const signal: RawSignal = {
          tokenAddress: raw.tokenAddress || raw.tokenContractAddress,
          chainIndex: raw.chainIndex || this.chainIndex,
          tokenSymbol: raw.tokenSymbol || null,
          action: "buy",
          price: raw.price || "0",
          marketCap: raw.marketCap || null,
          liquidity: raw.liquidity || null,
          triggerWalletCount: parseInt(raw.triggerWalletCount || "0") || 0,
          triggerWallets: raw.triggerWallets || [],
          timestamp: Date.now(),
        };

        if (this.passesFilters(signal)) {
          console.log(
            `  [Monitor] Signal detected: ${signal.tokenSymbol || signal.tokenAddress.slice(0, 10)} (${signal.triggerWalletCount} wallets)`,
          );
          this.onSignal(signal);
        }
      } catch {
        // skip malformed messages
      }
    };

    this.ws.onerror = (err: Event) => {
      console.error("  [Monitor] WS error, reconnecting in 5s...");
      setTimeout(() => this.connect(), 5000);
    };

    this.ws.onclose = () => {
      console.log("  [Monitor] WS closed, reconnecting in 5s...");
      setTimeout(() => this.connect(), 5000);
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
