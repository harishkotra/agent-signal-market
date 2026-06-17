import { useState, useEffect, useCallback } from "react";
import {
  fetchSignals,
  fetchHealth,
  fetchTrades,
  fetchConsumerStatus,
} from "./api.js";
import type { Signal, Trade, ConsumerStatus, HealthResponse } from "./types.js";

function usePoll<T>(fetcher: () => Promise<T>, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      setData(await fetcher());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [poll, intervalMs]);

  return { data, error, refresh: poll };
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        backgroundColor: ok ? "#22c55e" : "#ef4444",
        marginRight: 6,
      }}
    />
  );
}

function StatusPanel() {
  const health = usePoll(fetchHealth, 10000);
  const consumer = usePoll(fetchConsumerStatus, 10000);
  const h = health.data;
  const c = consumer.data;

  return (
    <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
      <div
        style={{ flex: 1, background: "#1e293b", borderRadius: 8, padding: 16 }}
      >
        <h3
          style={{
            margin: "0 0 8px",
            color: "#94a3b8",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          <StatusDot ok={!!h} /> Publisher
        </h3>
        {h ? (
          <div style={{ fontSize: 14, color: "#e2e8f0" }}>
            <div>
              Chain: <b>{h.chainIndex}</b>
            </div>
            <div>
              Signals published: <b>{h.signalsPublished}</b>
            </div>
            <div>
              In store: <b>{h.signalsInStore}</b>
            </div>
          </div>
        ) : (
          <div style={{ color: "#ef4444", fontSize: 14 }}>
            {health.error || "Connecting..."}
          </div>
        )}
      </div>
      <div
        style={{ flex: 1, background: "#1e293b", borderRadius: 8, padding: 16 }}
      >
        <h3
          style={{
            margin: "0 0 8px",
            color: "#94a3b8",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          <StatusDot ok={!!c} /> Consumer
        </h3>
        {c ? (
          <div style={{ fontSize: 14, color: "#e2e8f0" }}>
            <div>
              Status: <b>{c.status}</b>
            </div>
            <div>
              Signals fetched: <b>{c.signalsFetched}</b>
            </div>
            <div>
              Trades:{" "}
              <b>
                {c.tradesThisRun} / {c.maxTrades}
              </b>
            </div>
            <div>
              Payments: <b>{c.paymentsMade}</b>
            </div>
          </div>
        ) : (
          <div style={{ color: "#ef4444", fontSize: 14 }}>
            {consumer.error || "Connecting..."}
          </div>
        )}
      </div>
    </div>
  );
}

function SignalFeed() {
  const { data, error } = usePoll(() => fetchSignals(), 15000);
  const signals: Signal[] = data?.signals ?? [];

  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: 8,
        padding: 16,
        marginBottom: 24,
      }}
    >
      <h2 style={{ margin: "0 0 12px", color: "#e2e8f0", fontSize: 16 }}>
        Signal Feed{" "}
        <span style={{ color: "#94a3b8", fontSize: 12 }}>
          ({signals.length} in store)
        </span>
      </h2>
      {error && (
        <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>
          {error}
        </div>
      )}
      {signals.length === 0 ? (
        <div style={{ color: "#64748b", fontSize: 14 }}>
          No signals yet. Publisher is polling every 30s...
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr
                style={{ color: "#94a3b8", borderBottom: "1px solid #334155" }}
              >
                <th style={{ textAlign: "left", padding: "6px 8px" }}>
                  Symbol
                </th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>
                  Price
                </th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>
                  Confidence
                </th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>
                  Wallets
                </th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>
                  Market Cap
                </th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => (
                <tr
                  key={s.id}
                  style={{
                    borderBottom: "1px solid #1e293b",
                    color: "#e2e8f0",
                  }}
                >
                  <td style={{ padding: "6px 8px" }}>
                    <b>{s.tokenSymbol || s.tokenAddress.slice(0, 10)}</b>
                    <span
                      style={{ color: "#64748b", fontSize: 11, marginLeft: 6 }}
                    >
                      {s.tokenAddress.slice(0, 6)}...
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      textAlign: "right",
                      fontFamily: "monospace",
                    }}
                  >
                    ${parseFloat(s.price).toFixed(8)}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    <span
                      style={{
                        color:
                          s.confidence >= 70
                            ? "#22c55e"
                            : s.confidence >= 50
                              ? "#eab308"
                              : "#ef4444",
                      }}
                    >
                      {s.confidence}%
                    </span>
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {s.triggerWalletCount}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      textAlign: "right",
                      fontFamily: "monospace",
                    }}
                  >
                    {s.marketCap
                      ? `$${(parseFloat(s.marketCap) / 1e6).toFixed(2)}M`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TradeLog() {
  const { data, error } = usePoll(() => fetchTrades(), 15000);
  const trades: Trade[] = data?.trades ?? [];

  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: 8,
        padding: 16,
        marginBottom: 24,
      }}
    >
      <h2 style={{ margin: "0 0 12px", color: "#e2e8f0", fontSize: 16 }}>
        Trade Log{" "}
        <span style={{ color: "#94a3b8", fontSize: 12 }}>
          ({trades.length} total)
        </span>
      </h2>
      {error && (
        <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>
          {error}
        </div>
      )}
      {trades.length === 0 ? (
        <div style={{ color: "#64748b", fontSize: 14 }}>
          No trades yet. Consumer evaluates signals every 15s...
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr
                style={{ color: "#94a3b8", borderBottom: "1px solid #334155" }}
              >
                <th style={{ textAlign: "left", padding: "6px 8px" }}>
                  Symbol
                </th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>
                  Amount
                </th>
                <th style={{ textAlign: "center", padding: "6px 8px" }}>
                  Status
                </th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Time</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr
                  key={t.id}
                  style={{
                    borderBottom: "1px solid #1e293b",
                    color: "#e2e8f0",
                  }}
                >
                  <td style={{ padding: "6px 8px" }}>
                    <b>{t.tokenSymbol || t.tokenAddress.slice(0, 10)}</b>
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      textAlign: "right",
                      fontFamily: "monospace",
                    }}
                  >
                    ${t.buyAmountUsd}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                    <span
                      style={{
                        color:
                          t.status === "success"
                            ? "#22c55e"
                            : t.status === "pending"
                              ? "#eab308"
                              : "#ef4444",
                        fontSize: 12,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background:
                          t.status === "success"
                            ? "#052e16"
                            : t.status === "pending"
                              ? "#422006"
                              : "#450a0a",
                      }}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      textAlign: "right",
                      fontFamily: "monospace",
                      fontSize: 12,
                      color: "#94a3b8",
                    }}
                  >
                    {new Date(t.timestamp).toLocaleTimeString()}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      color: "#ef4444",
                      fontSize: 12,
                    }}
                  >
                    {t.error || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StrategyConfig() {
  const { data } = usePoll(fetchConsumerStatus, 15000);
  const c = data?.config;

  if (!c) return null;

  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: 8,
        padding: 16,
        marginBottom: 24,
      }}
    >
      <h2 style={{ margin: "0 0 12px", color: "#e2e8f0", fontSize: 16 }}>
        Strategy Config
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          fontSize: 13,
          color: "#e2e8f0",
        }}
      >
        <div>
          <span style={{ color: "#94a3b8" }}>Min Confidence</span>
          <br />
          <b>{c.minConfidence}%</b>
        </div>
        <div>
          <span style={{ color: "#94a3b8" }}>Max Market Cap</span>
          <br />
          <b>${(c.maxMarketCap / 1e6).toFixed(1)}M</b>
        </div>
        <div>
          <span style={{ color: "#94a3b8" }}>Buy Amount</span>
          <br />
          <b>${c.buyAmountUsd}</b>
        </div>
        <div>
          <span style={{ color: "#94a3b8" }}>Slippage</span>
          <br />
          <b>{c.slippagePercent}%</b>
        </div>
        <div>
          <span style={{ color: "#94a3b8" }}>Chain</span>
          <br />
          <b>{c.allowedChains.join(", ")}</b>
        </div>
        <div>
          <span style={{ color: "#94a3b8" }}>Min Liquidity</span>
          <br />
          <b>${c.minLiquidity.toLocaleString()}</b>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>
            📡 Signal Market Dashboard
          </h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
            x402-protected agent-to-agent signal marketplace
          </p>
        </header>
        <StatusPanel />
        <StrategyConfig />
        <SignalFeed />
        <TradeLog />
        <footer
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "#475569",
            padding: 24,
            borderTop: "1px solid #1e293b",
          }}
        >
          Built by{" "}
          <a
            href="https://harishkotra.me"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#60a5fa", textDecoration: "none" }}
          >
            Harish Kotra
          </a>{" "}
          ·{" "}
          <a
            href="https://dailybuild.xyz"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#60a5fa", textDecoration: "none" }}
          >
            dailybuild.xyz
          </a>
        </footer>
      </div>
    </div>
  );
}
