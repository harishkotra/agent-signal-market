import crypto from "node:crypto";

// Simulate what both sides do
const accept = {
  scheme: "exact",
  network: "eip155:196",
  asset: "0x4ae46a...",
  amount: "10000",
  payTo: "0x67465099de35858b453ec0bfd8c8d38704da0180",
};

const walletAddr = "0xCONSUMER_WALLET"; // consumer wallet
const secret = process.env.PUBLISHER_OKX_SECRET_KEY || "";

console.log("Secret (first 8 chars):", secret.slice(0, 8) + "...");
console.log("Secret length:", secret.length);

// Consumer side
const ts = Date.now();
const msgParts = [accept.scheme, accept.network, accept.asset, accept.amount, accept.payTo, walletAddr, String(ts)];
const message = msgParts.join("|");

console.log("\nMessage parts:", msgParts);
console.log("Message:", message);

const hmac = crypto.createHmac("sha256", secret);
hmac.update(message);
const signature = hmac.digest("hex");

// Publisher side - reconstruct
const pubMsg = [accept.scheme, accept.network, accept.asset, accept.amount, accept.payTo, walletAddr, String(ts)].join("|");
const pubHmac = crypto.createHmac("sha256", secret);
pubHmac.update(pubMsg);
const expectedSig = pubHmac.digest("hex");

console.log("\nSignature:", signature);
console.log("Expected:", expectedSig);
console.log("Match:", signature === expectedSig);
console.log("Timestamp age:", Date.now() - ts, "ms");
