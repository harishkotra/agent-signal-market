import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import type { AcceptEntry } from "./__shared-types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

const MODE = (process.env.X402_MODE || "simulated") as
  | "simulated"
  | "real"
  | "permit";

export function getX402Mode(): string {
  return MODE;
}

export async function createPaymentAuthorization(
  accept: AcceptEntry,
  walletAddress: string,
  secretKey: string,
) {
  switch (MODE) {
    case "permit":
      return createPermitAuthorization(accept, walletAddress, secretKey);
    case "real":
      return createRealAuthorization(accept, walletAddress, secretKey);
    default:
      return createSimulatedAuthorization(accept, walletAddress, secretKey);
  }
}

function createSimulatedAuthorization(
  accept: AcceptEntry,
  walletAddress: string,
  secretKey: string,
) {
  const ts = Date.now();
  const message = [
    accept.scheme,
    accept.network,
    accept.asset,
    accept.amount,
    accept.payTo,
    walletAddress,
    String(ts),
  ].join("|");
  const hmac = crypto.createHmac("sha256", secretKey);
  hmac.update(message);
  return {
    signature: hmac.digest("hex"),
    messageHash: crypto.createHash("sha256").update(message).digest("hex"),
    signer: walletAddress,
    timestamp: ts,
    mode: "simulated",
  };
}

function createPermitAuthorization(
  accept: AcceptEntry,
  walletAddress: string,
  _secretKey: string,
) {
  const ts = Date.now();
  const nonce = crypto.randomBytes(32).toString("hex");
  const deadline = ts + 60_000;

  const permitPayload = {
    owner: walletAddress,
    spender: accept.payTo,
    value: accept.amount,
    nonce,
    deadline,
  };

  const message = JSON.stringify(permitPayload);
  const digest = crypto.createHash("sha256").update(message).digest("hex");

  return {
    signature: `0x${digest}`,
    messageHash: digest,
    signer: walletAddress,
    timestamp: ts,
    mode: "permit" as const,
    deadline,
    nonce,
    permitPayload,
  };
}

function createRealAuthorization(
  _accept: AcceptEntry,
  walletAddress: string,
  _secretKey: string,
) {
  return {
    signature: "",
    messageHash: "",
    signer: walletAddress,
    timestamp: Date.now(),
    mode: "real" as const,
    note: "Requires OnChainOS Agentic Wallet. Run: onchainos payment pay --accepts '<JSON>'",
  };
}
