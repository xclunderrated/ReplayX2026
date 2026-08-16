import type { Candle, Session, Trade } from '../../store/useSimulatorStore';
import { computeTradePnL } from '../../lib/orders';
import { aggregateCandles, expandSubMinuteCandlesFromM1, getTimeframeSeconds } from '../../lib/timeframe';

export type ScopeValue = 'all' | 'current' | string;

export type EnrichedTrade = Trade & {
  sessionId: string;
  sessionName: string;
  instrument: string;
  timeframe: string;
  openedAt: number;
  closedAt: number;
  holdingMs: number;
  pnlValue: number;
  mae?: number;
  mfe?: number;
};

export type SessionSummary = {
  id: string;
  name: string;
  instrument: string;
  timeframe: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  returnPct: number;
  avgPnl: number;
  profitFactor: number;
};

export type TradeGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type GradedTrade = EnrichedTrade & {
  grade: TradeGrade | null;
  gradeReason: string;
  rMultiple: number | null;
};

export type HourlySlot = {
  hour: number;
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  avgPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
};

export type StreakInfo = {
  type: 'win' | 'loss';
  length: number;
  totalPnl: number;
  startIndex: number;
  endIndex: number;
  startDate: string;
  endDate: string;
};

export type CalendarDay = {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  winRate: number;
};

export type DrawdownPeriod = {
  startIndex: number;
  endIndex: number;
  peakEquity: number;
  troughEquity: number;
  depth: number;
  depthPct: number;
  durationTrades: number;
  recovered: boolean;
};

export type SetupStat = {
  tag: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  avgPnl: number;
  profitFactor: number;
  avgR: number;
};

export type DisciplineStat = {
  tag: string;
  category: 'rule' | 'mistake' | 'unclassified';
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  avgPnl: number;
};

export type SessionDetailedStats = {
  id: string;
  name: string;
  instrument: string;
  timeframe: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  returnPct: number;
  avgPnl: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpe: number;
  sortino: number;
  expectancy: number;
  avgHoldMs: number;
  bestTrade: number;
  worstTrade: number;
  avgWin: number;
  avgLoss: number;
  payoffRatio: number;
  longestWinStreak: number;
  longestLossStreak: number;
};

export function safePercent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

export function getTradeOpenTime(trade: Trade) {
  return trade.entryTime ?? trade.orderTime;
}

export function getTradeCloseTime(trade: Trade) {
  return trade.exitTime ?? trade.entryTime ?? trade.orderTime;
}

export function buildSessionSummary(session: Session): SessionSummary {
  const closedTrades = session.trades.filter((trade) => trade.status === 'closed');
  const wins = closedTrades.filter((trade) => (trade.pnl ?? 0) > 0);
  const losses = closedTrades.filter((trade) => (trade.pnl ?? 0) <= 0);
  const netPnl = closedTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const grossProfit = wins.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0));

  return {
    id: session.id,
    name: session.name,
    instrument: session.instrument,
    timeframe: session.timeframe,
    trades: closedTrades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: safePercent(wins.length, closedTrades.length),
    netPnl,
    returnPct: safePercent(netPnl, session.initialBalance),
    avgPnl: closedTrades.length ? netPnl / closedTrades.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
  };
}

/**
 * Structural superset of `Session` (and `ArchivedSession`) — only the fields
 * analytics actually read. Lets archived (deleted) session snapshots flow
 * through the same pipeline as live sessions.
 */
export type SessionLike = Pick<
  Session,
  'id' | 'name' | 'trades' | 'instrument' | 'timeframe' | 'initialBalance' | 'balance'
>;

const TIMEFRAME_INTERVALS_MS: [number, string][] = [
  [60 * 1000, '1m'],
  [5 * 60 * 1000, '5m'],
  [15 * 60 * 1000, '15m'],
  [30 * 60 * 1000, '30m'],
  [60 * 60 * 1000, '1h'],
  [4 * 60 * 60 * 1000, '4h'],
  [24 * 60 * 60 * 1000, '1d'],
];

/**
 * Resolves the timeframe a trade was actually executed on. Prefer the stamp
 * written at close time (`trade.timeframe`); for legacy trades without one,
 * infer it from the most common interval between the stored replay candles —
 * the trade log stays correct even if the session's timeframe was changed
 * after the trade closed. Falls back to the session's timeframe.
 */
function resolveTradeTimeframe(trade: {
  timeframe?: string;
  candles?: { timestamp: number }[];
}, sessionTimeframe: string): string {
  if (trade.timeframe) return trade.timeframe;

  const candles = trade.candles;
  if (candles && candles.length >= 2) {
    const counts = new Map<number, number>();
    let bestInterval: number | null = null;
    let bestCount = 0;
    for (let i = 1; i < Math.min(candles.length, 500); i++) {
      const interval = candles[i].timestamp - candles[i - 1].timestamp;
      if (interval <= 0) continue;
      const count = (counts.get(interval) ?? 0) + 1;
      counts.set(interval, count);
      if (count > bestCount) {
        bestCount = count;
        bestInterval = interval;
      }
    }
    if (bestInterval !== null) {
      for (const [intervalMs, label] of TIMEFRAME_INTERVALS_MS) {
        if (Math.abs(bestInterval - intervalMs) / intervalMs <= 0.02) return label;
      }
    }
  }

  return sessionTimeframe;
}

export function flattenClosedTrades(sessions: SessionLike[]): EnrichedTrade[] {
  return sessions
    .flatMap((session) =>
      session.trades
        .filter((trade) => trade.status === 'closed')
        .map((trade) => {
          const openedAt = getTradeOpenTime(trade);
          const closedAt = getTradeCloseTime(trade);
          return {
            ...trade,
            sessionId: session.id,
            sessionName: session.name,
            instrument: session.instrument,
            timeframe: resolveTradeTimeframe(trade, session.timeframe),
            openedAt,
            closedAt,
            holdingMs: Math.max(0, closedAt - openedAt),
            pnlValue: trade.pnl ?? 0,
          };
        }),
    )
    .sort((a, b) => a.closedAt - b.closedAt);
}

export function buildSessionComparison(sessions: Session[]) {
  const perSessionClosedTrades = sessions.map((session) =>
    session.trades
      .filter((trade) => trade.status === 'closed')
      .sort((a, b) => getTradeCloseTime(a) - getTradeCloseTime(b)),
  );

  const maxTrades = Math.max(...perSessionClosedTrades.map((trades) => trades.length), 0);

  return Array.from({ length: maxTrades + 1 }, (_, index) => {
    const point: Record<string, string | number> = { trade: index };
    sessions.forEach((session, sessionIndex) => {
      const sessionTrades = perSessionClosedTrades[sessionIndex];
      let balance = session.initialBalance;
      for (let i = 0; i < Math.min(index, sessionTrades.length); i += 1) {
        balance += sessionTrades[i].pnl ?? 0;
      }
      point[session.id] = balance;
    });
    return point;
  });
}

