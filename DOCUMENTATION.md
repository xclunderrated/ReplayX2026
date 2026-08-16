# Dukascopy Chart Replay — Architecture & Technical Documentation

## 1. Executive Summary & Core Purpose
**Dukascopy Chart Replay** is a full-stack web application designed for high-speed financial market backtesting, bar-by-bar chart replay, and multi-timeframe price action analysis. 

Built as a high-performance alternative to commercial backtesting tools (like FX Replay or TradingView Bar Replay), it streams official tick-level historical data directly from **Swiss Dukascopy Bank** servers, eliminates subscription costs, and provides zero-latency multi-tier caching with sub-second candle playback.

---

## 2. High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BROWSER (REACT SPA)                           │
│  ┌───────────────────────┐   ┌───────────────────────────────────────┐  │
│  │  Header / Instrument  │   │     TradingView Lightweight Charts    │  │
│  │   & Date Selector     │   │      (Canvas-based 60fps Replay)     │  │
│  └───────────┬───────────┘   └───────────────────▲───────────────────┘  │
│              │                                   │                      │
│              ▼                                   │ (Aggregated Candles) │
│  ┌────────────────────────┐         ┌────────────┴───────────────────┐  │
│  │  Client Memory Cache   │ ──(Hit)─►  Frontend Multi-Timeframe      │  │
│  │   (0ms Map Cache)      │         │   Synthetic Candle Engine      │  │
│  └───────────┬────────────┘         └────────────▲───────────────────┘  │
└──────────────┼───────────────────────────────────┼──────────────────────┘
               │ (Miss)                            │ (Raw 1m OHLC JSON)
               ▼                                   │
┌──────────────────────────────────────────────────┴──────────────────────┐
│                        EXPRESS BACKEND (NODE.JS)                        │
│  ┌────────────────────────┐                                             │
│  │   Server Memory Cache  │ ──(Hit: <1ms)──────────────────┐           │
│  │   (Map<Key, JSON>)     │                                  │           │
│  └───────────┬────────────┘                                  │           │
│              │ (Miss)                                        ▼           │
│              ▼                                     ┌──────────────────┐  │
│  ┌────────────────────────┐                        │   /api/download  │  │
│  │    Disk JSON Cache     │ ──(Hit: <5ms)─────────►│     Response     │  │
│  │ (processed_*.json)     │                        └──────────────────┘  │
│  └───────────┬────────────┘                                              │
│              │ (Miss)                                                    │
│              ▼                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  dukascopy-node Engine (batchSize: 30, pauseBetweenBatchesMs: 0)  │    │
│  │  Reads/Writes Binary Archive Files in .dukascopy-cache/          │    │
│  └───────────────────────────────────┬──────────────────────────────┘    │
└──────────────────────────────────────┼───────────────────────────────────┘
                                       │ (HTTP Binary Download)
                                       ▼
                     ┌───────────────────────────────────┐
                     │   Dukascopy Swiss Servers (.bi5)  │
                     └───────────────────────────────────┘
```

---

## 3. Directory & Code Structure

```
├── server.ts                 # Express backend server with Dukascopy node integration & 2-tier server cache
├── src/
│   ├── main.tsx              # React entry point
│   ├── App.tsx               # Main state coordinator, hotkey manager & auto-prefetch logic
│   ├── types.ts              # TypeScript interfaces (Candle, DownloadResponse, InstrumentMeta, etc.)
│   ├── services/
│   │   └── api.ts            # Client API caller with client-side 0ms memory cache
│   ├── utils/
│   │   └── timeframe.ts      # Multi-timeframe synthetic candle aggregator (5s -> 1W)
│   └── components/
│       ├── Header.tsx        # Top navigation bar (Instrument dropdown, dates, timeframe selector)
│       ├── ControlBar.tsx    # Replay controls (Play/Pause, Step Next/Prev, Speed Slider, Scrubber)
│       ├── ChartCanvas.tsx   # TradingView Lightweight Charts canvas wrapper
│       └── HotkeysModal.tsx  # Keyboard shortcuts cheatsheet modal
├── .dukascopy-cache/         # Local directory storing raw Dukascopy binary .bi5 files & processed JSONs
├── DOCUMENTATION.md          # Comprehensive technical and user documentation
└── package.json              # Dependencies and build scripts
```

---

## 4. Detailed Data Pipeline & Multi-Tier Caching Flow

To maximize performance, the application implements **3 progressive cache levels**:

### Level 1: Client Memory Cache (`src/services/api.ts`)
- **Location**: In-memory JavaScript `Map<string, DownloadResponse>` on the frontend browser tab.
- **Cache Key**: `${instrument}_${fromDate}_${toDate}_${priceType}`
- **Latency**: **0 ms**.
- **Behavior**: When a user switches back and forth between instruments or dates within the same session, data renders immediately without contacting the backend.

### Level 2: Server Memory Cache (`server.ts`)
- **Location**: In-memory Node.js `Map<string, DownloadResponse>` on the Express server process.
- **Latency**: **< 1 ms**.
- **Behavior**: If the client cache misses, Express checks its RAM map. Returns instant JSON payloads without file I/O.

### Level 3: Server Disk Cache (`.dukascopy-cache/`)
- **Location**: Local filesystem folder `.dukascopy-cache/`.
- **Latency**: **< 5 ms**.
- **Behavior**: Saves processed OHLC JSON files (`processed_${cacheKey}.json`) as well as `dukascopy-node` binary files (`.bi5`). On server reboots or fresh requests, files are read instantly from disk.

---

## 5. Multi-Timeframe Resampling Logic (`src/utils/timeframe.ts`)

Instead of making separate API calls for every timeframe, the platform downloads high-density 1-minute OHLC data from Dukascopy and synthesizes any requested timeframe on the fly:

1. **Sub-Minute Timeframes (`5s`, `15s`, `30s`)**:
   - Synthesizes 4 sub-candles (Open, High, Low, Close) for each 1-minute candle by interpolating price movement across the 60-second period.
2. **Minute & Hour Timeframes (`1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, `1W`)**:
   - Groups 1-minute candles by bucket intervals (e.g. 5 candles for `5m`, 240 candles for `4h`).
   - Computes:
     - **Open**: Open price of the first candle in bucket.
     - **High**: Maximum high price across all candles in bucket.
     - **Low**: Minimum low price across all candles in bucket.
     - **Close**: Close price of the last candle in bucket.
     - **Volume**: Sum of volume across all candles in bucket.

