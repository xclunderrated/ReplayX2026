import { useEffect, useRef } from 'react';
import type { NewsEvent } from '../lib/news';
import type { ChartTimezone } from '../lib/timezone';
import { buildFutureNewsLineDrawings, syncNewsLineDrawings } from '../lib/news/newsLineDrawings';

interface UseNewsLinesSyncParams {
  managerRef: React.RefObject<import('lightweight-charts-drawing').DrawingManager | null>;
  visibleNews: NewsEvent[];
  currentReplayTimestamp: number | undefined;
  lastVisibleTimestamp: number | undefined;
  lastVisiblePrice: number | undefined;
  intervalMs: number;
  chartTimezone: ChartTimezone;
  opacity?: number;
  endTimestamp?: number;
}

/**
 * Projects upcoming visible news events onto the chart as full-height
 * VerticalLine drawings (the same drawing-tool primitive a user would place
 * by hand). These are a pure runtime projection: never persisted to the store
 * document, regenerated on every replay step, and updated as events are
 * reached (the line disappears once the cursor passes the event).
 */
export function useNewsLinesSync({
  managerRef,
  visibleNews,
  currentReplayTimestamp,
  lastVisibleTimestamp,
  lastVisiblePrice,
  intervalMs,
  chartTimezone,
  opacity = 1,
  endTimestamp,
}: UseNewsLinesSyncParams): void {
  const lastSyncSigRef = useRef<string>('');

  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;

    if (!lastVisibleTimestamp || !Number.isFinite(lastVisibleTimestamp)) {
      if (lastSyncSigRef.current !== 'empty') {
        lastSyncSigRef.current = 'empty';
        syncNewsLineDrawings(manager, []);
      }
      return;
    }

    const desired = buildFutureNewsLineDrawings({
      visibleNews,
      currentReplayTimestamp,
      lastVisibleTimestamp,
      lastVisiblePrice,
      intervalMs,
      chartTimezone,
      opacity,
      endTimestamp,
    });

    const sig = `${desired.map((d) => `${d.id}-${d.anchors[0]?.time}`).join(';')}|${opacity}|${chartTimezone}`;
    if (sig === lastSyncSigRef.current) {
      return;
    }
    lastSyncSigRef.current = sig;

    syncNewsLineDrawings(manager, desired);
  }, [
    managerRef,
    visibleNews,
    currentReplayTimestamp,
    lastVisibleTimestamp,
    lastVisiblePrice,
    intervalMs,
    chartTimezone,
    opacity,
    endTimestamp,
  ]);
}