export type RiskSource = 'sl' | 'riskDollar' | 'riskPercent' | 'none';

export type RiskInfo = {
  riskUsd: number;
  source: RiskSource;
};

/**
 * Computes the real dollar risk of a trade:
 *   1. Stop-loss distance × size × multiplier (converted to USD, matching `computeTradePnL`)
 *   2. Explicit `riskDollar` when no SL is present
 *   3. `riskPercent` of the session balance when no explicit dollar risk is present
 * Returns `riskUsd: 0` (source 'none') when no real risk information exists —
 * never invents an estimate.
 */
export function computeTradeRisk(trade: EnrichedTrade, session?: SessionLike): RiskInfo {
  const entry = trade.entryPrice ?? trade.limitPrice;

  if (entry && trade.sl && trade.size && trade.size > 0) {
    const riskAtSl = Math.abs(computeTradePnL(trade.type, entry, trade.sl, trade.size, trade.instrument));
    if (Number.isFinite(riskAtSl) && riskAtSl > 0) {
      return { riskUsd: riskAtSl, source: 'sl' };
    }
  }

  if (trade.riskDollar && trade.riskDollar > 0) {
    return { riskUsd: trade.riskDollar, source: 'riskDollar' };
  }

  if (trade.riskPercent && trade.riskPercent > 0 && session && session.balance > 0) {
    return { riskUsd: session.balance * (trade.riskPercent / 100), source: 'riskPercent' };
  }

  return { riskUsd: 0, source: 'none' };
}

export function computeTradeRMultiple(trade: EnrichedTrade, session?: SessionLike): number | null {
  const { riskUsd } = computeTradeRisk(trade, session);
  if (riskUsd <= 0) return null;
  return trade.pnlValue / riskUsd;
}

function gradeTrade(trade: EnrichedTrade, avgHoldMs: number, session?: SessionLike): GradedTrade {
  const rawR = computeTradeRMultiple(trade, session);
  const r = rawR === null ? null : Math.round(rawR * 1e6) / 1e6;
  let grade: TradeGrade | null;
  let gradeReason: string;

  if (r === null) {
    grade = null;
    gradeReason = 'No stop loss recorded — R unavailable';
  } else if (r >= 3) {
    grade = 'A';
    gradeReason = 'Exceptional R-multiple (3R+)';
  } else if (r >= 2) {
    grade = 'A';
    gradeReason = 'Strong R-multiple (2R+)';
  } else if (r >= 1) {
    grade = 'B';
    gradeReason = 'Solid risk-reward achieved (1R+)';
  } else if (r >= 0.5) {
    grade = 'C';
    gradeReason = 'Modest gain, below 1R target';
  } else if (r >= 0) {
    grade = 'D';
    gradeReason = 'Break-even or marginal profit';
  } else if (r >= -1) {
    grade = 'D';
    gradeReason = 'Controlled loss within 1R';
  } else {
    grade = 'F';
    gradeReason = `Excessive loss (${r.toFixed(1)}R)`;
  }

  // Adjust for hold time anomalies
  if (grade !== null && avgHoldMs > 0 && trade.holdingMs > avgHoldMs * 3 && r !== null && r < 0.5) {
    if (grade !== 'F') {
      grade = grade === 'D' ? 'F' : ((String.fromCharCode(grade.charCodeAt(0) + 1)) as TradeGrade);
      gradeReason += ' — overheld';
    }
  }

  return { ...trade, grade, gradeReason, rMultiple: r };
}

