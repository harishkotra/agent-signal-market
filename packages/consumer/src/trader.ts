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

const USDC_ADDRESSES: Record<string, string> = {
  "501": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Solana
  "1": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum
  "8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
  "56": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // BSC
  "137": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // Polygon
  "10": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // Optimism
  "42161": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum
  "196": "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4", // X Layer
};

function getFromToken(chainIndex: string): string {
  return (
    USDC_ADDRESSES[chainIndex] || "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
  );
}

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

  const fromToken = getFromToken(signal.chainIndex);
  const isNative = fromToken === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

  try {
    let amountIn;
    if (isNative) {
      const pricePath = "dex/market/price-info";
      const priceQuery = `?chainIndex=${signal.chainIndex}&tokenAddress=${fromToken}`;
      const priceHeaders = getHeaders(
        "GET",
        `/api/v6/${pricePath}`,
        priceQuery,
      );
      const priceRes = await axios.get(
        `${BASE_URL}/${pricePath}${priceQuery}`,
        { headers: priceHeaders },
      );
      const tokenPrice = parseFloat(priceRes.data?.data?.[0]?.priceUsd || "0");
      if (!tokenPrice) {
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
          error: "could not fetch native token price",
          timestamp: Date.now(),
        };
      }
      amountIn = Math.floor(
        (config.buyAmountUsd / tokenPrice) * 1e18,
      ).toString();
    } else {
      amountIn = (config.buyAmountUsd * 1_000_000).toString();
    }

    const swapParams = {
      chainIndex: signal.chainIndex,
      fromTokenAddress: fromToken,
      toTokenAddress: signal.tokenAddress,
      amount: amountIn,
      userWalletAddress: getWalletAddress(),
      slippagePercent: config.slippagePercent.toString(),
    };

    console.log(
      `  [Trader] Getting swap quote for ${config.buyAmountUsd} USD (${amountIn}) → ${signal.tokenSymbol || signal.tokenAddress.slice(0, 10)}...`,
    );

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

    const swapPath = "dex/aggregator/swap";
    const swapCallParams: Record<string, string> = {
      chainIndex: signal.chainIndex,
      fromTokenAddress: fromToken,
      toTokenAddress: signal.tokenAddress,
      amount: amountIn,
      userWalletAddress: getWalletAddress(),
      slippagePercent: config.slippagePercent.toString(),
      swapMode: "exactIn",
    };
    const swapQuery = "?" + new URLSearchParams(swapCallParams).toString();
    const swapHeaders = getHeaders("GET", `/api/v6/${swapPath}`, swapQuery);
    const swapRes = await axios.get(`${BASE_URL}/${swapPath}${swapQuery}`, {
      headers: swapHeaders,
    });

    if (swapRes.data.code !== "0" || !swapRes.data.data?.[0]) {
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
        error: swapRes.data.msg || "swap execution failed",
        timestamp: Date.now(),
      };
    }

    const swapData = swapRes.data.data[0];
    const tx = swapData.tx || {};
    const txHash = tx.txHash || tx.orderId || "";
    const hasTxData = !!tx.data && !!tx.to;

    console.log(
      `  [Trader] Swap prepared: to=${tx.to?.slice(0, 20)}... | minReceive=${tx.minReceiveAmount || "?"}`,
    );

    if (hasTxData) {
      console.log(
        `  [Trader] Broadcast: onchainos gateway broadcast --chain-id ${signal.chainIndex} --data '${tx.data.slice(0, 40)}...' --to '${tx.to}'`,
      );
    }

    return {
      id: tradeId,
      signalId: signal.id,
      tokenAddress: signal.tokenAddress,
      chainIndex: signal.chainIndex,
      action: "buy",
      amountIn: config.buyAmountUsd.toString(),
      amountOut: toAmount,
      price: quote.price || signal.price,
      txHash: txHash || null,
      status: hasTxData ? "confirmed" : "failed",
      error: hasTxData ? null : "no swap tx data returned",
      timestamp: Date.now(),
    };
  } catch (err: unknown) {
    let msg = err instanceof Error ? err.message : String(err);
    if (axios.isAxiosError(err) && err.response?.data) {
      msg = `API ${err.response.status}: ${JSON.stringify(err.response.data)}`;
    }
    console.log(`  [Trader] Swap error: ${msg}`);
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
