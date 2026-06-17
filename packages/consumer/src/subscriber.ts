import type { Signal, X402Payload } from "./__shared-types.js";
import {
  createPaymentAuthorization as createPaymentAuth,
  getX402Mode,
} from "./x402-real.js";

const PUBLISHER_URL = process.env.PUBLISHER_URL || "http://localhost:3001";

function getWalletAddress(): string {
  return process.env.CONSUMER_WALLET_ADDRESS || "";
}

function getSecretKey(): string {
  return process.env.PUBLISHER_OKX_SECRET_KEY || "";
}

export interface FetchResult {
  signal: Signal | null;
  paid: boolean;
  error: string | null;
}

export async function fetchLatestSignal(): Promise<FetchResult> {
  try {
    const res = await fetch(`${PUBLISHER_URL}/api/v1/signals/latest`, {
      headers: { accept: "application/json" },
    });

    if (res.status === 204) {
      return { signal: null, paid: false, error: null };
    }

    if (res.status === 402) {
      return await handle402(res);
    }

    if (!res.ok) {
      return { signal: null, paid: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { signal: data.signal ?? null, paid: false, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { signal: null, paid: false, error: msg };
  }
}

async function handle402(res: Response): Promise<FetchResult> {
  const payload: X402Payload = await res.json();

  if (!payload.accepts?.length) {
    return { signal: null, paid: false, error: "no accepted payment methods" };
  }

  const accept = payload.accepts[0];
  console.log(
    `\n  Payment required: ${formatAmount(accept.amount)} ${accept.asset.slice(0, 6)} on ${accept.network}`,
  );
  console.log(`  Signing x402 authorization...`);

  try {
    const auth = await createPaymentAuth(
      accept,
      getWalletAddress(),
      getSecretKey(),
    );
    console.log(`  Mode: ${auth.mode}`);

    const retry = await fetch(`${PUBLISHER_URL}/api/v1/signals/latest`, {
      headers: {
        accept: "application/json",
        "x-payment-authorization": JSON.stringify(auth),
      },
    });

    if (retry.status === 402) {
      const err = await retry.json();
      return {
        signal: null,
        paid: false,
        error: err.error || "payment rejected",
      };
    }

    if (!retry.ok) {
      return {
        signal: null,
        paid: false,
        error: `HTTP ${retry.status} after payment`,
      };
    }

    const data = await retry.json();
    console.log(
      `  Signal received! Paid ${formatAmount(accept.amount)} ${accept.asset.slice(0, 6)}\n`,
    );
    return { signal: data.signal ?? null, paid: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { signal: null, paid: false, error: msg };
  }
}

function formatAmount(amount: string): string {
  const n = parseInt(amount) / 1_000_000;
  return n.toFixed(n < 0.01 ? 6 : 4);
}
