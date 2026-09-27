/**
 * Session data loader - Dukascopy version
 * 
 * Simplified approach: fetch 1m data from Dukascopy, aggregate to target timeframe on client
 * No complex chunking or edge-loading - Dukascopy provides fast binary downloads
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSimulatorStore, Session, Candle } from '../store/useSimulatorStore';
import { useShallow } from 'zustand/react/shallow';
import { fetchInstruments, downloadMarketData, downloadMarketDataWithMeta } from '../services/marketdata';
import {
  aggregateCandles,
  expandSubMinuteCandlesFromM1,
  findIndexForTimestamp,
  auraTimeframeToDukascopy,
  getMaxRangeDaysForTimeframe,
  TimeframeId,
} from '../lib/timeframe';
import { describeCoverageProblem } from '../lib/dukascopyRequest';
import { dayBoundaryMs, type ChartTimezone } from '../lib/timezone';

interface LoadingState {
  isLoading: boolean;
  progress: number;
  error: string | null;
  userMessage: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolves a session date field to a millisecond boundary in the chart's timezone.
 *
 * Deliberately more tolerant than `toDateBoundary` in the engine, which throws
 * on an unparseable date. The session's dates are optional here (older or
 * hand-edited persisted state may omit them), so a missing value falls back to a
 * sensible recent window rather than failing the load.
 *
 * That tolerance is why this is not simply the engine's function: it has a
 * genuinely different contract.
 */
function toDateBoundary(dateText: string | undefined, endOfDay: boolean, timeZone: ChartTimezone): number {
  const fallback = (): number => {
    const now = Date.now();
    return endOfDay ? now - DAY_MS : now - 30 * DAY_MS;
  };
  if (!dateText) return fallback();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    const ts = new Date(dateText).getTime();
    return Number.isFinite(ts) ? ts : fallback();
  }
  // A bare YYYY-MM-DD is a calendar day, and which instant it starts at depends
  // on the zone it is judged in. The chart already has a configurable timezone
  // (defaulting to the browser's), so a session day is resolved in the same zone
  // the candles are drawn in rather than at UTC midnight — otherwise a user in
  // New York asking for "the 27th" silently gets four hours of the 26th.
  try {
    return dayBoundaryMs(dateText, timeZone, endOfDay);
  } catch {
    return fallback();
  }
}

function timestampSecToDate(timestampSec: number): string {
  return new Date(timestampSec * 1000).toISOString().split('T')[0];
}

