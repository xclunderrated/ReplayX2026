import { EnrichedTrade, MetricSummary, getPipMultiplier } from './math/tradeMetrics';
import { Candle } from '../store/useSimulatorStore';
import { TradeReplayData } from '../components/analytics/analyticsEngine';

/**
 * High-Resolution HTML5 Canvas Chart Renderer for ReplayX PDF Reports.
 * Generates crisp, retina-ready chart images (PNG Data URLs) for PDF insertion.
 */

// Helper to format currency
function fmtMoney(v: number): string {
  const sign = v >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Helper to format date / time for canvas axes
function fmtTime(ts: number): string {
  if (!ts || isNaN(ts)) return '';
  const d = new Date(ts);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function fmtDateShort(ts: number): string {
  if (!ts || isNaN(ts)) return '';
  const d = new Date(ts);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

export interface ChartRenderOptions {
  timeframeLabel?: string;
  chartTitle?: string;
}

/**
 * 1. Generates an ultra-detailed, high-resolution Candlestick Chart Data URL for a single trade.
 */
export function generateCandlestickChartDataUrl(
  trade: EnrichedTrade,
  replayData?: TradeReplayData | null,
  customCandles?: Candle[],
  options?: ChartRenderOptions
): string {
  const width = 1600;
  const height = 800;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const displayTimeframe = (options?.timeframeLabel || trade.timeframe || '1M').toUpperCase();

  const candles = replayData?.candles || customCandles || (trade as any).candles || [];
  if (candles.length === 0) {
    // If no candles available, render a fallback execution diagram
    return generateExecutionDiagramDataUrl(trade, displayTimeframe);
  }

  const paddingLeft = 40;
  const paddingRight = 100;
  const paddingTop = 70;
  const paddingBottom = 60;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const volumeHeight = chartHeight * 0.18;
  const priceChartHeight = chartHeight - volumeHeight - 15;

  // Background Theme
  ctx.fillStyle = '#0b132b'; // Deep navy obsidian
  ctx.fillRect(0, 0, width, height);

  // Determine Price Extents (include Entry, Exit, SL, TP so all fit in frame)
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let maxVolume = 0;

  candles.forEach((c: Candle) => {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
    if ((c.volume || 0) > maxVolume) maxVolume = c.volume || 0;
  });

  const entryP = Number(trade.entryPrice || 0);
  const exitP = Number(trade.exitPrice || 0);
  const slP = trade.sl ? Number(trade.sl) : 0;
  const tpP = trade.tp ? Number(trade.tp) : 0;

  if (entryP > 0) {
    minPrice = Math.min(minPrice, entryP);
    maxPrice = Math.max(maxPrice, entryP);
  }
  if (exitP > 0) {
    minPrice = Math.min(minPrice, exitP);
    maxPrice = Math.max(maxPrice, exitP);
  }
  if (slP > 0) {
    minPrice = Math.min(minPrice, slP);
    maxPrice = Math.max(maxPrice, slP);
  }
  if (tpP > 0) {
    minPrice = Math.min(minPrice, tpP);
    maxPrice = Math.max(maxPrice, tpP);
  }

  // Add 8% vertical breathing padding
  const priceRange = maxPrice - minPrice || 0.001;
  minPrice -= priceRange * 0.08;
  maxPrice += priceRange * 0.08;
  const paddedRange = maxPrice - minPrice;

  const getPriceY = (price: number) => {
    return paddingTop + (1 - (price - minPrice) / paddedRange) * priceChartHeight;
  };

  const maxCandleSpacing = 22;
  const candleSpacing = Math.min(maxCandleSpacing, chartWidth / Math.max(1, candles.length));
  const candleBodyWidth = Math.max(2, Math.min(candleSpacing - 2, Math.min(16, Math.max(candleSpacing * 0.78, 3))));

  const totalCandlesWidth = candles.length * candleSpacing;
  const startX = totalCandlesWidth < chartWidth ? paddingLeft + (chartWidth - totalCandlesWidth) / 2 : paddingLeft;

  const getCandleX = (idx: number) => startX + idx * candleSpacing + candleSpacing / 2;

  // 1. Draw Grid Lines (Horizontal Price Grid)
  const gridSteps = 6;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fillStyle = '#64748b';
  ctx.font = '12px "JetBrains Mono", Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const decimals = trade.instrument.toUpperCase().includes('JPY') ? 3 : trade.instrument.toUpperCase().includes('XAU') || trade.instrument.toUpperCase().includes('BTC') ? 2 : 5;

  for (let i = 0; i <= gridSteps; i++) {
    const p = minPrice + (paddedRange / gridSteps) * i;
    const y = getPriceY(p);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();

    ctx.fillText(p.toFixed(decimals), width - paddingRight + 8, y);
  }

  // 2. Identify Entry, Exit, MAE, MFE Candle Indices
  const entryTs = trade.entryTime || trade.orderTime || 0;
  const exitTs = trade.exitTime || (trade as any).closedAt || 0;

  let entryIdx = replayData ? replayData.entryIndex : -1;
  let exitIdx = replayData ? replayData.exitIndex : -1;

  if (entryIdx < 0) {
    let bestDelta = Infinity;
    candles.forEach((c: Candle, idx: number) => {
      const d = Math.abs(c.timestamp - entryTs);
      if (d < bestDelta) {
        bestDelta = d;
        entryIdx = idx;
      }
    });
  }

  if (exitIdx < 0) {
    let bestDelta = Infinity;
    candles.forEach((c: Candle, idx: number) => {
      const d = Math.abs(c.timestamp - exitTs);
      if (d < bestDelta) {
        bestDelta = d;
        exitIdx = idx;
      }
    });
  }

  if (entryIdx < 0) entryIdx = Math.floor(candles.length * 0.25);
  if (exitIdx < 0 || exitIdx < entryIdx) exitIdx = Math.min(candles.length - 1, entryIdx + Math.max(5, Math.floor(candles.length * 0.4)));

  // Calculate MAE / MFE indices within holding period
  let maeIdx = entryIdx;
  let mfeIdx = entryIdx;
  let highestHigh = -Infinity;
  let lowestLow = Infinity;

  for (let i = entryIdx; i <= exitIdx && i < candles.length; i++) {
    const c = candles[i];
    if (c.high > highestHigh) {
      highestHigh = c.high;
      if (trade.type === 'buy') mfeIdx = i;
      else maeIdx = i;
    }
    if (c.low < lowestLow) {
      lowestLow = c.low;
      if (trade.type === 'buy') maeIdx = i;
      else mfeIdx = i;
    }
  }

  // 3. Shaded Trade Holding Period Background
  const entryX = getCandleX(entryIdx);
  const exitX = getCandleX(exitIdx);
  const isWin = Number(trade.pnl || 0) > 0.5;

  ctx.fillStyle = isWin ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)';
  ctx.fillRect(entryX, paddingTop, Math.max(4, exitX - entryX), priceChartHeight);

  // Border lines for holding window
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = isWin ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)';
  ctx.beginPath();
  ctx.moveTo(entryX, paddingTop);
  ctx.lineTo(entryX, paddingTop + priceChartHeight);
  ctx.moveTo(exitX, paddingTop);
  ctx.lineTo(exitX, paddingTop + priceChartHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // 4. Draw Volume Bars
  const volumeBaseY = height - paddingBottom;
  candles.forEach((c: Candle, idx: number) => {
    const x = getCandleX(idx);
    const vol = c.volume || 1;
    const vHeight = maxVolume > 0 ? (vol / maxVolume) * volumeHeight : 5;
    const isBullish = c.close >= c.open;

    ctx.fillStyle = isBullish ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';
    ctx.fillRect(x - candleBodyWidth / 2, volumeBaseY - vHeight, candleBodyWidth, vHeight);
  });

  // 5. Draw Candlesticks
  candles.forEach((c: Candle, idx: number) => {
    const x = getCandleX(idx);
    const isBullish = c.close >= c.open;
    const color = isBullish ? '#10b981' : '#ef4444';

    const openY = getPriceY(c.open);
    const closeY = getPriceY(c.close);
    const highY = getPriceY(c.high);
    const lowY = getPriceY(c.low);

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();

    // Body
    const topY = Math.min(openY, closeY);
    const bodyH = Math.max(2, Math.abs(closeY - openY));
    ctx.fillStyle = color;
    ctx.fillRect(x - candleBodyWidth / 2, topY, candleBodyWidth, bodyH);

    // Subtle Time scale labels
    if (idx % Math.max(1, Math.floor(candles.length / 8)) === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fmtTime(c.timestamp), x, height - paddingBottom + 20);
      if (idx === 0 || idx === Math.floor(candles.length / 2)) {
        ctx.fillText(fmtDateShort(c.timestamp), x, height - paddingBottom + 35);
      }
    }
  });

  // 6. Draw Stop Loss & Take Profit Reference Lines
  if (slP > 0) {
    const slY = getPriceY(slP);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(entryX, slY);
    ctx.lineTo(width - paddingRight, slY);
    ctx.stroke();
    ctx.setLineDash([]);

    // SL Tag Pill on Right Price Scale
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.roundRect(width - paddingRight + 4, slY - 10, 85, 20, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SL ${slP.toFixed(decimals)}`, width - paddingRight + 8, slY + 3);
  }

  if (tpP > 0) {
    const tpY = getPriceY(tpP);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(entryX, tpY);
    ctx.lineTo(width - paddingRight, tpY);
    ctx.stroke();
    ctx.setLineDash([]);

    // TP Tag Pill on Right Price Scale
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.roundRect(width - paddingRight + 4, tpY - 10, 85, 20, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`TP ${tpP.toFixed(decimals)}`, width - paddingRight + 8, tpY + 3);
  }

  // 7. Draw Entry Level Line & Price Scale Tag
  if (entryP > 0) {
    const entryY = getPriceY(entryP);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(entryX, entryY);
    ctx.lineTo(width - paddingRight, entryY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Entry Pin Marker on Candle
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(entryX, entryY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Right Axis Price Tag for Entry
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.roundRect(width - paddingRight + 4, entryY - 10, 85, 20, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`ENT ${entryP.toFixed(decimals)}`, width - paddingRight + 8, entryY + 3);
  }

  // 8. Draw Exit Level Line & Price Scale Tag
  if (exitP > 0) {
    const exitY = getPriceY(exitP);
    const exitColor = isWin ? '#10b981' : '#ef4444';

    // Exit Pin Marker on Candle
    ctx.fillStyle = exitColor;
    ctx.beginPath();
    ctx.arc(exitX, exitY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Right Axis Price Tag for Exit
    ctx.fillStyle = exitColor;
    ctx.beginPath();
    ctx.roundRect(width - paddingRight + 4, exitY - 10, 85, 20, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`EXIT ${exitP.toFixed(decimals)}`, width - paddingRight + 8, exitY + 3);
  }

  // 9. MFE Peak Marker & MAE Heat Marker (Minimal Dots Only - No Floating Candle Labels)
  if (mfeIdx >= entryIdx && mfeIdx <= exitIdx && mfeIdx < candles.length) {
    const mfeC = candles[mfeIdx];
    const isBuy = trade.type === 'buy';
    const mfeY = getPriceY(isBuy ? mfeC.high : mfeC.low);
    const mfeX = getCandleX(mfeIdx);

    ctx.fillStyle = '#14b8a6';
    ctx.beginPath();
    ctx.arc(mfeX, mfeY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (maeIdx >= entryIdx && maeIdx <= exitIdx && maeIdx < candles.length) {
    const maeC = candles[maeIdx];
    const isBuy = trade.type === 'buy';
    const maeY = getPriceY(isBuy ? maeC.low : maeC.high);
    const maeX = getCandleX(maeIdx);

    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(maeX, maeY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 10. Watermark & Title Overlay Header Bar
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.fillRect(paddingLeft, 14, width - paddingLeft - paddingRight, 46);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(paddingLeft, 14, width - paddingLeft - paddingRight, 46);

  // Left Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${trade.instrument.toUpperCase()} • ${trade.type.toUpperCase()}`, paddingLeft + 15, 34);

  // Prominent Timeframe Badge Pill
  const tfBadgeText = `${displayTimeframe} TIMEFRAME`;
  ctx.font = 'bold 12px "JetBrains Mono", Menlo, monospace';
  const prefixW = ctx.measureText(`${trade.instrument.toUpperCase()} • ${trade.type.toUpperCase()}`).width;
  const tfBadgeX = paddingLeft + 15 + prefixW + 14;
  const tfTextMetrics = ctx.measureText(tfBadgeText);
  const tfBadgeW = tfTextMetrics.width + 16;
  const tfBadgeH = 22;
  const tfBadgeY = 20;

  ctx.fillStyle = '#2563eb'; // Royal Blue high-visibility background
  ctx.beginPath();
  ctx.roundRect(tfBadgeX, tfBadgeY, tfBadgeW, tfBadgeH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(tfBadgeText, tfBadgeX + tfBadgeW / 2, tfBadgeY + 15);

  // Subtitle / Session info
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`Session: ${trade.sessionName} | Trade ID: ${trade.id.slice(0, 10)}`, paddingLeft + 15, 51);

  // Result Badge inside header
  const pnlVal = Number(trade.pnl || 0);
  const pnlSign = pnlVal >= 0 ? '+' : '';
  const rPart = trade.riskAmountDollar > 0 ? ` • ${pnlSign}${trade.calculatedRMultiple}R` : '';
  const resultText = `${pnlSign}${pnlVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${trade.pipGain >= 0 ? '+' : ''}${trade.pipGain} pips${rPart})`;
  ctx.font = 'bold 15px "JetBrains Mono", Menlo, monospace';
  ctx.fillStyle = isWin ? '#10b981' : '#ef4444';
  ctx.textAlign = 'right';
  ctx.fillText(resultText, width - paddingRight - 15, 42);

  return canvas.toDataURL('image/png', 0.95);
}

/**
 * Fallback execution diagram if raw candle history is missing.
 */
function generateExecutionDiagramDataUrl(trade: EnrichedTrade, displayTimeframe: string = '1M'): string {
  const width = 1400;
  const height = 600;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${trade.instrument} Execution Profile (${trade.type.toUpperCase()} • ${displayTimeframe.toUpperCase()})`, width / 2, 60);

  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`Entry: ${Number(trade.entryPrice || 0).toFixed(5)} -> Exit: ${Number(trade.exitPrice || 0).toFixed(5)}`, width / 2, 95);

  const isWin = Number(trade.pnl || 0) > 0.5;
  ctx.fillStyle = isWin ? '#10b981' : '#ef4444';
  ctx.font = 'bold 28px sans-serif';
  const pnlSign = Number(trade.pnl || 0) >= 0 ? '+' : '';
  const rSuffix = trade.riskAmountDollar > 0 ? ` (${pnlSign}${trade.calculatedRMultiple}R)` : '';
  ctx.fillText(`${pnlSign}${Number(trade.pnl || 0).toFixed(2)}${rSuffix}`, width / 2, 145);

  return canvas.toDataURL('image/png', 0.95);
}

/**
 * 2. Generates a High-Resolution Equity Curve & Underwater Drawdown Chart for Multi-Trade Dossiers.
 */
export function generateEquityCurveChartDataUrl(trades: EnrichedTrade[]): string {
  const width = 1600;
  const height = 700;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#0b132b';
  ctx.fillRect(0, 0, width, height);

  if (trades.length === 0) return canvas.toDataURL('image/png');

  // Calculate cumulative equity points & drawdown
  // Chronological order (oldest to newest)
  const sorted = [...trades].sort((a, b) => {
    const tA = a.exitTime || a.entryTime || 0;
    const tB = b.exitTime || b.entryTime || 0;
    return tA - tB;
  });

  const equityPoints: number[] = [0];
  let runningPnl = 0;
  let peakEquity = 0;
  const drawdownPoints: number[] = [0];

  sorted.forEach((t) => {
    runningPnl += Number(t.pnl || 0);
    equityPoints.push(runningPnl);
    if (runningPnl > peakEquity) peakEquity = runningPnl;
    const dd = runningPnl - peakEquity;
    drawdownPoints.push(dd);
  });

  const paddingLeft = 70;
  const paddingRight = 80;
  const paddingTop = 70;
  const paddingBottom = 60;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const minEquity = Math.min(0, ...equityPoints);
  const maxEquity = Math.max(10, ...equityPoints);
  const range = maxEquity - minEquity || 100;
  const paddedMin = minEquity - range * 0.08;
  const paddedMax = maxEquity + range * 0.08;
  const paddedRange = paddedMax - paddedMin;

  const getX = (idx: number) => paddingLeft + (idx / (equityPoints.length - 1 || 1)) * chartW;
  const getY = (val: number) => paddingTop + (1 - (val - paddedMin) / paddedRange) * chartH;

  // Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#64748b';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';

  for (let i = 0; i <= 5; i++) {
    const v = paddedMin + (paddedRange / 5) * i;
    const y = getY(v);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();
    ctx.fillText(`$${v.toFixed(0)}`, paddingLeft - 10, y + 4);
  }

  // Zero line
  const zeroY = getY(0);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(paddingLeft, zeroY);
  ctx.lineTo(width - paddingRight, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw Area Gradient Fill
  const gradient = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartH);
  gradient.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
  gradient.addColorStop(0.7, 'rgba(59, 130, 246, 0.15)');
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(getX(0), zeroY);
  equityPoints.forEach((val, idx) => {
    ctx.lineTo(getX(idx), getY(val));
  });
  ctx.lineTo(getX(equityPoints.length - 1), zeroY);
  ctx.closePath();
  ctx.fill();

  // Draw Line
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 3;
  ctx.beginPath();
  equityPoints.forEach((val, idx) => {
    if (idx === 0) ctx.moveTo(getX(idx), getY(val));
    else ctx.lineTo(getX(idx), getY(val));
  });
  ctx.stroke();

  // Dots on each trade
  equityPoints.forEach((val, idx) => {
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(getX(idx), getY(val), 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Title & Header Box
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PORTFOLIO EQUITY GROWTH CURVE & CAPITAL TRAJECTORY', paddingLeft, 35);

  const finalNet = equityPoints[equityPoints.length - 1];
  const finalSign = finalNet >= 0 ? '+' : '';
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.fillStyle = finalNet >= 0 ? '#10b981' : '#ef4444';
  ctx.textAlign = 'right';
  ctx.fillText(`Net PnL: ${finalSign}$${finalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, width - paddingRight, 35);

  return canvas.toDataURL('image/png', 0.95);
}

/**
 * 3. Generates R-Multiple Distribution Histogram Chart.
 */
export function generateRDistributionChartDataUrl(trades: EnrichedTrade[]): string {
  const width = 1200;
  const height = 550;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#0b132b';
  ctx.fillRect(0, 0, width, height);

  const buckets = [
    { label: '< -1.5R', count: 0, color: '#e11d48' },
    { label: '-1.0R', count: 0, color: '#f43f5e' },
    { label: '-0.5R', count: 0, color: '#fb7185' },
    { label: '0R (BE)', count: 0, color: '#94a3b8' },
    { label: '+1.0R', count: 0, color: '#34d399' },
    { label: '+2.0R', count: 0, color: '#10b981' },
    { label: '+3.0R', count: 0, color: '#059669' },
    { label: '> +3.0R', count: 0, color: '#8b5cf6' },
  ];

  trades.forEach((t) => {
    const r = t.calculatedRMultiple;
    if (r < -1.25) buckets[0].count++;
    else if (r >= -1.25 && r < -0.75) buckets[1].count++;
    else if (r >= -0.75 && r < -0.1) buckets[2].count++;
    else if (r >= -0.1 && r <= 0.2) buckets[3].count++;
    else if (r > 0.2 && r <= 1.4) buckets[4].count++;
    else if (r > 1.4 && r <= 2.4) buckets[5].count++;
    else if (r > 2.4 && r <= 3.4) buckets[6].count++;
    else buckets[7].count++;
  });

  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const paddingLeft = 60;
  const paddingRight = 40;
  const paddingTop = 70;
  const paddingBottom = 60;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;
  const barWidth = (chartW / buckets.length) * 0.7;
  const barGap = (chartW / buckets.length) * 0.3;

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('R-MULTIPLE RETURN DISTRIBUTION & EXPECTANCY SPREAD', paddingLeft, 38);

  buckets.forEach((b, idx) => {
    const x = paddingLeft + idx * (barWidth + barGap) + barGap / 2;
    const bHeight = (b.count / maxCount) * chartH;
    const y = paddingTop + chartH - bHeight;

    // Bar
    ctx.fillStyle = b.color;
    ctx.roundRect(x, y, barWidth, Math.max(3, bHeight), 4);
    ctx.fill();

    // Count label on top
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${b.count}`, x + barWidth / 2, y - 6);

    // Bucket name label below
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(b.label, x + barWidth / 2, paddingTop + chartH + 20);

    const pct = trades.length > 0 ? ((b.count / trades.length) * 100).toFixed(0) : '0';
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`${pct}%`, x + barWidth / 2, paddingTop + chartH + 34);
  });

  return canvas.toDataURL('image/png', 0.95);
}

/**
 * 4. Generates MAE vs MFE Scatter Plot Chart (Trade Execution Quality).
 */
export function generateMaeMfeScatterChartDataUrl(trades: EnrichedTrade[]): string {
  const width = 1200;
  const height = 550;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#0b132b';
  ctx.fillRect(0, 0, width, height);

  const paddingLeft = 70;
  const paddingRight = 60;
  const paddingTop = 70;
  const paddingBottom = 60;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  let maxMae = 10;
  let maxMfe = 10;
  trades.forEach((t) => {
    if (t.maeDollar > maxMae) maxMae = t.maeDollar;
    if (t.mfeDollar > maxMfe) maxMfe = t.mfeDollar;
  });

  maxMae *= 1.15;
  maxMfe *= 1.15;

  const getX = (mae: number) => paddingLeft + (mae / maxMae) * chartW;
  const getY = (mfe: number) => paddingTop + (1 - mfe / maxMfe) * chartH;

  // Axes & Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = paddingTop + (chartH / 5) * i;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();

    const x = paddingLeft + (chartW / 5) * i;
    ctx.beginPath();
    ctx.moveTo(x, paddingTop);
    ctx.lineTo(x, height - paddingBottom);
    ctx.stroke();
  }

  // Diagonal 1:1 line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(getX(0), getY(0));
  ctx.lineTo(getX(Math.min(maxMae, maxMfe)), getY(Math.min(maxMae, maxMfe)));
  ctx.stroke();
  ctx.setLineDash([]);

  // Plot Trades
  trades.forEach((t) => {
    const x = getX(t.maeDollar);
    const y = getY(t.mfeDollar);
    const isWin = Number(t.pnl || 0) > 0.5;

    ctx.fillStyle = isWin ? 'rgba(16, 185, 129, 0.75)' : 'rgba(239, 68, 68, 0.75)';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Title & Labels
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('EXCURSION PROFILE: MAE (HEAT TAKEN) VS MFE (PEAK REACHED)', paddingLeft, 38);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Adverse Drawdown (MAE in $) ->', width / 2, height - 15);

  ctx.save();
  ctx.translate(20, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Favorable Peak (MFE in $) ->', 0, 0);
  ctx.restore();

  return canvas.toDataURL('image/png', 0.95);
}
