import type { DrawingObject, DrawingPoint } from './types';
import { getInstrumentSpec, getPipSize, getPipValuePerLot } from '../orders';

export { getInstrumentSpec, getPipSize, getPipValuePerLot };

export interface DrawingMetrics {
  // Price metrics
  startPrice?: number;
  endPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
  pipsChange?: number;
  
  // Time metrics
  startTime?: number;
  endTime?: number;
  timeSpanMs?: number;
  timeSpanFormatted?: string;
  barsCount?: number;

  // Geometry
  angleDegrees?: number;

  // Position / Risk specific (for longPosition, shortPosition)
  entryPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  slPips?: number;
  tpPips?: number;
  riskRewardRatio?: number;
  estimatedLots?: number;
  riskAmount?: number;
  rewardAmount?: number;
  riskPercent?: number;
  rewardPercent?: number;

  // Fib specific
  fibLevelsCalculated?: { level: number; price: number; color?: string }[];
}

export function formatTimeSpan(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

function resolvePointTimestampMs(p: DrawingPoint, data?: { timestamp: number }[]): number {
  if (p.rawTime && p.rawTime > 0) {
    return p.rawTime > 10000000000 ? p.rawTime : p.rawTime * 1000;
  }
  if (p.time > 10000000000) {
    return p.time;
  }
  if (p.time > 1000000) {
    return p.time * 1000;
  }
  if (data && data.length > 0 && p.time >= 0 && p.time < data.length) {
    const idx = Math.min(Math.max(0, Math.round(p.time)), data.length - 1);
    return data[idx].timestamp;
  }
  return p.time;
}

export function calculateDrawingMetrics(
  drawing: DrawingObject,
  instrument = 'EURUSD',
  accountBalance = 10000,
  riskPercent = 1.0,
  data?: { timestamp: number }[]
): DrawingMetrics {
  const points = drawing.points || [];
  if (points.length === 0) return {};

  const pipSize = getPipSize(instrument);
  const spec = getInstrumentSpec(instrument);
  const metrics: DrawingMetrics = {};

  const p1 = points[0];
  const p2 = points[1] || points[0];
  const p3 = points[2];

  metrics.startPrice = p1.price;
  metrics.endPrice = p2.price;

  // Price difference
  const priceDelta = p2.price - p1.price;
  metrics.priceChange = Number(priceDelta.toFixed(spec.digits));
  metrics.priceChangePercent = p1.price !== 0 ? Number(((priceDelta / p1.price) * 100).toFixed(2)) : 0;
  metrics.pipsChange = Number((priceDelta / pipSize).toFixed(1));

  // Time metrics
  const t1 = resolvePointTimestampMs(p1, data);
  const t2 = resolvePointTimestampMs(p2, data);
  metrics.startTime = t1;
  metrics.endTime = t2;
  const diffMs = Math.abs(t2 - t1);
  metrics.timeSpanMs = diffMs;
  metrics.timeSpanFormatted = formatTimeSpan(diffMs);

  // Bars count if dataset provided
  if (data && data.length > 0) {
    const minT = Math.min(t1, t2);
    const maxT = Math.max(t1, t2);

    let idx1 = -1;
    let idx2 = -1;

    // Binary search or indexed lookup
    for (let i = 0; i < data.length; i++) {
      if (idx1 === -1 && data[i].timestamp >= minT) {
        idx1 = i;
      }
      if (data[i].timestamp <= maxT) {
        idx2 = i;
      }
    }

    if (idx1 !== -1 && idx2 !== -1 && idx2 >= idx1) {
      metrics.barsCount = idx2 - idx1 + 1;
    } else {
      metrics.barsCount = 1;
    }
  }

  // Angle calculation (slope in degrees)
  if (points.length >= 2) {
    const dx = p2.time - p1.time;
    const dy = (p2.price - p1.price) / (p1.price || 1);
    if (dx !== 0) {
      const angleRad = Math.atan2(dy * 1000, dx);
      metrics.angleDegrees = Number(((angleRad * 180) / Math.PI).toFixed(1));
    }
  }

  // Position Tool Calculations (Long / Short)
  if (drawing.tool === 'longPosition' || drawing.tool === 'shortPosition') {
    const isLong = drawing.tool === 'longPosition';
    const entry = p1.price;
    // p2 is SL, p3 is TP (or defaults)
    const sl = p2 ? p2.price : entry * (isLong ? 0.995 : 1.005);
    const tp = p3 ? p3.price : entry * (isLong ? 1.01 : 0.99);

    metrics.entryPrice = entry;
    metrics.stopLossPrice = sl;
    metrics.takeProfitPrice = tp;

    const slDistance = Math.abs(entry - sl);
    const tpDistance = Math.abs(tp - entry);

    metrics.slPips = Number((slDistance / pipSize).toFixed(1));
    metrics.tpPips = Number((tpDistance / pipSize).toFixed(1));

    const rr = slDistance > 0 ? tpDistance / slDistance : 0;
    metrics.riskRewardRatio = Number(rr.toFixed(2));

    const actualRiskPercent = drawing.style.riskPercent ?? riskPercent;
    const actualBalance = drawing.style.accountSize ?? accountBalance;
    const riskDollar = (actualBalance * actualRiskPercent) / 100;
    metrics.riskAmount = Number(riskDollar.toFixed(2));
    metrics.riskPercent = actualRiskPercent;

    const pipValuePerStandardLot = getPipValuePerLot(instrument, entry);
    const slPipsCount = slDistance / pipSize;
    if (slPipsCount > 0 && pipValuePerStandardLot > 0) {
      const lots = riskDollar / (slPipsCount * pipValuePerStandardLot);
      metrics.estimatedLots = Number(Math.max(0.01, lots).toFixed(2));
      metrics.rewardAmount = Number((riskDollar * rr).toFixed(2));
      metrics.rewardPercent = Number((actualRiskPercent * rr).toFixed(2));
    }
  }

  // Fibonacci Retracement & Extension calculations
  if (drawing.tool === 'fibRetracement' || drawing.tool === 'fibExtension') {
    const levels = drawing.style.fibLevels || [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618];
    const high = Math.max(p1.price, p2.price);
    const low = Math.min(p1.price, p2.price);
    const range = high - low;
    const isUptrend = p2.price >= p1.price;

    metrics.fibLevelsCalculated = levels.map((lvl) => {
      const levelPrice = isUptrend ? p2.price - range * lvl : p2.price + range * lvl;
      return {
        level: lvl,
        price: Number(levelPrice.toFixed(spec.digits)),
        color: drawing.style.fibColors?.[lvl],
      };
    });
  }

  return metrics;
}
