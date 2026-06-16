import { Router, type Request, type Response } from "express";
import {
  buildX402Response,
  verifyPaymentAuthorization,
} from "./__shared-x402.js";
import type {
  AcceptEntry,
  X402Payload,
} from "./__shared-types.js";
import type { SignalStore } from "./store.js";

const X402_TOKEN = "0x4ae46a..."; // USDG on X Layer
const X402_CHAIN = "196";
const X402_AMOUNT = "10000"; // 0.01 USDG (6 decimals)
const PAYMENT_EXPIRY_MS = 30000;

export function createX402Router(
  store: SignalStore,
  payToAddress: string,
  verificationSecret: string,
  signalCount: { value: number },
): Router {
  const router = Router();

  router.get("/signals/latest", (req: Request, res: Response) => {
    const signal = store.latest();
    if (!signal) {
      return res.status(204).end();
    }

    const authHeader = req.headers["x-payment-authorization"] as
      | string
      | undefined;

    if (!authHeader) {
      const x402 = buildX402Response(
        X402_AMOUNT,
        X402_TOKEN,
        X402_CHAIN,
        payToAddress,
        "/api/v1/signals/latest",
      );
      res.set(
        "X-PAYMENT-REQUIRED",
        Buffer.from(JSON.stringify(x402)).toString("base64"),
      );
      return res.status(402).json(x402);
    }

    try {
      const auth = JSON.parse(authHeader);
      const accept: AcceptEntry = {
        scheme: "exact",
        network: `eip155:${X402_CHAIN}`,
        asset: X402_TOKEN,
        amount: X402_AMOUNT,
        payTo: payToAddress,
      };

      if (
        !verifyPaymentAuthorization(
          auth,
          accept,
          auth.signer,
          verificationSecret,
          PAYMENT_EXPIRY_MS,
        )
      ) {
        return res
          .status(402)
          .json({ error: "invalid or expired payment authorization" });
      }

      signalCount.value++;
      return res.json({ signal });
    } catch {
      return res.status(402).json({ error: "malformed authorization" });
    }
  });

  router.get("/signals", (_req: Request, res: Response) => {
    res.json({ signals: store.all(), count: store.all().length });
  });

  return router;
}
