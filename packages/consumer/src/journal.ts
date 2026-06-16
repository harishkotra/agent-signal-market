import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { TradeResult } from "./__shared-types.js";

const JOURNAL_DIR = resolve("journal");
const JOURNAL_FILE = resolve(JOURNAL_DIR, "trades.json");

export function initJournal(): void {
  if (!existsSync(JOURNAL_DIR)) {
    mkdirSync(JOURNAL_DIR, { recursive: true });
  }
  if (!existsSync(JOURNAL_FILE)) {
    writeFileSync(JOURNAL_FILE, JSON.stringify([], null, 2));
  }
}

export function logTrade(trade: TradeResult): void {
  const trades = readTrades();
  trades.unshift(trade);

  const maxEntries = 500;
  const trimmed = trades.slice(0, maxEntries);
  writeFileSync(JOURNAL_FILE, JSON.stringify(trimmed, null, 2));
}

export function readTrades(): TradeResult[] {
  try {
    return JSON.parse(readFileSync(JOURNAL_FILE, "utf-8"));
  } catch {
    return [];
  }
}

export function printSummary(): void {
  const trades = readTrades();
  if (trades.length === 0) {
    console.log("  No trades logged yet.");
    return;
  }

  const total = trades.length;
  const successful = trades.filter((t) => t.status === "confirmed").length;
  const failed = trades.filter((t) => t.status === "failed").length;
  const pending = trades.filter((t) => t.status === "pending").length;

  console.log(`  ── Trade Journal ──`);
  console.log(`  Total:  ${total}`);
  console.log(`  OK:     ${successful}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Pending: ${pending}`);
  console.log(`  File: ${JOURNAL_FILE}`);
}
