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

interface LoadingState {
  isLoading: boolean;
  progress: number;
  error: string | null;
  userMessage: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toDateBoundary(dateText?: string, endOfDay = false): number {
  if (!dateText) {
    const now = Date.now();
    return endOfDay ? now - DAY_MS : now - 30 * DAY_MS;
  }
  const date = new Date(dateText);
  const ts = date.getTime();
  if (!Number.isFinite(ts)) {
    const now = Date.now();
    return endOfDay ? now - DAY_MS : now - 30 * DAY_MS;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(dateText) && endOfDay ? ts + DAY_MS : ts;
}

function timestampSecToDate(timestampSec: number): string {
  return new Date(timestampSec * 1000).toISOString().split('T')[0];
}

export function useSessionLoader() {
  const {
    currentSessionId,
    currentSession,
    setData,
    patchDataState,
    useSyntheticSeconds,
  } = useSimulatorStore(useShallow((state) => ({
    currentSessionId: state.currentSessionId,
    currentSession: state.sessions.find((s) => s.id === state.currentSessionId) || null,
    setData: state.setData,
    patchDataState: state.patchDataState,
    useSyntheticSeconds: state.useSyntheticSeconds,
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

    let sessionStart = toDateBoundary(session.startDate);
    let sessionEnd = toDateBoundary(session.endDate, true);

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
      const fromDate = timestampSecToDate(actualFromTs / 1000);
      const toDate = timestampSecToDate(fullRangeEnd / 1000);

      let candlesForSession: Candle[] = [];
      let loadedSourceTf = '1m';
      let loadMessage = '';

      if (useRealSeconds) {
        setLoadingState({ isLoading: true, progress: 20, error: null, userMessage: `Fetching ${requestedTf} tick data from Dukascopy...` });
        patchDataState({ progress: 20, userMessage: `Fetching ${requestedTf} tick data from Dukascopy...` }, session.id);

        const { candles: realCandles, meta } = await downloadMarketDataWithMeta(
          session.instrument,
          fromDate,
          toDate,
          'bid',
          requestedTf
        );

        if (abort.signal.aborted || activeLoadRef.current?.id !== loadId) return;

        candlesForSession = realCandles;
        loadedSourceTf = requestedTf;
        loadMessage = meta.cached ? 'Loaded from cache' : `Loaded ${realCandles.length} ${requestedTf} candles`;
      } else if (isSubMinuteSession && useSyntheticSeconds) {
        setLoadingState({ isLoading: true, progress: 20, error: null, userMessage: 'Fetching 1m base data for synthetic sub-minute...' });
        patchDataState({ progress: 20, userMessage: 'Fetching 1m base data for synthetic sub-minute...' }, session.id);

        const { candles: m1Candles, meta } = await downloadMarketDataWithMeta(
          session.instrument,
          fromDate,
          toDate,
          'bid',
          'm1'
        );

        if (abort.signal.aborted || activeLoadRef.current?.id !== loadId) return;

        setLoadingState({ isLoading: true, progress: 60, error: null, userMessage: 'Interpolating synthetic sub-minute candles...' });
        patchDataState({ progress: 60, userMessage: 'Interpolating synthetic sub-minute candles...' }, session.id);

        candlesForSession = expandSubMinuteCandlesFromM1(m1Candles, targetTf);
        loadedSourceTf = 'm1';
        loadMessage = meta.cached ? 'Loaded from cache' : `Synthesized ${candlesForSession.length} ${targetTf} candles from 1m`;
      } else {
        setLoadingState({ isLoading: true, progress: 20, error: null, userMessage: `Fetching ${session.timeframe} data from Dukascopy...` });
        patchDataState({ progress: 20, userMessage: `Fetching ${session.timeframe} data from Dukascopy...` }, session.id);

        const { candles: downloadedCandles, meta } = await downloadMarketDataWithMeta(
          session.instrument,
          fromDate,
          toDate,
          'bid',
          requestedTf
        );

        if (abort.signal.aborted || activeLoadRef.current?.id !== loadId) return;

        candlesForSession = downloadedCandles;
        loadedSourceTf = session.timeframe;
        loadMessage = meta.cached ? 'Loaded from cache' : `Loaded ${downloadedCandles.length} ${session.timeframe} candles`;
      }

      setData(candlesForSession, session.id);

      patchDataState({
        isLoading: false,
        isHydrating: false,
        isViewportLoading: false,
        progress: 100,
        error: candlesForSession.length === 0 ? 'No market data available for this period' : null,
        userMessage: loadMessage,
        activeLoadKind: null,
        loadedFromTs: candlesForSession[0]?.timestamp,
        loadedToTs: candlesForSession[candlesForSession.length - 1]?.timestamp,
        coveredFromTs: candlesForSession[0]?.timestamp,
        coveredToTs: candlesForSession[candlesForSession.length - 1]?.timestamp,
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

    const currentKey = `${currentSession.id}:${currentSession.instrument}:${currentSession.timeframe}:${currentSession.timeframeVersion ?? 0}:${currentSession.startDate}:${currentSession.endDate}:${currentSession.targetTimestamp ?? ''}:${useSyntheticSeconds}`;

    // If this exact request is currently in-flight, don't start a duplicate
    if (inFlightKeyRef.current === currentKey) {
      return;
    }

    const switchPending = currentSession.dataState?.activeLoadKind === 'switch';
    const jumpOutside = currentSession.targetTimestamp !== undefined &&
      currentSession.data.length > 0 &&
      (currentSession.targetTimestamp < currentSession.data[0]?.timestamp ||
       currentSession.targetTimestamp > currentSession.data[currentSession.data.length - 1]?.timestamp);

    const needsLoad = currentSession.data.length === 0 || switchPending || jumpOutside;

    if (!needsLoad) return;

    // Skip if we already attempted to load this exact configuration and failed
    if (loadedKeyRef.current === currentKey && currentSession.dataState?.error) {
      return;
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
    loadSessionData,
  ]);

  return {
    ...loadingState,
    cancelLoad,
    retry,
    isInteractive: !loadingState.isLoading || (currentSession?.data.length ?? 0) > 0,
  };
}