function computeHourlySlots(trades: EnrichedTrade[]): HourlySlot[] {
  const slots: HourlySlot[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${hour.toString().padStart(2, '0')}:00`,
    trades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    netPnl: 0,
    avgPnl: 0,
    grossProfit: 0,
    grossLoss: 0,
    profitFactor: 0,
    bestTrade: 0,
    worstTrade: 0,
  }));

  trades.forEach((trade) => {
    const hour = new Date(trade.openedAt).getHours();
    const slot = slots[hour];
    slot.trades += 1;
    slot.netPnl += trade.pnlValue;
    if (trade.pnlValue > 0) {
      slot.wins += 1;
      slot.grossProfit += trade.pnlValue;
      slot.bestTrade = Math.max(slot.bestTrade, trade.pnlValue);
    } else {
      slot.losses += 1;
      slot.grossLoss += Math.abs(trade.pnlValue);
      slot.worstTrade = Math.min(slot.worstTrade, trade.pnlValue);
    }
  });

  slots.forEach((slot) => {
    slot.winRate = safePercent(slot.wins, slot.trades);
    slot.avgPnl = slot.trades ? slot.netPnl / slot.trades : 0;
    slot.profitFactor = slot.grossLoss > 0 ? slot.grossProfit / slot.grossLoss : slot.grossProfit > 0 ? Infinity : 0;
  });

  return slots;
}

function computeStreaks(trades: EnrichedTrade[]): StreakInfo[] {
  if (trades.length === 0) return [];

  const streaks: StreakInfo[] = [];
  let currentType: 'win' | 'loss' = trades[0].pnlValue > 0 ? 'win' : 'loss';
  let startIndex = 0;
  let totalPnl = trades[0].pnlValue;

  for (let i = 1; i <= trades.length; i++) {
    const tradeType = i < trades.length ? (trades[i].pnlValue > 0 ? 'win' : 'loss') : null;

    if (tradeType !== currentType || i === trades.length) {
      streaks.push({
        type: currentType,
        length: i - startIndex,
        totalPnl,
        startIndex,
        endIndex: i - 1,
        startDate: new Date(trades[startIndex].closedAt).toLocaleDateString(),
        endDate: new Date(trades[i - 1].closedAt).toLocaleDateString(),
      });

      if (i < trades.length) {
        currentType = tradeType!;
        startIndex = i;
        totalPnl = trades[i].pnlValue;
      }
    } else {
      totalPnl += trades[i].pnlValue;
    }
  }

  return streaks;
}

function computeWinRateAfterStreaks(trades: EnrichedTrade[]): Array<{ streakLength: number; type: 'win' | 'loss'; nextWinRate: number; sample: number }> {
  const results: Array<{ streakLength: number; type: 'win' | 'loss'; nextWinRate: number; sample: number }> = [];

  for (const type of ['win', 'loss'] as const) {
    for (let targetLen = 1; targetLen <= 5; targetLen++) {
      let streak = 0;
      let nextWins = 0;
      let nextTotal = 0;

      for (let i = 0; i < trades.length; i++) {
        const isWin = trades[i].pnlValue > 0;

        if ((type === 'win' && isWin) || (type === 'loss' && !isWin)) {
          streak++;
        } else {
          if (streak >= targetLen) {
            nextTotal++;
            if (isWin) nextWins++;
          }
          streak = type === 'win' && !isWin ? 0 : (type === 'loss' && isWin ? 0 : 1);
          if ((type === 'win' && isWin) || (type === 'loss' && !isWin)) {
            streak = 1;
          } else {
            streak = 0;
          }
        }
      }

      results.push({
        streakLength: targetLen,
        type,
        nextWinRate: safePercent(nextWins, nextTotal),
        sample: nextTotal,
      });
    }
  }

  return results;
}

function computeCalendarData(trades: EnrichedTrade[]): CalendarDay[] {
  const map = new Map<string, { pnl: number; trades: number; wins: number }>();

  trades.forEach((trade) => {
    const date = new Date(trade.closedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const day = map.get(key) ?? { pnl: 0, trades: 0, wins: 0 };
    day.pnl += trade.pnlValue;
    day.trades += 1;
    if (trade.pnlValue > 0) day.wins += 1;
    map.set(key, day);
  });

  return Array.from(map.entries())
    .map(([date, data]) => ({
      date,
      ...data,
      winRate: safePercent(data.wins, data.trades),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function computeDrawdownPeriods(equityCurve: Array<{ balance: number }>): DrawdownPeriod[] {
  const periods: DrawdownPeriod[] = [];
  let peak = equityCurve[0]?.balance ?? 0;
  let inDrawdown = false;
  let periodStart = 0;
  let trough = peak;

  for (let i = 0; i < equityCurve.length; i++) {
    const balance = equityCurve[i].balance;

    if (balance >= peak) {
      if (inDrawdown) {
        periods.push({
          startIndex: periodStart,
          endIndex: i,
          peakEquity: peak,
          troughEquity: trough,
          depth: peak - trough,
          depthPct: peak > 0 ? ((peak - trough) / peak) * 100 : 0,
          durationTrades: i - periodStart,
          recovered: true,
        });
        inDrawdown = false;
      }
      peak = balance;
      trough = balance;
    } else {
      if (!inDrawdown) {
        inDrawdown = true;
        periodStart = i;
      }
      trough = Math.min(trough, balance);
    }
  }

  if (inDrawdown) {
    periods.push({
      startIndex: periodStart,
      endIndex: equityCurve.length - 1,
      peakEquity: peak,
      troughEquity: trough,
      depth: peak - trough,
      depthPct: peak > 0 ? ((peak - trough) / peak) * 100 : 0,
      durationTrades: equityCurve.length - 1 - periodStart,
      recovered: false,
    });
  }

  return periods.sort((a, b) => b.depth - a.depth);
}

function computeTiltScore(trades: EnrichedTrade[]): { score: number; incidents: number; description: string } {
  if (trades.length < 3) return { score: 0, incidents: 0, description: 'Not enough data' };

  let incidents = 0;
  let totalChecks = 0;

  for (let i = 2; i < trades.length; i++) {
    const prevTrade = trades[i - 1];
    const currTrade = trades[i];

    if (prevTrade.pnlValue < 0 && currTrade.size > prevTrade.size * 1.3) {
      incidents++;
    }
    if (prevTrade.pnlValue < 0) {
      totalChecks++;
    }
  }

  const score = totalChecks > 0 ? (incidents / totalChecks) * 100 : 0;
  const description = score === 0
    ? 'No tilt detected'
    : score < 15
      ? 'Minor size increases after losses'
      : score < 30
        ? 'Moderate tilt behavior'
        : 'Significant tilt — sizing up after losses';

  return { score, incidents, description };
}

function computeOvertradingScore(trades: EnrichedTrade[], sessions: SessionLike[]): { score: number; avgTradesPerSession: number; description: string } {
  if (sessions.length === 0) return { score: 0, avgTradesPerSession: 0, description: 'No sessions' };

  const perSession = sessions.map((s) => s.trades.filter((t) => t.status === 'closed').length);
  const avg = perSession.reduce((a, b) => a + b, 0) / perSession.length;
  const max = Math.max(...perSession);
  const score = avg > 0 ? ((max - avg) / avg) * 100 : 0;

  const description = score < 30
    ? 'Consistent trade frequency'
    : score < 60
      ? 'Some sessions have elevated trade counts'
      : 'High variance in trades per session — possible overtrading';

  return { score: Math.min(100, score), avgTradesPerSession: avg, description };
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
    sumY2 += ys[i] * ys[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return denominator > 0 ? numerator / denominator : 0;
}

function computeSessionDetailedStats(session: SessionLike): SessionDetailedStats {
  const closed = session.trades.filter((t) => t.status === 'closed');
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) <= 0);
  const netPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossProfit = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;

  let equity = session.initialBalance;
  let peak = session.initialBalance;
  let maxDD = 0;
  let maxDDPct = 0;
  let winStreak = 0;
  let lossStreak = 0;
  let bestWS = 0;
  let bestLS = 0;

  const returns: number[] = [];

  closed.forEach((trade) => {
    const pnl = trade.pnl ?? 0;
    equity += pnl;
    peak = Math.max(peak, equity);
    const dd = peak - equity;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    maxDD = Math.max(maxDD, dd);
    maxDDPct = Math.max(maxDDPct, ddPct);
    returns.push(pnl / Math.max(session.initialBalance, 1));

    if (pnl > 0) {
      winStreak++;
      lossStreak = 0;
      bestWS = Math.max(bestWS, winStreak);
    } else {
      lossStreak++;
      winStreak = 0;
      bestLS = Math.max(bestLS, lossStreak);
    }
  });

  const avgRet = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgRet, 2), 0) / (returns.length - 1))
    : 0;
  const sharpe = stdDev > 0 ? (avgRet * Math.sqrt(252)) / stdDev : 0;
  const downside = returns.filter((r) => r < 0);
  const downDev = downside.length > 1
    ? Math.sqrt(downside.reduce((s, r) => s + Math.pow(r, 2), 0) / (downside.length - 1))
    : 0;
  const sortino = downDev > 0 ? (avgRet * Math.sqrt(252)) / downDev : 0;

  const avgHoldMs = closed.length
    ? closed.reduce((s, t) => {
        const open = t.entryTime ?? t.orderTime;
        const close = t.exitTime ?? t.entryTime ?? t.orderTime;
        return s + Math.max(0, close - open);
      }, 0) / closed.length
    : 0;

  const bestTrade = closed.reduce((best, t) => Math.max(best, t.pnl ?? 0), 0);
  const worstTrade = closed.reduce((worst, t) => Math.min(worst, t.pnl ?? 0), 0);

  return {
    id: session.id,
    name: session.name,
    instrument: session.instrument,
    timeframe: session.timeframe,
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: safePercent(wins.length, closed.length),
    netPnl,
    returnPct: safePercent(netPnl, session.initialBalance),
    avgPnl: closed.length ? netPnl / closed.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    sharpe,
    sortino,
    expectancy: closed.length ? netPnl / closed.length : 0,
    avgHoldMs,
    bestTrade,
    worstTrade,
    avgWin,
    avgLoss,
    payoffRatio: avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0,
    longestWinStreak: bestWS,
    longestLossStreak: bestLS,
  };
}

export function computeAnalytics(closedTrades: EnrichedTrade[], sessions: SessionLike[]) {
  const totalTrades = closedTrades.length;
  const winningTrades = closedTrades.filter((trade) => trade.pnlValue > 0);
  const losingTrades = closedTrades.filter((trade) => trade.pnlValue <= 0);
  const grossProfit = winningTrades.reduce((sum, trade) => sum + trade.pnlValue, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.pnlValue, 0));
  const netPnl = grossProfit - grossLoss;
  const totalStartingCapital = sessions.reduce((sum, session) => sum + session.initialBalance, 0);
  const returnPct = safePercent(netPnl, totalStartingCapital);
  const winRate = safePercent(winningTrades.length, totalTrades);
  const averageWin = winningTrades.length ? grossProfit / winningTrades.length : 0;
  const averageLoss = losingTrades.length ? grossLoss / losingTrades.length : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const expectancy = totalTrades ? netPnl / totalTrades : 0;
  const payoffRatio = averageLoss > 0 ? averageWin / averageLoss : averageWin > 0 ? Infinity : 0;

  let equity = totalStartingCapital;
  let peak = totalStartingCapital;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  const drawdownTimeline: Array<{ index: number; label: string; drawdown: number; drawdownPct: number }> = [];
  const equityCurve = [
    {
      index: 0,
      label: 'Start',
      balance: totalStartingCapital,
      drawdown: 0,
      drawdownPct: 0,
      pnl: 0,
      sessionName: 'Starting balance',
    },
  ];

  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let bestWinStreak = 0;
  let worstLossStreak = 0;

  closedTrades.forEach((trade, index) => {
    equity += trade.pnlValue;
    peak = Math.max(peak, equity);
    const drawdown = peak - equity;
    const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);

    if (trade.pnlValue > 0) {
      currentWinStreak += 1;
      currentLossStreak = 0;
    } else {
      currentLossStreak += 1;
      currentWinStreak = 0;
    }
    bestWinStreak = Math.max(bestWinStreak, currentWinStreak);
    worstLossStreak = Math.max(worstLossStreak, currentLossStreak);

    const label = new Date(trade.closedAt).toLocaleDateString();
    equityCurve.push({
      index: index + 1,
      label,
      balance: equity,
      drawdown,
      drawdownPct,
      pnl: trade.pnlValue,
      sessionName: trade.sessionName,
    });

    drawdownTimeline.push({ index: index + 1, label, drawdown, drawdownPct });
  });

  const averageHoldingMs = totalTrades
    ? closedTrades.reduce((sum, trade) => sum + trade.holdingMs, 0) / totalTrades
    : 0;

  const tradingDays = 252;
  const dailyReturns = closedTrades.map((trade) => trade.pnlValue / Math.max(totalStartingCapital, 1));
  const avgDailyReturn = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const stdDev =
    dailyReturns.length > 1
      ? Math.sqrt(dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgDailyReturn, 2), 0) / (dailyReturns.length - 1))
      : 0;
  const sharpeRatio = stdDev > 0 ? (avgDailyReturn * Math.sqrt(tradingDays)) / stdDev : 0;

  const downsideReturns = dailyReturns.filter((ret) => ret < 0);
  const downsideDev =
    downsideReturns.length > 1
      ? Math.sqrt(downsideReturns.reduce((sum, ret) => sum + Math.pow(ret, 2), 0) / (downsideReturns.length - 1))
      : 0;
  const sortinoRatio = downsideDev > 0 ? (avgDailyReturn * Math.sqrt(tradingDays)) / downsideDev : 0;
  const calmarRatio = maxDrawdownPct > 0 ? returnPct / maxDrawdownPct : 0;
  const recoveryFactor = maxDrawdown > 0 ? netPnl / maxDrawdown : 0;

  const gradedTrades = closedTrades.map((trade) =>
    gradeTrade(trade, averageHoldingMs, sessions.find((s) => s.id === trade.sessionId)),
  );
  const rKnown = gradedTrades
    .map((t) => t.rMultiple)
    .filter((r): r is number => r !== null);
  const riskCoverage = totalTrades > 0 ? (rKnown.length / totalTrades) * 100 : 0;

  const avgRMultiple = rKnown.length > 0 ? rKnown.reduce((a, b) => a + b, 0) / rKnown.length : 0;
  const rBuckets = {
    '3R+': rKnown.filter((r) => r >= 3).length,
    '2R-3R': rKnown.filter((r) => r >= 2 && r < 3).length,
    '1R-2R': rKnown.filter((r) => r >= 1 && r < 2).length,
    '0-1R': rKnown.filter((r) => r >= 0 && r < 1).length,
    Loss: rKnown.filter((r) => r < 0).length,
    'No SL': totalTrades - rKnown.length,
  };

  let longestConsecutiveWins = 0;
  let longestConsecutiveLosses = 0;
  let currentConsecutiveWins = 0;
  let currentConsecutiveLosses = 0;
  closedTrades.forEach((trade) => {
    if (trade.pnlValue > 0) {
      currentConsecutiveWins += 1;
      currentConsecutiveLosses = 0;
      longestConsecutiveWins = Math.max(longestConsecutiveWins, currentConsecutiveWins);
    } else {
      currentConsecutiveLosses += 1;
      currentConsecutiveWins = 0;
      longestConsecutiveLosses = Math.max(longestConsecutiveLosses, currentConsecutiveLosses);
    }
  });

  const winRateDecimal = winRate / 100;
  const avgWinRatio = averageWin / Math.abs(averageLoss || 1);
  const kellyPercent = winRateDecimal - (1 - winRateDecimal) / avgWinRatio;

  const monthlyMap = new Map<string, { month: string; pnl: number; trades: number; wins: number }>();
  const dailyMap = new Map<string, { date: string; pnl: number; trades: number; wins: number }>();
  closedTrades.forEach((trade) => {
    const date = new Date(trade.closedAt);
    const monthKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    const dateKey = date.toLocaleDateString();

    const monthRow = monthlyMap.get(monthKey) ?? { month: monthKey, pnl: 0, trades: 0, wins: 0 };
    monthRow.pnl += trade.pnlValue;
    monthRow.trades += 1;
    if (trade.pnlValue > 0) monthRow.wins += 1;
    monthlyMap.set(monthKey, monthRow);

    const dayRow = dailyMap.get(dateKey) ?? { date: dateKey, pnl: 0, trades: 0, wins: 0 };
    dayRow.pnl += trade.pnlValue;
    dayRow.trades += 1;
    if (trade.pnlValue > 0) dayRow.wins += 1;
    dailyMap.set(dateKey, dayRow);
  });

  const monthlyPerformance = Array.from(monthlyMap.values()).slice(-12);
  const dailyPerformance = Array.from(dailyMap.values()).slice(-20);

  const directionStats = ['buy', 'sell'].map((direction) => {
    const trades = closedTrades.filter((trade) => trade.type === direction);
    const wins = trades.filter((trade) => trade.pnlValue > 0);
    const net = trades.reduce((sum, trade) => sum + trade.pnlValue, 0);
    return {
      direction: direction === 'buy' ? 'Long' : 'Short',
      trades: trades.length,
      winRate: safePercent(wins.length, trades.length),
      net,
      avg: trades.length ? net / trades.length : 0,
    };
  });

  const instrumentMap = new Map<string, { instrument: string; pnl: number; trades: number; wins: number }>();
  closedTrades.forEach((trade) => {
    const row = instrumentMap.get(trade.instrument) ?? { instrument: trade.instrument, pnl: 0, trades: 0, wins: 0 };
    row.pnl += trade.pnlValue;
    row.trades += 1;
    if (trade.pnlValue > 0) row.wins += 1;
    instrumentMap.set(trade.instrument, row);
  });

  const instrumentBreakdown = Array.from(instrumentMap.values())
    .map((item) => ({ ...item, winRate: safePercent(item.wins, item.trades) }))
    .sort((a, b) => b.pnl - a.pnl);

  const bestTrade = closedTrades.reduce<EnrichedTrade | null>((best, trade) => {
    if (!best || trade.pnlValue > best.pnlValue) return trade;
    return best;
  }, null);

  const worstTrade = closedTrades.reduce<EnrichedTrade | null>((worst, trade) => {
    if (!worst || trade.pnlValue < worst.pnlValue) return trade;
    return worst;
  }, null);

  const outcomeDistribution = [
    { bucket: '< -200', count: 0 },
    { bucket: '-200 to -50', count: 0 },
    { bucket: '-50 to 0', count: 0 },
    { bucket: '0 to 50', count: 0 },
    { bucket: '50 to 200', count: 0 },
    { bucket: '> 200', count: 0 },
  ];

  closedTrades.forEach((trade) => {
    const value = trade.pnlValue;
    if (value < -200) outcomeDistribution[0].count += 1;
    else if (value < -50) outcomeDistribution[1].count += 1;
    else if (value < 0) outcomeDistribution[2].count += 1;
    else if (value < 50) outcomeDistribution[3].count += 1;
    else if (value < 200) outcomeDistribution[4].count += 1;
    else outcomeDistribution[5].count += 1;
  });

  const timingByHourMap = new Map<number, { hour: number; trades: number; pnl: number; winRate: number }>();
  for (let hour = 0; hour < 24; hour += 1) {
    timingByHourMap.set(hour, { hour, trades: 0, pnl: 0, winRate: 0 });
  }
  closedTrades.forEach((trade) => {
    const hour = new Date(trade.openedAt).getHours();
    const row = timingByHourMap.get(hour);
    if (!row) return;
    row.trades += 1;
    row.pnl += trade.pnlValue;
  });
  const timingByHour = Array.from(timingByHourMap.values()).map((row) => {
    const hourTrades = closedTrades.filter((trade) => new Date(trade.openedAt).getHours() === row.hour);
    const wins = hourTrades.filter((trade) => trade.pnlValue > 0).length;
    return { ...row, winRate: safePercent(wins, hourTrades.length), label: `${row.hour}:00` };
  });

  const rollingExpectancy = closedTrades.map((trade, index) => {
    const windowStart = Math.max(0, index - 9);
    const slice = closedTrades.slice(windowStart, index + 1);
    const value = slice.reduce((sum, row) => sum + row.pnlValue, 0) / slice.length;
    return {
      index: index + 1,
      expectancy: value,
      pnl: trade.pnlValue,
      label: new Date(trade.closedAt).toLocaleDateString(),
    };
  });

  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeekEdge = weekdayLabels.map((label, weekday) => {
    const dayTrades = closedTrades.filter((trade) => new Date(trade.closedAt).getDay() === weekday);
    const wins = dayTrades.filter((trade) => trade.pnlValue > 0).length;
    const net = dayTrades.reduce((sum, trade) => sum + trade.pnlValue, 0);
    return {
      weekday,
      label,
      trades: dayTrades.length,
      winRate: safePercent(wins, dayTrades.length),
      avgPnl: dayTrades.length ? net / dayTrades.length : 0,
      net,
    };
  });

  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const seasonalityHeatmap = monthLabels.flatMap((month, monthIndex) => {
    return weekdayLabels.map((weekdayLabel, weekday) => {
      const bucket = closedTrades.filter((trade) => {
        const date = new Date(trade.closedAt);
        return date.getMonth() === monthIndex && date.getDay() === weekday;
      });
      const wins = bucket.filter((trade) => trade.pnlValue > 0).length;
      const net = bucket.reduce((sum, trade) => sum + trade.pnlValue, 0);
      return {
        id: `${month}-${weekdayLabel}`,
        month,
        monthIndex,
        weekday: weekdayLabel,
        weekdayIndex: weekday,
        trades: bucket.length,
        net,
        winRate: safePercent(wins, bucket.length),
      };
    });
  });

  const durationValues = closedTrades.map((trade) => trade.holdingMs).filter((value) => value >= 0).sort((a, b) => a - b);
  const q = (quantile: number) => {
    if (durationValues.length === 0) return 0;
    const idx = Math.min(durationValues.length - 1, Math.floor((durationValues.length - 1) * quantile));
    return durationValues[idx];
  };
  const durationDistribution = {
    min: durationValues[0] ?? 0,
    q1: q(0.25),
    median: q(0.5),
    q3: q(0.75),
    max: durationValues[durationValues.length - 1] ?? 0,
  };

  const durationBuckets = [
    { label: '<15m', maxMs: 15 * 60 * 1000 },
    { label: '15m-1h', maxMs: 60 * 60 * 1000 },
    { label: '1h-4h', maxMs: 4 * 60 * 60 * 1000 },
    { label: '4h-24h', maxMs: 24 * 60 * 60 * 1000 },
    { label: '>24h', maxMs: Number.POSITIVE_INFINITY },
  ];
  const durationBucketDistribution = durationBuckets.map((bucket, index) => {
    const min = index === 0 ? 0 : durationBuckets[index - 1].maxMs;
    const trades = closedTrades.filter((trade) => trade.holdingMs >= min && trade.holdingMs < bucket.maxMs);
    return {
      bucket: bucket.label,
      trades: trades.length,
      avgPnl: trades.length ? trades.reduce((sum, trade) => sum + trade.pnlValue, 0) / trades.length : 0,
    };
  });

  const maeMfeScatter = closedTrades.map((trade, index) => {
    const risk = computeTradeRisk(trade, sessions.find((s) => s.id === trade.sessionId));
    const rMultiple = risk.riskUsd > 0 ? trade.pnlValue / risk.riskUsd : null;

    return {
      index: index + 1,
      mae: trade.mae ?? null,
      mfe: trade.mfe ?? null,
      pnl: trade.pnlValue,
      rMultiple,
      direction: trade.type,
    };
  });

  let cumulativeR = 0;
  const cumulativeRMultipleCurve = closedTrades.map((trade, index) => {
    const risk = computeTradeRisk(trade, sessions.find((s) => s.id === trade.sessionId));
    const r = risk.riskUsd > 0 ? trade.pnlValue / risk.riskUsd : null;
    if (r !== null) cumulativeR += r;
    return {
      index: index + 1,
      rMultiple: r,
      cumulativeR: r === null ? null : cumulativeR,
      date: new Date(trade.closedAt).toLocaleDateString(),
    };
  });

  const regimeTemplates = [
    { key: 'asia', label: 'Asia session', trades: 0, wins: 0, net: 0 },
    { key: 'europe', label: 'Europe session', trades: 0, wins: 0, net: 0 },
    { key: 'us', label: 'US session', trades: 0, wins: 0, net: 0 },
    { key: 'overlap', label: 'US/EU overlap', trades: 0, wins: 0, net: 0 },
  ];
  const regimeMap = new Map(regimeTemplates.map((item) => [item.key, { ...item }]));

  closedTrades.forEach((trade) => {
    const hour = new Date(trade.openedAt).getUTCHours();
    const regimeKey =
      hour >= 6 && hour < 11 ? 'europe' :
      hour >= 12 && hour < 17 ? 'overlap' :
      hour >= 17 && hour < 22 ? 'us' :
      'asia';

    const row = regimeMap.get(regimeKey);
    if (!row) return;
    row.trades += 1;
    row.net += trade.pnlValue;
    if (trade.pnlValue > 0) row.wins += 1;
  });

  const regimeSplit = Array.from(regimeMap.values()).map((row) => ({
    ...row,
    winRate: safePercent(row.wins, row.trades),
    avgPnl: row.trades ? row.net / row.trades : 0,
  }));

  // ── NEW: Extended analytics ──
  const hourlySlots = computeHourlySlots(closedTrades);

  const activeHours = hourlySlots.filter((s) => s.trades > 0);
  const bestHours = [...activeHours].sort((a, b) => b.netPnl - a.netPnl).slice(0, 3);
  const worstHours = [...activeHours].sort((a, b) => a.netPnl - b.netPnl).slice(0, 3);

  const gradeDistribution = {
    A: gradedTrades.filter((t) => t.grade === 'A').length,
    B: gradedTrades.filter((t) => t.grade === 'B').length,
    C: gradedTrades.filter((t) => t.grade === 'C').length,
    D: gradedTrades.filter((t) => t.grade === 'D').length,
    F: gradedTrades.filter((t) => t.grade === 'F').length,
    Ungraded: gradedTrades.filter((t) => t.grade === null).length,
  };

  const streaks = computeStreaks(closedTrades);
  const winStreaks = streaks.filter((s) => s.type === 'win');
  const lossStreaks = streaks.filter((s) => s.type === 'loss');
  const longestWinStreakDetail = winStreaks.length > 0 ? winStreaks.reduce((a, b) => a.length > b.length ? a : b) : null;
  const longestLossStreakDetail = lossStreaks.length > 0 ? lossStreaks.reduce((a, b) => a.length > b.length ? a : b) : null;

  const monteCarlo = computeMonteCarlo(closedTrades);
  const sizeAfterStreaks = computeSizeAfterStreaks(closedTrades);

  const winRateAfterStreaks = computeWinRateAfterStreaks(closedTrades);
  const calendarData = computeCalendarData(closedTrades);
  const drawdownPeriods = computeDrawdownPeriods(equityCurve);
  const tiltScore = computeTiltScore(closedTrades);
  const overtradingScore = computeOvertradingScore(closedTrades, sessions);

  const durationPnlCorrelation = pearsonCorrelation(
    closedTrades.map((t) => t.holdingMs),
    closedTrades.map((t) => t.pnlValue),
  );

  const durationVsPnl = closedTrades.map((t, i) => ({
    index: i,
    durationMin: Math.round(t.holdingMs / 60000),
    pnl: t.pnlValue,
    direction: t.type,
    instrument: t.instrument,
  }));

  const sessionDetailedStats = sessions.map(computeSessionDetailedStats).sort((a, b) => b.netPnl - a.netPnl);

  // Rolling win rate (10-trade window)
  const rollingWinRate = closedTrades.map((_, index) => {
    const windowStart = Math.max(0, index - 9);
    const slice = closedTrades.slice(windowStart, index + 1);
    const wins = slice.filter((t) => t.pnlValue > 0).length;
    return {
      index: index + 1,
      winRate: safePercent(wins, slice.length),
      label: new Date(closedTrades[index].closedAt).toLocaleDateString(),
    };
  });

  // Consistency score (0-100): measures how stable returns are
  const pnlValues = closedTrades.map((t) => t.pnlValue);
  const pnlMean = pnlValues.length > 0 ? pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length : 0;
  const pnlStdDev = pnlValues.length > 1
    ? Math.sqrt(pnlValues.reduce((s, v) => s + Math.pow(v - pnlMean, 2), 0) / (pnlValues.length - 1))
    : 0;
  const coefficientOfVariation = pnlMean !== 0 ? Math.abs(pnlStdDev / pnlMean) : 0;
  const consistencyScore = Math.max(0, Math.min(100, 100 - coefficientOfVariation * 20));

  // Edge ratio: average win * win-rate vs average loss * loss-rate
  const edgeRatio = totalTrades > 0
    ? (averageWin * (winRate / 100)) / Math.max(averageLoss * (1 - winRate / 100), 0.01)
    : 0;

  // Setup Breakdown (Performance grouped by setupTag)
  const setupMap = new Map<string, { trades: EnrichedTrade[]; rValues: number[] }>();
  closedTrades.forEach((trade) => {
    const tag = trade.setupTag?.trim() || 'Untagged';
    let group = setupMap.get(tag);
    if (!group) {
      group = { trades: [], rValues: [] };
      setupMap.set(tag, group);
    }
    group.trades.push(trade);
    const graded = gradedTrades.find((g) => g.id === trade.id);
    if (graded && graded.rMultiple !== null) {
      group.rValues.push(graded.rMultiple);
    }
  });

  const setupBreakdown: SetupStat[] = Array.from(setupMap.entries()).map(([tag, data]) => {
    const wins = data.trades.filter((t) => t.pnlValue > 0).length;
    const losses = data.trades.filter((t) => t.pnlValue <= 0).length;
    const net = data.trades.reduce((sum, t) => sum + t.pnlValue, 0);
    const grossP = data.trades.filter((t) => t.pnlValue > 0).reduce((sum, t) => sum + t.pnlValue, 0);
    const grossL = Math.abs(data.trades.filter((t) => t.pnlValue <= 0).reduce((sum, t) => sum + t.pnlValue, 0));
    const pf = grossL > 0 ? grossP / grossL : grossP > 0 ? Infinity : 0;
    const avgR = data.rValues.length > 0 ? data.rValues.reduce((a, b) => a + b, 0) / data.rValues.length : 0;
    return {
      tag,
      trades: data.trades.length,
      wins,
      losses,
      winRate: safePercent(wins, data.trades.length),
      netPnl: net,
      avgPnl: data.trades.length ? net / data.trades.length : 0,
      profitFactor: pf,
      avgR,
    };
  }).sort((a, b) => b.netPnl - a.netPnl);

  // Discipline Breakdown (Performance grouped by mistakeTag / rule adherence)
  const disciplineMap = new Map<string, EnrichedTrade[]>();
  closedTrades.forEach((trade) => {
    const tag = trade.mistakeTag?.trim() || (trade.setupTag ? 'Followed Rules' : 'Unclassified');
    let list = disciplineMap.get(tag);
    if (!list) {
      list = [];
      disciplineMap.set(tag, list);
    }
    list.push(trade);
  });

  const disciplineBreakdown: DisciplineStat[] = Array.from(disciplineMap.entries()).map(([tag, list]) => {
    const wins = list.filter((t) => t.pnlValue > 0).length;
    const losses = list.filter((t) => t.pnlValue <= 0).length;
    const net = list.reduce((sum, t) => sum + t.pnlValue, 0);
    const isRule = tag.toLowerCase().includes('follow') || tag.toLowerCase().includes('plan');
    const isUnclassified = tag === 'Unclassified';
    const category: DisciplineStat['category'] = isRule ? 'rule' : isUnclassified ? 'unclassified' : 'mistake';
    return {
      tag,
      category,
      trades: list.length,
      wins,
      losses,
      winRate: safePercent(wins, list.length),
      netPnl: net,
      avgPnl: list.length ? net / list.length : 0,
    };
  }).sort((a, b) => b.trades - a.trades);

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    grossProfit,
    grossLoss,
    netPnl,
    totalStartingCapital,
    returnPct,
    winRate,
    averageWin,
    averageLoss,
    profitFactor,
    expectancy,
    payoffRatio,
    averageHoldingMs,
    maxDrawdown,
    maxDrawdownPct,
    bestWinStreak,
    worstLossStreak,
    equityCurve,
    drawdownTimeline,
    dailyPerformance,
    monthlyPerformance,
    directionStats,
    instrumentBreakdown,
    bestTrade,
    worstTrade,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    recoveryFactor,
    kellyPercent,
    avgRMultiple,
    riskCoverage,
    rBuckets,
    longestConsecutiveWins,
    longestConsecutiveLosses,
    outcomeDistribution,
    timingByHour,
    rollingExpectancy,
    dayOfWeekEdge,
    seasonalityHeatmap,
    durationDistribution,
    durationBucketDistribution,
    maeMfeScatter,
    cumulativeRMultipleCurve,
    regimeSplit,
    // New extended fields
    hourlySlots,
    bestHours,
    worstHours,
    gradedTrades,
    gradeDistribution,
    streaks,
    longestWinStreakDetail,
    longestLossStreakDetail,
    winRateAfterStreaks,
    calendarData,
    drawdownPeriods,
    tiltScore,
    overtradingScore,
    monteCarlo,
    sizeAfterStreaks,
    durationPnlCorrelation,
    durationVsPnl,
    sessionDetailedStats,
    rollingWinRate,
    consistencyScore,
    edgeRatio,
    setupBreakdown,
    disciplineBreakdown,
  };
}

/* ── Trade Replay Data Extraction ────────────────────────────── */

export interface TradeReplayData {
  candles: import('../../store/useSimulatorStore').Candle[];
  entryIndex: number;
  exitIndex: number;
  entryPrice: number;
  exitPrice: number;
  sl?: number;
  tp?: number;
  tradeType: 'buy' | 'sell';
  instrument: string;
  timeframe: string;
  sessionName: string;
}

/* ── Monte Carlo Simulation ───────────────────────────────────── */

export interface MonteCarloResult {
  simulations: number;
  tradeCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  expectedNet: number;
  seededRun: number[];
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  positiveProbability: number;
  ruinProbability: number;
}

/** Deterministic PRNG (mulberry32) so results are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bootstrap Monte Carlo: resamples the trader's actual realized trade outcomes
 * `simulations` times (each run contains `tradeCount` trades) and reports the
 * distribution of net P&L. No distributional assumptions — only real results.
 */
export function computeMonteCarlo(
  closedTrades: EnrichedTrade[],
  options: { simulations?: number; seed?: number } = {},
): MonteCarloResult {
  const simulations = options.simulations ?? 1000;
  const rand = mulberry32(options.seed ?? 20260805);

  const outcomes = closedTrades.map((t) => t.pnlValue);
  const wins = outcomes.filter((v) => v > 0);
  const losses = outcomes.filter((v) => v <= 0);
  const tradeCount = outcomes.length;
  const winRate = tradeCount > 0 ? wins.length / tradeCount : 0;
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const expectedNet = (avgWin * winRate + avgLoss * (1 - winRate)) * tradeCount;

  const endpoints: number[] = [];
  const sample = () => (tradeCount > 0 ? outcomes[Math.floor(rand() * tradeCount)] : 0);

  for (let s = 0; s < simulations; s++) {
    let equity = 0;
    for (let i = 0; i < tradeCount; i++) equity += sample();
    endpoints.push(equity);
  }

  const sorted = [...endpoints].sort((a, b) => a - b);
  const percentile = (p: number) => {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
    return sorted[idx];
  };

  const seededRun: number[] = [];
  let runEquity = 0;
  for (let i = 0; i < Math.min(tradeCount, 60); i++) {
    runEquity += sample();
    seededRun.push(runEquity);
  }

  return {
    simulations,
    tradeCount,
    winRate,
    avgWin,
    avgLoss,
    expectedNet,
    seededRun,
    percentiles: {
      p5: percentile(5),
      p25: percentile(25),
      p50: percentile(50),
      p75: percentile(75),
      p95: percentile(95),
    },
    positiveProbability: simulations > 0 ? endpoints.filter((e) => e > 0).length / simulations : 0,
    ruinProbability: simulations > 0 ? endpoints.filter((e) => e < 0).length / simulations : 0,
  };
}

/* ── Size Drift After Streaks (Revenge Trading) ───────────────── */

export interface SizeAfterStreaks {
  afterWinStreak: { streak: number; trades: number; avgSize: number }[];
  afterLossStreak: { streak: number; trades: number; avgSize: number }[];
}

/**
 * Detects position-size drift after win/loss streaks — the classic
 * revenge-trading signature (increasing size after losses).
 */
export function computeSizeAfterStreaks(closedTrades: EnrichedTrade[]): SizeAfterStreaks {
  const winMap = new Map<number, { trades: number; totalSize: number }>();
  const lossMap = new Map<number, { trades: number; totalSize: number }>();

  let streak = 0;
  let lastType: 'win' | 'loss' | null = null;

  closedTrades.forEach((trade) => {
    const type = trade.pnlValue > 0 ? 'win' : 'loss';
    streak = type === lastType ? streak + 1 : 1;
    lastType = type;

    const map = type === 'win' ? winMap : lossMap;
    const row = map.get(streak) ?? { trades: 0, totalSize: 0 };
    row.trades += 1;
    row.totalSize += trade.size || 0;
    map.set(streak, row);
  });

  const toRows = (map: Map<number, { trades: number; totalSize: number }>) =>
    Array.from(map.entries())
      .map(([streak, row]) => ({ streak, trades: row.trades, avgSize: row.totalSize / Math.max(row.trades, 1) }))
      .sort((a, b) => a.streak - b.streak);

  return { afterWinStreak: toRows(winMap), afterLossStreak: toRows(lossMap) };
}

const REPLAY_PADDING_BEFORE = 60;
const REPLAY_PADDING_AFTER = 30;

export function extractTradeReplayData(
  trade: EnrichedTrade,
  sessions: SessionLike[],
  targetTimeframe?: string,
  options?: { fullDay?: boolean },
): TradeReplayData | null {
  const tf = targetTimeframe || trade.timeframe || '1m';
  const fullDay = options?.fullDay === true;

  // Fallback to active session or trade stored candles
  const session = sessions.find((s) => s.id === trade.sessionId);
  let baseCandles = (trade as any).candles;
  if ((!baseCandles || baseCandles.length === 0) && session && 'data' in session) {
    baseCandles = (session as Session).data;
  }

  if (!baseCandles || baseCandles.length === 0) return null;

  const entryTs = trade.entryTime ?? trade.orderTime;
  const exitTs = trade.exitTime ?? trade.closedAt;
  if (!entryTs || !exitTs) return null;

  // Aggregate or expand candles to requested timeframe if specified
  const tfSec = tf ? getTimeframeSeconds(tf) : 60;
  let effectiveCandles: Candle[] = [];

  if (tfSec < 60) {
    effectiveCandles = expandSubMinuteCandlesFromM1(baseCandles, tf || '1m');
  } else if (tf && tf !== '1m' && tf !== 'm1') {
    effectiveCandles = aggregateCandles(baseCandles, tf);
  } else {
    effectiveCandles = baseCandles;
  }

  if (effectiveCandles.length === 0) return null;

  // Find candle indices closest to entry and exit
  let entryRawIdx = -1;
  let exitRawIdx = -1;
  let bestEntryDelta = Infinity;
  let bestExitDelta = Infinity;

  for (let i = 0; i < effectiveCandles.length; i++) {
    const ts = effectiveCandles[i].timestamp;
    const entryDelta = Math.abs(ts - entryTs);
    const exitDelta = Math.abs(ts - exitTs);
    if (entryDelta < bestEntryDelta) {
      bestEntryDelta = entryDelta;
      entryRawIdx = i;
    }
    if (exitDelta < bestExitDelta) {
      bestExitDelta = exitDelta;
      exitRawIdx = i;
    }
  }

  if (entryRawIdx < 0 || exitRawIdx < 0) return null;

  if (entryRawIdx > exitRawIdx) {
    [entryRawIdx, exitRawIdx] = [exitRawIdx, entryRawIdx];
  }

  // Calculate timeframe-appropriate context padding
  let minPreBars = 120;
  let minPostBars = 60;
  if (tfSec >= 86400) { // 1D, 1W
    minPreBars = 40;
    minPostBars = 15;
  } else if (tfSec >= 14400) { // 4H
    minPreBars = 75;
    minPostBars = 35;
  } else if (tfSec >= 3600) { // 1H
    minPreBars = 90;
    minPostBars = 45;
  } else if (tfSec >= 900) { // 15M, 30M
    minPreBars = 100;
    minPostBars = 50;
  } else if (tfSec >= 300) { // 5M
    minPreBars = 120;
    minPostBars = 60;
  } else if (tfSec === 60) { // 1M
    minPreBars = 35;
    minPostBars = 20;
  } else if (tfSec < 60) { // Sub-minute
    minPreBars = 40;
    minPostBars = 20;
  }

  // Ensure sliceStart has rich historical context leading into the trade entry
  let sliceStart = Math.max(0, entryRawIdx - minPreBars);
  const entryCandle = effectiveCandles[entryRawIdx];
  if (fullDay && tfSec <= 3600 && entryCandle) {
    const entryDateStr = new Date(entryCandle.timestamp).toDateString();
    const dayStartIdx = effectiveCandles.findIndex((c) => new Date(c.timestamp).toDateString() === entryDateStr);
    if (dayStartIdx >= 0 && dayStartIdx < sliceStart) {
      sliceStart = dayStartIdx;
    }
  }

  // Ensure sliceEnd has sufficient post-trade market structure context
  let sliceEnd = Math.min(effectiveCandles.length - 1, exitRawIdx + minPostBars);
  if (fullDay && tfSec <= 3600) {
    const exitCandle = effectiveCandles[exitRawIdx];
    const exitDateStr = exitCandle ? new Date(exitCandle.timestamp).toDateString() : '';
    if (exitDateStr) {
      for (let i = effectiveCandles.length - 1; i >= exitRawIdx; i--) {
        if (new Date(effectiveCandles[i].timestamp).toDateString() === exitDateStr) {
          if (i > sliceEnd) sliceEnd = i;
          break;
        }
      }
    }
  }

  const candles = effectiveCandles.slice(sliceStart, sliceEnd + 1);

  if (candles.length === 0) return null;

  return {
    candles,
    entryIndex: entryRawIdx - sliceStart,
    exitIndex: exitRawIdx - sliceStart,
    entryPrice: trade.entryPrice ?? effectiveCandles[entryRawIdx].close,
    exitPrice: trade.exitPrice ?? effectiveCandles[exitRawIdx].close,
    sl: trade.sl,
    tp: trade.tp,
    tradeType: trade.type,
    instrument: trade.instrument,
    timeframe: tf,
    sessionName: trade.sessionName,
  };
}
