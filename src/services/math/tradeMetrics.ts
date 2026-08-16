import { Trade, Session, ArchivedSession } from '../../store/useSimulatorStore';
import { computeTradePnL, getPipSize, getPipValuePerLot, getInstrumentSpec } from '../../lib/orders';

export interface EnrichedTrade extends Trade {
  sessionId: string;
  sessionName: string;
  instrument: string;
  timeframe: string;
  isArchived?: boolean;
  calculatedDurationMs: number;
  calculatedRMultiple: number;
  riskAmountDollar: number;
  pipGain: number;
  maeDollar: number;
  mfeDollar: number;
  maePips: number;
  mfePips: number;
  executionEfficiency: number; // Realized PnL / MFE %
  riskHeatRatio: number; // MAE / Risk %
  grade?: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' | 'Ungraded';
}

export interface TradeFilterOptions {
  search: string;
  outcome: 'all' | 'win' | 'loss' | 'breakeven';
  direction: 'all' | 'buy' | 'sell';
  sessionId: 'all' | string;
  instrument: 'all' | string;
  strategyId: 'all' | string;
  grade: 'all' | string;
  mistakeTag: 'all' | string;
  startDate?: string;
  endDate?: string;
}

export interface MetricSummary {
  totalTrades: number;
  wins: number;
  losses: number;
  breakEvens: number;
  winRate: number; // percentage e.g. 65.5
  lossRate: number;
  netPnL: number;
  totalGrossProfit: number;
  totalGrossLoss: number;
  profitFactor: number;
  totalR: number;
  avgR: number;
  avgWinDollar: number;
  avgLossDollar: number;
  avgWinR: number;
  avgLossR: number;
  expectancyR: number;
  largestWinDollar: number;
  largestLossDollar: number;
  largestWinR: number;
  largestLossR: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  payoffRatio: number;
  avgHoldingTimeMs: number;
  avgMaeDollar: number;
  avgMfeDollar: number;
  longCount: number;
  shortCount: number;
  longWinRate: number;
  shortWinRate: number;
}

/**
 * Calculates instrument pip multiplier
 */
export function getPipMultiplier(instrument: string = ''): number {
  const pipSize = getPipSize(instrument);
  return pipSize > 0 ? Math.round(1 / pipSize) : 10000;
}

/**
 * Converts a raw trade from active or archived sessions into an enriched trade with exact verified math.
 */
