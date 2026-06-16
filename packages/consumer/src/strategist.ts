import type { Signal } from "./__shared-types.js";

export interface StrategyConfig {
  minConfidence: number;
  maxMarketCap: number;
  minLiquidity: number;
  buyAmountUsd: number;
  slippagePercent: number;
  allowedChains: string[];
}

export function loadStrategy(): StrategyConfig {
  return {
    minConfidence: parseInt(process.env.STRATEGY_MIN_CONFIDENCE || "70"),
    maxMarketCap: parseInt(process.env.STRATEGY_MAX_MCAP || "5000000"),
    minLiquidity: parseInt(process.env.STRATEGY_MIN_LIQUIDITY || "100000"),
    buyAmountUsd: parseInt(process.env.STRATEGY_BUY_AMOUNT_USD || "10"),
    slippagePercent: parseFloat(process.env.STRATEGY_SLIPPAGE || "0.5"),
    allowedChains: (process.env.STRATEGY_CHAIN || "501").split(","),
  };
}

export interface ValidationResult {
  shouldTrade: boolean;
  reason: string | null;
}

export function validateSignal(
  signal: Signal,
  config: StrategyConfig,
): ValidationResult {
  if (signal.action !== "buy") {
    return { shouldTrade: false, reason: "action is not buy" };
  }

  if (!config.allowedChains.includes(signal.chainIndex)) {
    return {
      shouldTrade: false,
      reason: `chain ${signal.chainIndex} not in allowed list`,
    };
  }

  if (signal.confidence < config.minConfidence) {
    return {
      shouldTrade: false,
      reason: `confidence ${signal.confidence}% < minimum ${config.minConfidence}%`,
    };
  }

  if (signal.marketCap) {
    const mcap = parseFloat(signal.marketCap);
    if (mcap > config.maxMarketCap) {
      return {
        shouldTrade: false,
        reason: `market cap $${formatNum(mcap)} > max $${formatNum(config.maxMarketCap)}`,
      };
    }
  }

  if (signal.liquidity) {
    const liq = parseFloat(signal.liquidity);
    if (liq < config.minLiquidity) {
      return {
        shouldTrade: false,
        reason: `liquidity $${formatNum(liq)} < minimum $${formatNum(config.minLiquidity)}`,
      };
    }
  }

  return { shouldTrade: true, reason: null };
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
  return n.toFixed(2);
}
