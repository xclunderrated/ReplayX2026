/**
 * PlaybackController - bypasses React for the hot tick path.
 *
 * During playback the rAF loop calls `advanceAndRender()` which:
 *   1. Runs advanceSessionPlayback (pure function - no state).
 *   2. Pushes the new candle directly to the lightweight-charts series via
 *      a registered callback (set by TradingViewChart on mount).
 *   3. Mutates the session in-place inside the Zustand store's `sessions`
 *      array **without** calling `set()` - so no React re-render is triggered.
 *   4. Periodically (every ~500ms) calls `set()` once to sync React state
 *      for UI elements (balance display, trade markers, etc.).
 *
 * This means during 50x playback, the chart updates 50 candles/sec but
 * React only re-renders ~2 times/sec.
 */

import { advanceSessionPlayback } from './simulatorEngine';
import { captureTradeMultiTimeframeScreenshots } from '../services/autoScreenshotService';

type RenderCandle = (
  candle: {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  },
  candleIndex?: number,
) => void;

type ScheduleOverlay = () => void;

interface PlaybackRegistration {
  renderCandle: RenderCandle;
  scheduleOverlay: ScheduleOverlay;
}

let registration: PlaybackRegistration | null = null;
let lastReactSyncTime = 0;
const REACT_SYNC_INTERVAL_MS = 500;

export function registerChartForPlayback(reg: PlaybackRegistration) {
  registration = reg;
}

export function unregisterChartForPlayback() {
  registration = null;
}

/**
 * Called from the rAF loop. Returns true if the session advanced.
 * Mutates the session in-place and pushes the candle to the chart directly.
 * Only triggers a React sync every REACT_SYNC_INTERVAL_MS.
 */
export function advanceAndRender(
  sessions: any[],
  sessionIndex: number,
  zustandSet: (state: any) => void,
  now: number,
): { advanced: boolean; reachedEnd: boolean; mayHaveMore: boolean } {
  const session = sessions[sessionIndex];
  if (!session) return { advanced: false, reachedEnd: false, mayHaveMore: false };

  const prevTrades = session.trades;
  const prevBalance = session.balance;
  const result = advanceSessionPlayback(session);

  if (!result.advanced) {
    return {
      advanced: false,
      reachedEnd: result.reachedDataEnd ?? false,
      mayHaveMore: result.mayHaveMoreData ?? false,
    };
  }

  // Mutate the sessions array in-place - NO Zustand set(), NO React re-render for plain ticks
  sessions[sessionIndex] = result.session;

  // Push the new candle directly to the chart series
  if (registration) {
    const newCandle = result.session.data[result.session.currentIndex];
    if (newCandle) {
      registration.renderCandle(newCandle, result.session.currentIndex);
    }
    registration.scheduleOverlay();
  }

  // Check if any trade status changed (e.g. SL/TP hit, pending filled, scale-out executed) or balance changed
  const tradesChanged = result.session.trades !== prevTrades || result.session.balance !== prevBalance;

  // Auto-capture multi-timeframe screenshots if any trade just closed during playback
  if (tradesChanged && prevTrades) {
    const newlyClosed = result.session.trades.filter(
      (t: any) => t.status === 'closed' && prevTrades.some((p: any) => p.id === t.id && p.status !== 'closed')
    );
    if (newlyClosed.length > 0) {
      setTimeout(() => {
        for (const ct of newlyClosed) {
          captureTradeMultiTimeframeScreenshots(ct, result.session);
        }
      }, 10);
    }
  }

  // Periodically sync React state for UI, or IMMEDIATELY when trades/orders change so execution is instantaneous
  if (tradesChanged || now - lastReactSyncTime >= REACT_SYNC_INTERVAL_MS) {
    lastReactSyncTime = now;
    // Trigger a shallow Zustand update - this creates new array references
    // so React components re-render immediately
    zustandSet({ sessions: [...sessions] });
  }

  return { advanced: true, reachedEnd: false, mayHaveMore: false };
}

export function forceReactSync(sessions: any[], zustandSet: (state: any) => void) {
  lastReactSyncTime = performance.now();
  zustandSet({ sessions: [...sessions] });
}

export function resetSyncTimer() {
  lastReactSyncTime = 0;
}
