# AuraEngine

AuraEngine is a trading replay, backtesting, and journaling workspace built for discretionary review workflows.
It combines session creation, multi-timeframe replay, chart annotations, trade management, analytics, and a visual journal in a single app.

## Highlights

- Historical replay with incremental data loading and viewport backfill
- Multi-timeframe split charts with synchronized crosshairs
- Session-scoped drawing tools and trade overlays
- Trade journaling with image capture and tagging
- Analytics, checklists, and strategy review flows
- Local caching for market data and news lookups

## Tech Stack

- React 19 + TypeScript
- Zustand for application state
- Lightweight Charts for chart rendering
- Express + Vite dev server for API and frontend integration
- IndexedDB caching for historical data chunks

## Getting Started

### Prerequisites

- Node.js 22 or newer
- npm 10 or newer

### Install

```bash
npm install
```

### Run in development

```bash
npm run dev
```

The app starts on [http://localhost:3000](http://localhost:3000).

### Quality checks

```bash
npm run lint
npm test
npm run build
```

## Project Structure

- [server.ts](./server.ts): Express server, historical-data API, and news API
- [src/components](./src/components): UI views and interactive surfaces
- [src/hooks](./src/hooks): session loading and derived chart-data hooks
- [src/lib](./src/lib): replay engine, chart helpers, and drawing logic
- [src/services](./src/services): client-side market-data and news fetchers
- [src/store](./src/store): Zustand store and session state management
- [tests](./tests): regression tests for replay, drawing, and data logic

## Notes

- Historical data is fetched from Dukascopy through the local server.
- News data is cached locally after the first fetch.
- Session market data is intentionally not persisted in Zustand storage to keep browser storage usage reasonable.
