import type { Candle } from '../../store/useSimulatorStore';
import { buildContinuousTimeline } from '../continuousTimeline';
import { timestampMsToChartTime } from '../timezone';

export interface ReplayTimeInput {
  effectiveData: Candle[];
  effectiveCurrentIndex: number;
  compressGaps: boolean;
  chartTimezone: string;
}

export interface ReplayTime {
  /** Chart time (ordinal or tz-shifted timestamp) of the replay bar. */
  chartTime: number;
  /** Real millisecond timestamp of the replay bar. */
  currentTimestamp: number;
}

// buildContinuousTimeline is O(n) over the candle count — cache it by the
// data window so the per-frame recompute stays O(1).
let cachedTimelineKey = '';
let cachedTimeline: ReturnType<typeof buildContinuousTimeline> | null = null;

function getTimeline(firstTs: number, lastTs: number) {
  const key = `${firstTs}|${lastTs}`;
  if (cachedTimelineKey !== key) {
    cachedTimeline = buildContinuousTimeline(firstTs, lastTs);
    cachedTimelineKey = key;
  }
  return cachedTimeline!;
}

/**
 * Resolve the current replay bar's chart time + real timestamp. Shared by the
 * trade-line projection hook and the chart's drag handlers so both anchor
 * drawings to exactly the same bar.
 */
export function getReplayTime({
  effectiveData,
  effectiveCurrentIndex,
  compressGaps,
  chartTimezone,
}: ReplayTimeInput): ReplayTime {
  const currentIndex = Math.min(
    Math.max(effectiveCurrentIndex, 0),
    Math.max(effectiveData.length - 1, 0),
  );
  const currentBar = effectiveData[currentIndex];
  const currentTimestamp = currentBar?.timestamp ?? Date.now();

  let chartTime: number;
  if (effectiveData.length > 0 && compressGaps) {
    const firstTs = effectiveData[0].timestamp;
    const lastTs = effectiveData[effectiveData.length - 1].timestamp;
    const timeline = getTimeline(firstTs, lastTs);
    chartTime = timeline.realToOrdinal.get(currentTimestamp)
      ?? timestampMsToChartTime(currentTimestamp, chartTimezone);
  } else {
    chartTime = timestampMsToChartTime(currentTimestamp, chartTimezone);
  }

  return { chartTime, currentTimestamp };
}
