const PUBLISHER_BASE = "/api/v1";
const CONSUMER_BASE = "/api/consumer";

export async function fetchSignals(): Promise<{
  signals: import("./types.js").Signal[];
  count: number;
}> {
  const res = await fetch(`${PUBLISHER_BASE}/signals`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchHealth(): Promise<
  import("./types.js").HealthResponse
> {
  const res = await fetch("/health");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTrades(): Promise<{
  trades: import("./types.js").Trade[];
}> {
  const res = await fetch(`${CONSUMER_BASE}/trades`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchConsumerStatus(): Promise<
  import("./types.js").ConsumerStatus
> {
  const res = await fetch(`${CONSUMER_BASE}/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