export function enrichTrade(
  trade: Trade,
  sessionInfo: { id: string; name: string; instrument: string; timeframe: string; isArchived?: boolean; balance?: number }
): EnrichedTrade {
  const instrument = sessionInfo.instrument || (trade as any).instrument || 'EURUSD';
  const entryPrice = Number(trade.entryPrice ?? trade.limitPrice ?? 0);
  const exitPrice = Number(trade.exitPrice ?? entryPrice);
  const sl = trade.sl !== undefined && trade.sl !== null ? Number(trade.sl) : 0;
  const tp = trade.tp !== undefined && trade.tp !== null ? Number(trade.tp) : 0;
  const size = Number(trade.size || 0);

  const pipSize = getPipSize(instrument);
  const pipValuePerLot = getPipValuePerLot(instrument, entryPrice);

  // Exact Realized PnL
  let pnl = 0;
  if (trade.pnl !== undefined && Number.isFinite(Number(trade.pnl))) {
    pnl = Number(trade.pnl);
  } else if (entryPrice > 0 && exitPrice > 0 && size > 0) {
    pnl = computeTradePnL(trade.type, entryPrice, exitPrice, size, instrument);
  }

  // Exact Dollar Risk: calculated strictly from Stop Loss distance or explicit recorded risk
  let riskAmountDollar = 0;
  if (trade.riskDollar !== undefined && Number(trade.riskDollar) > 0) {
    riskAmountDollar = Number(trade.riskDollar);
  } else if (sl > 0 && entryPrice > 0 && size > 0) {
    riskAmountDollar = Math.abs(computeTradePnL(trade.type, entryPrice, sl, size, instrument));
  } else if (trade.riskPercent && trade.riskPercent > 0 && sessionInfo.balance && sessionInfo.balance > 0) {
    riskAmountDollar = sessionInfo.balance * (trade.riskPercent / 100);
  }

  // Exact R-Multiple: Realized PnL / Initial Dollar Risk
  let calculatedRMultiple = 0;
  if (riskAmountDollar > 0) {
    calculatedRMultiple = Number((pnl / riskAmountDollar).toFixed(2));
  }

  // Exact Pip Gain/Loss
  let pipGain = 0;
  if (entryPrice > 0 && exitPrice > 0 && pipSize > 0) {
    const diff = trade.type === 'buy' ? exitPrice - entryPrice : entryPrice - exitPrice;
    pipGain = Number((diff / pipSize).toFixed(1));
  }

  // Exact Duration
  const entryTime = trade.entryTime || trade.orderTime || 0;
  const exitTime = trade.exitTime || entryTime;
  const calculatedDurationMs = Math.max(0, exitTime - entryTime);

  // Exact MAE / MFE Dollar and Pips
  let maeDollar = trade.mae !== undefined ? Math.abs(Number(trade.mae)) : 0;
  let mfeDollar = trade.mfe !== undefined ? Math.abs(Number(trade.mfe)) : 0;
  let maePips = 0;
  let mfePips = 0;

  if (trade.candles && trade.candles.length > 0 && pipSize > 0 && entryPrice > 0) {
    const highs = trade.candles.map((c) => c.high);
    const lows = trade.candles.map((c) => c.low);
    const maxHigh = Math.max(...highs, entryPrice, exitPrice);
    const minLow = Math.min(...lows, entryPrice, exitPrice);

    if (trade.type === 'buy') {
      maePips = Number((Math.max(0, entryPrice - minLow) / pipSize).toFixed(1));
      mfePips = Number((Math.max(0, maxHigh - entryPrice) / pipSize).toFixed(1));
    } else {
      maePips = Number((Math.max(0, maxHigh - entryPrice) / pipSize).toFixed(1));
      mfePips = Number((Math.max(0, entryPrice - minLow) / pipSize).toFixed(1));
    }
  } else if (size > 0 && pipValuePerLot > 0) {
    maePips = Number((maeDollar / (size * pipValuePerLot)).toFixed(1));
    mfePips = Number((mfeDollar / (size * pipValuePerLot)).toFixed(1));
  }

  // Execution Efficiency (Realized PnL / MFE) & Risk Heat Ratio (MAE / Risk)
  let executionEfficiency = 0;
  if (mfeDollar > 0 && pnl > 0) {
    executionEfficiency = Math.max(0, Math.min(100, Number(((pnl / mfeDollar) * 100).toFixed(1))));
  } else if (pnl > 0) {
    executionEfficiency = 100;
  }

  let riskHeatRatio = 0;
  if (riskAmountDollar > 0) {
    riskHeatRatio = Number(((maeDollar / riskAmountDollar) * 100).toFixed(1));
  }

  // Grade calculation
  let grade: EnrichedTrade['grade'] = 'Ungraded';
  if (trade.confidence !== undefined) {
    if (trade.confidence >= 5) grade = 'A+';
    else if (trade.confidence === 4) grade = 'A';
    else if (trade.confidence === 3) grade = 'B';
    else if (trade.confidence === 2) grade = 'C';
    else if (trade.confidence === 1) grade = 'D';
    else grade = 'F';
  } else if (riskAmountDollar > 0) {
    if (calculatedRMultiple >= 3) grade = 'A+';
    else if (calculatedRMultiple >= 2) grade = 'A';
    else if (calculatedRMultiple >= 1) grade = 'B';
    else if (calculatedRMultiple >= 0.5) grade = 'C';
    else if (calculatedRMultiple >= 0) grade = 'D';
    else grade = 'F';
  }

  return {
    ...trade,
    sessionId: sessionInfo.id,
    sessionName: sessionInfo.name,
    instrument,
    timeframe: trade.timeframe || sessionInfo.timeframe,
    isArchived: sessionInfo.isArchived,
    calculatedDurationMs,
    calculatedRMultiple,
    riskAmountDollar: Number(riskAmountDollar.toFixed(2)),
    pipGain,
    maeDollar: Number(maeDollar.toFixed(2)),
    mfeDollar: Number(mfeDollar.toFixed(2)),
    maePips,
    mfePips,
    executionEfficiency,
    riskHeatRatio,
    grade,
  };
}

/**
 * Extracts and enriches all closed trades from active and archived sessions.
 */
