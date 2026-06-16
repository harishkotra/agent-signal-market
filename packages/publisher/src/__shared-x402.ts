import type {
  AcceptEntry,
  X402Payload,
  PaymentAuthorization,
} from "./__shared-types.js";

export const X402_VERSION = "1";

export function buildX402Response(
  amount: string,
  tokenAddress: string,
  chainId: string,
  payTo: string,
  resource: string,
): X402Payload {
  return {
    x402Version: X402_VERSION,
    accepts: [
      {
        scheme: "exact",
        network: `eip155:${chainId}`,
        asset: tokenAddress,
        amount,
        payTo,
      },
    ],
    resource,
  };
}

export function formatX402Header(payload: X402Payload): string {
  return JSON.stringify(payload);
}

export function createPaymentAuthorization(
  accept: AcceptEntry,
  walletAddress: string,
  secretKey: string,
): PaymentAuthorization {
  const message = [
    accept.scheme,
    accept.network,
    accept.asset,
    accept.amount,
    accept.payTo,
    walletAddress,
    String(Date.now()),
  ].join("|");

  const crypto = require("node:crypto");
  const hmac = crypto.createHmac("sha256", secretKey);
  hmac.update(message);
  const signature = hmac.digest("hex");

  return {
    signature,
    messageHash: crypto.createHash("sha256").update(message).digest("hex"),
    signer: walletAddress,
    timestamp: Date.now(),
  };
}

export function verifyPaymentAuthorization(
  auth: PaymentAuthorization,
  accept: AcceptEntry,
  expectedSigner: string,
  secretKey: string,
  maxAgeMs: number = 30000,
): boolean {
  if (auth.signer !== expectedSigner) return false;
  if (Date.now() - auth.timestamp > maxAgeMs) return false;

  const message = [
    accept.scheme,
    accept.network,
    accept.asset,
    accept.amount,
    accept.payTo,
    auth.signer,
    String(auth.timestamp),
  ].join("|");

  const crypto = require("node:crypto");
  const expectedSig = crypto
    .createHmac("sha256", secretKey)
    .update(message)
    .digest("hex");

  return auth.signature === expectedSig;
}

export function generateSignalId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `sig_${ts}_${rand}`;
}
