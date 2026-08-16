import { DownloadResponse, InstrumentMeta } from "../types";

const clientMemoryCache = new Map<string, DownloadResponse>();

export async function fetchInstruments(): Promise<InstrumentMeta[]> {
  const res = await fetch("/api/instruments");
  if (!res.ok) {
    throw new Error("Failed to load supported instruments from server.");
  }
  const data = await res.json();
  return data.instruments || [];
}

export async function downloadMarketData(
  instrument: string,
  fromDate: string,
  toDate: string,
  priceType: "bid" | "ask" = "bid"
): Promise<DownloadResponse> {
  const cacheKey = `${instrument}_${fromDate}_${toDate}_${priceType}`;

  // Check client-side memory cache (0ms instant response)
  if (clientMemoryCache.has(cacheKey)) {
    return clientMemoryCache.get(cacheKey)!;
  }

  const res = await fetch("/api/download", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instrument,
      fromDate,
      toDate,
      priceType,
    }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error || "Failed to download market data from Dukascopy.");
  }

  const result = data as DownloadResponse;
  clientMemoryCache.set(cacheKey, result);
  return result;
}
