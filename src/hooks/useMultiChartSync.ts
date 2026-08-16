import React, { useEffect } from 'react';
import type { IChartApi, Time, IRange } from 'lightweight-charts';

interface SyncOptions {
  syncCrosshair?: boolean;
  syncTimeRange?: boolean;
}

const activeCharts = new Map<string, IChartApi>();
const listeners = {
  crosshair: new Set<(sourceId: string, time: Time | null, point: { x: number; y: number } | null) => void>(),
  timeRange: new Set<(sourceId: string, range: IRange<Time> | null) => void>(),
};

let isBroadcastingTimeRange = false;
let isBroadcastingCrosshair = false;

export function useMultiChartSync(
  paneId: string,
  chartRef: React.MutableRefObject<IChartApi | null>,
  options: SyncOptions = {}
) {
  const { syncCrosshair = true, syncTimeRange = true } = options;

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    activeCharts.set(paneId, chart);

    // Crosshair broadcast listener
    const handleCrosshairBroadcast = (
      sourceId: string,
      time: Time | null,
      point: { x: number; y: number } | null
    ) => {
      if (!syncCrosshair || sourceId === paneId || isBroadcastingCrosshair) return;
      try {
        if (time !== null && point !== null) {
          chart.setCrosshairPosition(NaN, time, (chart as any)._mainSeries || undefined);
        } else {
          chart.clearCrosshairPosition();
        }
      } catch (e) {
        // Safe catch
      }
    };

    // Visible Time Range broadcast listener (Synchronizes the visible time interval [from, to])
    const handleTimeRangeBroadcast = (sourceId: string, range: IRange<Time> | null) => {
      if (!syncTimeRange || sourceId === paneId || isBroadcastingTimeRange || !range) return;
      if (range.from === undefined || range.to === undefined) return;

      try {
        isBroadcastingTimeRange = true;
        chart.timeScale().setVisibleRange({
          from: range.from,
          to: range.to,
        });
      } catch (e) {
        // Safe catch
      } finally {
        setTimeout(() => {
          isBroadcastingTimeRange = false;
        }, 50);
      }
    };

    listeners.crosshair.add(handleCrosshairBroadcast);
    listeners.timeRange.add(handleTimeRangeBroadcast);

    // Subscribe to local chart crosshair
    const crosshairHandler = (param: any) => {
      if (!syncCrosshair || isBroadcastingCrosshair) return;
      if (!param.time || !param.point) {
        listeners.crosshair.forEach((fn) => fn(paneId, null, null));
      } else {
        listeners.crosshair.forEach((fn) => fn(paneId, param.time, param.point));
      }
    };
    chart.subscribeCrosshairMove(crosshairHandler);

    // Subscribe to local chart visible time range change
    const timeRangeHandler = (newRange: IRange<Time> | null) => {
      if (!syncTimeRange || isBroadcastingTimeRange || !newRange || newRange.from === undefined || newRange.to === undefined) return;
      listeners.timeRange.forEach((fn) => fn(paneId, newRange));
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(timeRangeHandler);

    return () => {
      activeCharts.delete(paneId);
      listeners.crosshair.delete(handleCrosshairBroadcast);
      listeners.timeRange.delete(handleTimeRangeBroadcast);
      try {
        chart.unsubscribeCrosshairMove(crosshairHandler);
        chart.timeScale().unsubscribeVisibleTimeRangeChange(timeRangeHandler);
      } catch (e) {
        // Safe catch
      }
    };
  }, [paneId, syncCrosshair, syncTimeRange]);
}