export function getAllEnrichedTrades(
  sessions: Session[],
  archivedSessions: ArchivedSession[] = []
): EnrichedTrade[] {
  const result: EnrichedTrade[] = [];

  // Active Sessions
  for (const session of sessions) {
    const trades = session.trades || [];
    for (const trade of trades) {
      if (trade.status === 'closed') {
        result.push(enrichTrade(trade, {
          id: session.id,
          name: session.name || `Session ${session.id.slice(0, 5)}`,
          instrument: session.instrument || 'EURUSD',
          timeframe: session.timeframe || 'm15',
          balance: session.balance,
          isArchived: false,
        }));
      }
    }
  }

  // Archived Sessions
  for (const arch of archivedSessions) {
    const trades = arch.trades || [];
    for (const trade of trades) {
      if (trade.status === 'closed') {
        result.push(enrichTrade(trade, {
          id: arch.id,
          name: `${arch.name} (Archived)`,
          instrument: arch.instrument || 'EURUSD',
          timeframe: arch.timeframe || 'm15',
          balance: arch.balance,
          isArchived: true,
        }));
      }
    }
  }

  // Sort descending by exit time (or entry time)
  return result.sort((a, b) => (b.exitTime || b.orderTime || 0) - (a.exitTime || a.orderTime || 0));
}

/**
 * Filters enriched trades by comprehensive filter options.
 */
export function filterTrades(trades: EnrichedTrade[], filters: TradeFilterOptions): EnrichedTrade[] {
  return trades.filter((trade) => {
    // Search
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      const matchSearch =
        trade.instrument.toLowerCase().includes(q) ||
        trade.sessionName.toLowerCase().includes(q) ||
        (trade.notes && trade.notes.toLowerCase().includes(q)) ||
        (trade.setupTag && trade.setupTag.toLowerCase().includes(q)) ||
        (trade.mistakeTag && trade.mistakeTag.toLowerCase().includes(q)) ||
        (trade.strategyId && trade.strategyId.toLowerCase().includes(q));
      if (!matchSearch) return false;
    }

    // Outcome
    const pnl = Number(trade.pnl || 0);
    if (filters.outcome === 'win' && pnl <= 0) return false;
    if (filters.outcome === 'loss' && pnl >= 0) return false;
    if (filters.outcome === 'breakeven' && Math.abs(pnl) > 0.5) return false;

    // Direction
    if (filters.direction !== 'all' && trade.type !== filters.direction) return false;

    // Session
    if (filters.sessionId !== 'all' && trade.sessionId !== filters.sessionId) return false;

    // Instrument
    if (filters.instrument !== 'all' && trade.instrument.toUpperCase() !== filters.instrument.toUpperCase()) return false;

    // Strategy
    if (filters.strategyId !== 'all' && trade.strategyId !== filters.strategyId) return false;

    // Grade
    if (filters.grade !== 'all' && trade.grade !== filters.grade) return false;

    // Mistake
    if (filters.mistakeTag !== 'all' && trade.mistakeTag !== filters.mistakeTag) return false;

    // Date Range
    if (filters.startDate) {
      const startTime = new Date(filters.startDate).getTime();
      const tradeTime = trade.entryTime || trade.orderTime || 0;
      if (tradeTime < startTime) return false;
    }
    if (filters.endDate) {
      const endTime = new Date(filters.endDate).getTime() + 86400000; // End of selected day
      const tradeTime = trade.exitTime || trade.entryTime || 0;
      if (tradeTime > endTime) return false;
    }

    return true;
  });
}

/**
 * 100% Exact Financial KPI summary calculator from closed trades.
 */
