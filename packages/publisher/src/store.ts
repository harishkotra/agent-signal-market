import type { Signal } from "./__shared-types.js";
import { generateSignalId } from "./__shared-x402.js";
import type { RawSignal } from "./monitor.js";

export class SignalStore {
  private signals: Signal[] = [];
  private maxSize: number;
  private publisherId: string;

  constructor(maxSize: number = 25, publisherId: string = "publisher-01") {
    this.maxSize = maxSize;
    this.publisherId = publisherId;
  }

  add(raw: RawSignal): Signal {
    const signal: Signal = {
      id: generateSignalId(),
      tokenAddress: raw.tokenAddress,
      chainIndex: raw.chainIndex,
      tokenSymbol: raw.tokenSymbol,
      action: raw.action,
      price: raw.price,
      marketCap: raw.marketCap,
      liquidity: raw.liquidity,
      confidence: this.computeConfidence(raw),
      triggerWalletCount: raw.triggerWalletCount,
      triggerWallets: raw.triggerWallets.slice(0, 5),
      timestamp: raw.timestamp,
      publisherId: this.publisherId,
    };

    this.signals.unshift(signal);
    if (this.signals.length > this.maxSize) {
      this.signals = this.signals.slice(0, this.maxSize);
    }

    console.log(
      `  [Store] Signal #${signal.id}: ${signal.tokenSymbol || signal.tokenAddress.slice(0, 10)} confidence=${signal.confidence}%`,
    );
    return signal;
  }

  latest(): Signal | null {
    return this.signals[0] ?? null;
  }

  all(): Signal[] {
    return [...this.signals];
  }

  private computeConfidence(raw: RawSignal): number {
    let score = 0;
    if (raw.triggerWalletCount >= 5) score += 40;
    else if (raw.triggerWalletCount >= 3) score += 30;
    else if (raw.triggerWalletCount >= 2) score += 20;
    else score += 10;

    if (raw.marketCap) {
      const mcap = parseFloat(raw.marketCap);
      if (mcap > 0 && mcap < 1000000) score += 20;
      else if (mcap < 5000000) score += 15;
      else if (mcap < 10000000) score += 10;
    }

    if (raw.liquidity) {
      const liq = parseFloat(raw.liquidity);
      if (liq > 500000) score += 20;
      else if (liq > 100000) score += 15;
      else if (liq > 50000) score += 10;
    }

    score += raw.triggerWallets.length > 0 ? 10 : 0;

    return Math.min(100, score);
  }
}
