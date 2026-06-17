import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import crypto from "node:crypto";
import axios from "axios";
import dotenv from "dotenv";
import type { Signal, TradeResult } from "./__shared-types.js";
import type { StrategyConfig } from "./strategist.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

const BASE_URL = "https://web3.okx.com/api/v6";

function getApiKey(): string {
  return process.env.CONSUMER_OKX_API_KEY || "";
}
function getSecretKey(): string {
  return process.env.CONSUMER_OKX_SECRET_KEY || "";
}
function getPassphrase(): string {
  return process.env.CONSUMER_OKX_PASSPHRASE || "";
}
function getProjectId(): string {
  return process.env.CONSUMER_OKX_PROJECT_ID || "";
}
function getWalletAddress(): string {
  return process.env.CONSUMER_WALLET_ADDRESS || "";
}

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
    getSecretKey(),
    timestamp,
    method,
    requestPath,
    bodyOrQuery,
  );
  return {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": getApiKey(),
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": getPassphrase(),
    "OK-ACCESS-PROJECT": getProjectId(),
  };
}

export async function executeSwap(
  signal: Signal,
  config: StrategyConfig,
): Promise<TradeResult> {
  const tradeId = `trade_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const fromToken =
    signal.chainIndex === "501"
      ? "So11111111111111111111111111111111111111112" // WSOL on Solana
      : "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"; // native ETH

  const swapParams = {
    chainIndex: signal.chainIndex,
    fromTokenAddress: fromToken,
    toTokenAddress: signal.tokenAddress,
    amount: (config.buyAmountUsd * 1_000_000).toString(),
    userWalletAddress: getWalletAddress(),
    slippagePercent: config.slippagePercent.toString(),
  };

  console.log(
    `  [Trader] Getting swap quote for ${config.buyAmountUsd} USD → ${signal.tokenSymbol || signal.tokenAddress.slice(0, 10)}...`,
  );

  try {
    const path = "dex/aggregator/quote";
    const requestPath = `/api/v6/${path}`;
    const queryString = "?" + new URLSearchParams(swapParams).toString();
    const headers = getHeaders("GET", requestPath, queryString);

    const quoteRes = await axios.get(`${BASE_URL}/${path}${queryString}`, {
      headers,
    });

    if (quoteRes.data.code !== "0" || !quoteRes.data.data?.[0]) {
      return {
        id: tradeId,
        signalId: signal.id,
        tokenAddress: signal.tokenAddress,
        chainIndex: signal.chainIndex,
        action: "buy",
        amountIn: config.buyAmountUsd.toString(),
        amountOut: "0",
        price: signal.price,
        txHash: null,
        status: "failed",
        error: quoteRes.data.msg || "quote failed",
        timestamp: Date.now(),
      };
    }

    const quote = quoteRes.data.data[0];
    const toAmount = quote.toTokenAmount || "0";

    console.log(
      `  [Trader] Quote received: ~${(parseInt(toAmount) / 1e6).toFixed(4)} tokens`,
    );
    console.log(
      `  [Trader] Swap requires approval + tx — run: onchainos swap ${config.buyAmountUsd} USDC to ${signal.tokenAddress.slice(0, 10)} on chain ${signal.chainIndex}`,
    );

    return {
      id: tradeId,
      signalId: signal.id,
      tokenAddress: signal.tokenAddress,
      chainIndex: signal.chainIndex,
      action: "buy",
      amountIn: config.buyAmountUsd.toString(),
      amountOut: toAmount,
      price: quote.price || signal.price,
      txHash: null,
      status: "pending",
      error: null,
      timestamp: Date.now(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id: tradeId,
      signalId: signal.id,
      tokenAddress: signal.tokenAddress,
      chainIndex: signal.chainIndex,
      action: "buy",
      amountIn: config.buyAmountUsd.toString(),
      amountOut: "0",
      price: signal.price,
      txHash: null,
      status: "failed",
      error: msg,
      timestamp: Date.now(),
    };
  }
}