---

## 6. Supported Assets & Categories (60+ Total Instruments)

| Category | Count | Example Symbols |
| :--- | :--- | :--- |
| **Forex Majors** | 7 | `EUR/USD`, `GBP/USD`, `USD/JPY`, `AUD/USD`, `USD/CAD`, `USD/CHF`, `NZD/USD` |
| **Forex Crosses** | 21 | `EUR/GBP`, `EUR/JPY`, `GBP/JPY`, `AUD/JPY`, `EUR/AUD`, `GBP/CAD`, `CAD/JPY`, etc. |
| **Forex Exotics** | 12 | `USD/SGD`, `USD/HKD`, `USD/SEK`, `USD/NOK`, `USD/ZAR`, `USD/TRY`, `USD/MXN`, etc. |
| **Commodities & Metals** | 10 | `XAU/USD` (Gold), `XAG/USD` (Silver), `BRENT`, `WTI`, `NGAS`, `COPPER`, `XPT/USD`, etc. |
| **Cryptocurrencies** | 11 | `BTC/USD`, `ETH/USD`, `SOL/USD`, `XRP/USD`, `LTC/USD`, `ADA/USD`, `DOGE/USD`, etc. |
| **Stock Indices** | 11 | `US500` (S&P500), `NAS100` (Nasdaq), `US30` (Dow), `GER40` (DAX), `UK100`, `JPN225`, etc. |
| **Global Equities / Stocks** | 7 | `AAPL`, `MSFT`, `NVDA`, `AMZN`, `GOOGL`, `TSLA`, `META` |

---

## 7. Replay Mechanics & Interaction Engine

- **Automated Playback**: Managed via a `useRef` animation timer in `App.tsx` running at `1000 / replaySpeed` intervals.
- **Speed Control**: Variable playback speed from `0.5x` (one bar every 2 seconds) up to `50x` (50 bars per second).
- **1-Click Chart Seeking**: Users can click directly on any candle on the canvas or scrub the bottom slider to instantly jump to that historical moment.
- **Keyboard Shortcuts**:
  - `Space`: Play / Pause toggle
  - `Right Arrow (→)`: Advance 1 candle
  - `Left Arrow (←)`: Step back 1 candle
  - `Home` / `End`: Jump to start / end
  - `1` to `0`, `W`: Instantly switch timeframes (`5s`, `15s`, `30s`, `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, `1W`)

---

## 8. Backend API Endpoints

### `GET /api/instruments`
Returns the full JSON list of 60+ supported instruments categorized by category, symbol, name, pip size, and decimal places.

### `POST /api/download`
**Payload**:
```json
{
  "instrument": "eurusd",
  "fromDate": "2024-01-01",
  "toDate": "2024-01-07",
  "priceType": "bid"
}
```
**Response**:
```json
{
  "instrument": { "id": "eurusd", "symbol": "EUR/USD", ... },
  "timeframe": "m1",
  "count": 7200,
  "startTime": "2024-01-01T00:00:00.000Z",
  "endTime": "2024-01-07T00:00:00.000Z",
  "candles": [
    { "time": 1704067200, "open": 1.1045, "high": 1.1048, "low": 1.1042, "close": 1.1046, "volume": 320 }
  ],
  "cached": true,
  "latencyMs": 2
}
```