/** Shifts a `YYYY-MM-DD` day string by whole days, in UTC. */
function shiftDateString(dateText: string, deltaDays: number): string {
  const ts = Date.parse(`${dateText}T00:00:00Z`);
  if (!Number.isFinite(ts)) return dateText;
  return new Date(ts + deltaDays * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Drops candles outside the exact local window.
 *
 * The download API can only be asked for whole UTC days, so a local-day window is
 * always served by a slightly wider request. Without this the chart would show
 * part of the previous day and part of the next one — for a New York user that is
 * four hours of the 26th before their session and four hours of the day after it.
 */
function clipToWindow(candles: Candle[], fromTs: number, toTs: number): Candle[] {
  if (candles.length === 0) return candles;
  // A no-op window means the caller is not using local boundaries; leave the data
  // alone rather than emptying it.
  if (!(fromTs < toTs)) return candles;
  return candles.filter((c) => c.timestamp >= fromTs && c.timestamp < toTs);
}

export function useSessionLoader() {
  const {
    currentSessionId,
    currentSession,
    setData,
    patchDataState,
    useSyntheticSeconds,
    chartTimezone,
  } = useSimulatorStore(useShallow((state) => ({
    currentSessionId: state.currentSessionId,
    currentSession: state.sessions.find((s) => s.id === state.currentSessionId) || null,
    setData: state.setData,
    patchDataState: state.patchDataState,
    useSyntheticSeconds: state.useSyntheticSeconds,
    // A session's calendar days are resolved in the same timezone the chart draws
    // in, so the loaded window matches the dates the user actually picked.
    // Deliberately part of the load effect's inputs: changing the chart timezone
    // changes what a session's dates mean, so the data has to be re-fetched.
    chartTimezone: state.chartTimezone,
  })));

  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    progress: 0,
    error: null,
    userMessage: null,
  });

  const activeLoadRef = useRef<{ id: string; abort: AbortController } | null>(null);
  const inFlightKeyRef = useRef<string | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const currentSessionRef = useRef(currentSession);

  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  const cancelLoad = useCallback(() => {
    activeLoadRef.current?.abort.abort();
    activeLoadRef.current = null;
    inFlightKeyRef.current = null;

    const session = currentSessionRef.current;
    if (session) {
      patchDataState({
        isLoading: false,
        progress: 0,
        userMessage: null,
      }, session.id);
    }
  }, [patchDataState]);
  const loadSessionData = useCallback(async (session: Session) => {
    const targetTf: TimeframeId = auraTimeframeToDukascopy(session.timeframe);
    const isSubMinuteSession =
      session.timeframe === 'tick' || targetTf === '5s' || targetTf === '15s' || targetTf === '30s';
    const useRealSeconds = isSubMinuteSession && !useSyntheticSeconds;
    const requestedTf = session.timeframe === 'tick' ? 's1' : session.timeframe;

    const currentKey = `${session.id}:${session.instrument}:${session.timeframe}:${session.timeframeVersion ?? 0}:${session.startDate}:${session.endDate}:${session.targetTimestamp ?? ''}:${useSyntheticSeconds}`;
    const loadId = `${session.id}:${session.instrument}:${session.timeframe}:${Date.now()}`;

    if (activeLoadRef.current) {
      activeLoadRef.current.abort.abort();
    }

    const abort = new AbortController();
    activeLoadRef.current = { id: loadId, abort };
    inFlightKeyRef.current = currentKey;

    let sessionStart = toDateBoundary(session.startDate, false, chartTimezone);
    let sessionEnd = toDateBoundary(session.endDate, true, chartTimezone);

    if (session.targetTimestamp) {
      if (session.targetTimestamp < sessionStart) {
        sessionStart = session.targetTimestamp;
      }
      if (session.targetTimestamp > sessionEnd) {
        sessionEnd = session.targetTimestamp + DAY_MS;
      }
    }

    const fullRangeStart = sessionStart - 5 * DAY_MS;
    const fullRangeEnd = sessionEnd;

    const loadKind = session.targetTimestamp ? 'switch' : 'initial';

    // Sub-minute real data is tick-backed and large — clamp to the allowed cap.
    const maxRangeDays = getMaxRangeDaysForTimeframe(requestedTf);
    const actualFromTs = Number.isFinite(maxRangeDays)
      ? Math.max(fullRangeStart, fullRangeEnd - maxRangeDays * DAY_MS)
      : fullRangeStart;

    // Sub-minute sessions are silently narrowed to the cap. The chart still
    // renders, so without this the user has no way to tell that a 30-day Tick
    // session only contains 3 days of data.
    const clamped = actualFromTs > fullRangeStart;
    // Report the session's own length, not the padded request window
    // (which adds 5 days of warm-up before the start and 1 day after the end).
    const sessionSpanDays = Math.max(
      1,
      Math.round(
        (toDateBoundary(session.endDate, true, chartTimezone) -
          toDateBoundary(session.startDate, false, chartTimezone)) / DAY_MS,
      ),
    );
    const loadedSpanDays = Math.max(1, Math.round((fullRangeEnd - actualFromTs) / DAY_MS));

    patchDataState({
      absoluteFromTs: actualFromTs,
      absoluteToTs: fullRangeEnd,
      requestedFromTs: actualFromTs,
      requestedToTs: fullRangeEnd,
      isLoading: true,
      isHydrating: false,
      isViewportLoading: false,
      progress: 10,
      error: null,
      dataWarning: null,
      userMessage: `Fetching data from Dukascopy...`,
      activeLoadKind: loadKind,
    }, session.id);

    setLoadingState({
      isLoading: true,
      progress: 10,
      error: null,
      userMessage: `Fetching data from Dukascopy...`,
    });

    try {
      // The download API takes UTC *days*, but the session window is a span of
      // local calendar days. The request therefore has to be rounded outward to
      // whole UTC days that fully contain the local window, and the result
      // clipped back to the exact local boundaries afterwards.
      //
      // Rounding the end outward by one day is what makes this correct: local
      // midnight sits at most 14h from UTC midnight, so `toDate` derived from the
      // local end instant would otherwise cut the request up to 14h short of the
      // end of the user's last day. The extra day is removed by the clip below,
      // so nothing outside the session reaches the chart.
      const fromDate = timestampSecToDate(actualFromTs / 1000);
      const toDate = shiftDateString(timestampSecToDate(fullRangeEnd / 1000), 1);
      // Clip bounds: the warm-up start (a local boundary) through the exclusive
      // local session end. Deliberately keeps the warm-up, which exists for
      // indicator lookback and is not shown as session data.
      const clipFromTs = actualFromTs;
      const clipToTs = fullRangeEnd;

      let candlesForSession: Candle[] = [];
      let loadedSourceTf = '1m';
      let loadMessage = '';
      let partialWarning: string | null = null;

      if (useRealSeconds) {
        setLoadingState({ isLoading: true, progress: 20, error: null, userMessage: `Fetching ${requestedTf} tick data from Dukascopy...` });
        patchDataState({ progress: 20, userMessage: `Fetching ${requestedTf} tick data from Dukascopy...` }, session.id);

        const { candles: realCandles, meta } = await downloadMarketDataWithMeta(
          session.instrument,
          fromDate,
          toDate,
          'bid',
          requestedTf,
          { signal: abort.signal },
        );

        if (abort.signal.aborted || activeLoadRef.current?.id !== loadId) return;

        candlesForSession = realCandles;
        loadedSourceTf = requestedTf;
        loadMessage = meta.cached ? 'Loaded from cache' : `Loaded ${realCandles.length} ${requestedTf} candles`;
        partialWarning = describeCoverageProblem(meta);
      } else if (isSubMinuteSession && useSyntheticSeconds) {
        setLoadingState({ isLoading: true, progress: 20, error: null, userMessage: 'Fetching 1m base data for synthetic sub-minute...' });
        patchDataState({ progress: 20, userMessage: 'Fetching 1m base data for synthetic sub-minute...' }, session.id);

        const { candles: m1Candles, meta } = await downloadMarketDataWithMeta(
          session.instrument,
          fromDate,
          toDate,
          'bid',
          'm1',
          { signal: abort.signal },
        );

        if (abort.signal.aborted || activeLoadRef.current?.id !== loadId) return;

        setLoadingState({ isLoading: true, progress: 60, error: null, userMessage: 'Interpolating synthetic sub-minute candles...' });
        patchDataState({ progress: 60, userMessage: 'Interpolating synthetic sub-minute candles...' }, session.id);

        candlesForSession = expandSubMinuteCandlesFromM1(m1Candles, targetTf);
        loadedSourceTf = 'm1';
        loadMessage = meta.cached ? 'Loaded from cache' : `Synthesized ${candlesForSession.length} ${targetTf} candles from 1m`;
        partialWarning = describeCoverageProblem(meta);
      } else {
        setLoadingState({ isLoading: true, progress: 20, error: null, userMessage: `Fetching ${session.timeframe} data from Dukascopy...` });
        patchDataState({ progress: 20, userMessage: `Fetching ${session.timeframe} data from Dukascopy...` }, session.id);

        const { candles: downloadedCandles, meta } = await downloadMarketDataWithMeta(
          session.instrument,
          fromDate,
          toDate,
          'bid',
          requestedTf,
          { signal: abort.signal },
        );

        if (abort.signal.aborted || activeLoadRef.current?.id !== loadId) return;

        candlesForSession = downloadedCandles;
        loadedSourceTf = session.timeframe;
        loadMessage = meta.cached ? 'Loaded from cache' : `Loaded ${downloadedCandles.length} ${session.timeframe} candles`;
        partialWarning = describeCoverageProblem(meta);
      }

      // Trim the rounded-out request back to the exact local window before it
      // reaches the store. Done here rather than per-branch so every path — real
      // tick, synthesized sub-minute, derived and native timeframes — is clipped
      // identically, and so a path added later cannot forget.
      const clipped = clipToWindow(candlesForSession, clipFromTs, clipToTs);
      if (clipped.length !== candlesForSession.length) {
        loadMessage = `${loadMessage} (${candlesForSession.length - clipped.length} outside session hours)`;
      }
      setData(clipped, session.id);

      // Both of these describe usable-but-not-what-you-asked-for data, so they
      // are reported as a warning rather than an error: the chart is populated
      // and the user can decide whether to narrow the session.
      const warnings: string[] = [];
      if (clamped) {
        warnings.push(
          `${session.timeframe} data is capped at ${maxRangeDays} day${maxRangeDays === 1 ? '' : 's'} per request, ` +
          `so only the most recent ${loadedSpanDays} day${loadedSpanDays === 1 ? '' : 's'} of this ` +
          `${sessionSpanDays}-day session were loaded. Shorten the session to match.`,
        );
      }
      if (partialWarning) warnings.push(partialWarning);

      patchDataState({
        isLoading: false,
        isHydrating: false,
        isViewportLoading: false,
        progress: 100,
        error: clipped.length === 0 ? 'No market data available for this period' : null,
        userMessage: loadMessage,
        dataWarning: warnings.length > 0 ? warnings.join(' ') : null,
        activeLoadKind: null,
        loadedFromTs: clipped[0]?.timestamp,
        loadedToTs: clipped[clipped.length - 1]?.timestamp,
        coveredFromTs: clipped[0]?.timestamp,
        coveredToTs: clipped[clipped.length - 1]?.timestamp,
        sourceTimeframe: loadedSourceTf,
      }, session.id);

      setLoadingState({ isLoading: false, progress: 100, error: null, userMessage: null });
      loadedKeyRef.current = currentKey;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (activeLoadRef.current?.id !== loadId) return;

      console.error('Session load error:', error);
      const message = error instanceof Error ? error.message : 'Failed to load data';
      
      patchDataState({
        isLoading: false,
        isHydrating: false,
        progress: 0,
        error: message,
        userMessage: null,
        dataWarning: null,
        activeLoadKind: null,
      }, session.id);

      setLoadingState({ isLoading: false, progress: 0, error: message, userMessage: null });
      loadedKeyRef.current = currentKey;
    } finally {
      if (activeLoadRef.current?.id === loadId) {
        activeLoadRef.current = null;
        inFlightKeyRef.current = null;
      }
    }
  }, [patchDataState, setData, useSyntheticSeconds]);

  const retry = useCallback(() => {
    if (currentSession) {
      loadedKeyRef.current = null;
      inFlightKeyRef.current = null;
      loadSessionData(currentSession);
    }
  }, [currentSession, loadSessionData]);

  useEffect(() => {
    if (!currentSession) return;

    // A session loaded under a different chart timezone spans different instants,
    // so its candles must be replaced rather than reused.
    const loadedKeyTimezone = loadedKeyRef.current?.split(':').slice(-1)[0];
    const timezoneChanged =
      currentSession.data.length > 0 && loadedKeyTimezone !== undefined && loadedKeyTimezone !== chartTimezone;

    // The timezone is part of the request identity: a session's calendar days are
    // resolved in the chart's timezone, so changing it changes which instants the
    // same startDate/endDate denote. Leaving it out meant a timezone change left
    // the previously-loaded (now wrong) window in place.
    const currentKey = `${currentSession.id}:${currentSession.instrument}:${currentSession.timeframe}:${currentSession.timeframeVersion ?? 0}:${currentSession.startDate}:${currentSession.endDate}:${currentSession.targetTimestamp ?? ''}:${useSyntheticSeconds}:${chartTimezone}`;

    // If this exact request is currently in-flight, don't start a duplicate
    if (inFlightKeyRef.current === currentKey) {
      return;
    }

    const switchPending = currentSession.dataState?.activeLoadKind === 'switch';
    const jumpOutside = currentSession.targetTimestamp !== undefined &&
      currentSession.data.length > 0 &&
      (currentSession.targetTimestamp < currentSession.data[0]?.timestamp ||
       currentSession.targetTimestamp > currentSession.data[currentSession.data.length - 1]?.timestamp);

    const needsLoad = currentSession.data.length === 0 || switchPending || jumpOutside || timezoneChanged;

    if (!needsLoad) return;

    // Skip if we already attempted to load this exact configuration and failed
    if (loadedKeyRef.current === currentKey && currentSession.dataState?.error) {
      return;
    }

    if (timezoneChanged) {
      // The loaded candles span the wrong instants, so they are replaced rather
      // than merged. The stored data is the old window; leaving it would show
      // hours that belong to the neighbouring days.
      loadedKeyRef.current = currentKey;
    }

    void loadSessionData(currentSession);
  }, [
    currentSession?.id,
    currentSession?.instrument,
    currentSession?.timeframe,
    currentSession?.timeframeVersion,
    currentSession?.targetTimestamp,
    currentSession?.startDate,
    currentSession?.endDate,
    currentSession?.data?.length,
    currentSession?.dataState?.activeLoadKind,
    currentSession?.dataState?.error,
    useSyntheticSeconds,
    chartTimezone,
    loadSessionData,
  ]);

  return {
    ...loadingState,
    cancelLoad,
    retry,
    isInteractive: !loadingState.isLoading || (currentSession?.data.length ?? 0) > 0,
  };
}