export function calculateTradeMetrics(trades: EnrichedTrade[]): MetricSummary {
  const totalTrades = trades.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakEvens: 0,
      winRate: 0,
      lossRate: 0,
      netPnL: 0,
      totalGrossProfit: 0,
      totalGrossLoss: 0,
      profitFactor: 0,
      totalR: 0,
      avgR: 0,
      avgWinDollar: 0,
      avgLossDollar: 0,
      avgWinR: 0,
      avgLossR: 0,
      expectancyR: 0,
      largestWinDollar: 0,
      largestLossDollar: 0,
      largestWinR: 0,
      largestLossR: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      payoffRatio: 0,
      avgHoldingTimeMs: 0,
      avgMaeDollar: 0,
      avgMfeDollar: 0,
      longCount: 0,
      shortCount: 0,
      longWinRate: 0,
      shortWinRate: 0,
    };
  }

  let wins = 0;
  let losses = 0;
  let breakEvens = 0;
  let totalGrossProfit = 0;
  let totalGrossLoss = 0;
  let totalPnL = 0;
  let totalR = 0;

  let totalWinR = 0;
  let totalLossR = 0;
  let largestWinDollar = 0;
  let largestLossDollar = 0;
  let largestWinR = 0;
  let largestLossR = 0;
  let totalDurationMs = 0;
  let totalMae = 0;
  let totalMfe = 0;

  let longCount = 0;
  let shortCount = 0;
  let longWins = 0;
  let shortWins = 0;

  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;

  // Chronological order for accurate streak calculations
  const chronoTrades = [...trades].sort(
    (a, b) => (a.exitTime || a.orderTime || 0) - (b.exitTime || b.orderTime || 0)
  );

  for (const trade of chronoTrades) {
    const pnl = Number(trade.pnl || 0);
    const r = trade.calculatedRMultiple;
    totalPnL += pnl;
    totalR += r;
    totalDurationMs += trade.calculatedDurationMs;
    totalMae += trade.maeDollar;
    totalMfe += trade.mfeDollar;

    if (trade.type === 'buy') {
      longCount++;
      if (pnl > 0.5) longWins++;
    } else {
      shortCount++;
      if (pnl > 0.5) shortWins++;
    }

    if (pnl > 0.5) {
      wins++;
      totalGrossProfit += pnl;
      totalWinR += r;
      if (pnl > largestWinDollar) largestWinDollar = pnl;
      if (r > largestWinR) largestWinR = r;

      currentWinStreak++;
      currentLossStreak = 0;
      if (currentWinStreak > maxConsecutiveWins) maxConsecutiveWins = currentWinStreak;
    } else if (pnl < -0.5) {
      losses++;
      totalGrossLoss += Math.abs(pnl);
      totalLossR += Math.abs(r);
      if (pnl < largestLossDollar) largestLossDollar = pnl;
      if (Math.abs(r) > largestLossR) largestLossR = Math.abs(r);

      currentLossStreak++;
      currentWinStreak = 0;
      if (currentLossStreak > maxConsecutiveLosses) maxConsecutiveLosses = currentLossStreak;
    } else {
      breakEvens++;
      currentWinStreak = 0;
      currentLossStreak = 0;
    }
  }

  const winRate = Number(((wins / totalTrades) * 100).toFixed(1));
  const lossRate = Number(((losses / totalTrades) * 100).toFixed(1));
  const profitFactor = totalGrossLoss > 0
    ? Number((totalGrossProfit / totalGrossLoss).toFixed(2))
    : totalGrossProfit > 0 ? 99.9 : 0;

  const avgR = Number((totalR / totalTrades).toFixed(2));
  const avgWinDollar = wins > 0 ? Number((totalGrossProfit / wins).toFixed(2)) : 0;
  const avgLossDollar = losses > 0 ? Number((totalGrossLoss / losses).toFixed(2)) : 0;
  const avgWinR = wins > 0 ? Number((totalWinR / wins).toFixed(2)) : 0;
  const avgLossR = losses > 0 ? Number((totalLossR / losses).toFixed(2)) : 0;
  const payoffRatio = avgLossDollar > 0 ? Number((avgWinDollar / avgLossDollar).toFixed(2)) : avgWinDollar > 0 ? 99 : 1;

  // Expectancy (R) = (WinRate% * AvgWinR) - (LossRate% * AvgLossR)
  const expectancyR = Number(((winRate / 100) * avgWinR - (lossRate / 100) * avgLossR).toFixed(2));

  const longWinRate = longCount > 0 ? Number(((longWins / longCount) * 100).toFixed(1)) : 0;
  const shortWinRate = shortCount > 0 ? Number(((shortWins / shortCount) * 100).toFixed(1)) : 0;

  return {
    totalTrades,
    wins,
    losses,
    breakEvens,
    winRate,
    lossRate,
    netPnL: Number(totalPnL.toFixed(2)),
    totalGrossProfit: Number(totalGrossProfit.toFixed(2)),
    totalGrossLoss: Number(totalGrossLoss.toFixed(2)),
    profitFactor,
    totalR: Number(totalR.toFixed(2)),
    avgR,
    avgWinDollar,
    avgLossDollar,
    avgWinR,
    avgLossR,
    expectancyR,
    largestWinDollar: Number(largestWinDollar.toFixed(2)),
    largestLossDollar: Number(largestLossDollar.toFixed(2)),
    largestWinR: Number(largestWinR.toFixed(2)),
    largestLossR: Number(largestLossR.toFixed(2)),
    maxConsecutiveWins,
    maxConsecutiveLosses,
    payoffRatio,
    avgHoldingTimeMs: Math.round(totalDurationMs / totalTrades),
    avgMaeDollar: Number((totalMae / totalTrades).toFixed(2)),
    avgMfeDollar: Number((totalMfe / totalTrades).toFixed(2)),
    longCount,
    shortCount,
    longWinRate,
    shortWinRate,
  };
}

/**
 * Formats duration milliseconds into human-readable string.
 */
export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return 'Instant';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Formats timestamp to localized compact date-time string.
 */
export function formatTradeTime(timestamp?: number): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
