# Timezone + Economic News Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Add user-selectable chart timezone support and Forex Factory news integration with day/week views and chart markers.

**Architecture:** Keep raw candle/news timestamps as absolute UTC-backed values in app state and convert only the chart-facing timestamps to the selected timezone, following Lightweight Charts guidance that timezone support must be handled by the application. Load and normalize the Forex Factory CSV on the server, expose a filtered `/api/news` endpoint, and render both a floating news panel and news markers from the current replay context.

**Tech Stack:** React 19, Zustand, Lightweight Charts 5.1, Express, TypeScript, date-fns.

---

### Task 1: Server news endpoint
- Modify `server.ts`
- Add CSV loader, row normalization, instrument→currency filtering, and `/api/news`

### Task 2: Shared timezone/news utilities
- Create `src/lib/timezone.ts`
- Create `src/lib/news.ts`
- Add timestamp conversion helpers and week/day range helpers

### Task 3: Client news service + store fields
- Modify `src/store/useSimulatorStore.ts`
- Create `src/services/newsService.ts`
- Add chart timezone + news view preferences

### Task 4: Chart integration
- Modify `src/components/TradingViewChart.tsx`
- Apply timezone-adjusted chart data and marker times
- Render week/day news panel and news markers

### Task 5: Settings/UI wiring
- Modify `src/components/SettingsModal.tsx`
- Modify `src/components/SessionView.tsx`
- Add timezone and news view controls

### Task 6: Verification
- Run `npm run lint`
- Run `npm test`
- Fix any type/test issues
