import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTradeExcursion } from '../src/lib/orders';
import {
  computeAnalytics,
  computeMonteCarlo,
  computeSizeAfterStreaks,
  computeTradeRMultiple,
  computeTradeRisk,
  flattenClosedTrades,
  mulberry32,
} from '../src/components/analytics/analyticsEngine';

function makeTrade(overrides: Record<string, unknown> = {}): any {
  return {
    id: 't-1',
    type: 'buy' as const,
    orderType: 'market' as const,
    size: 1,
    orderTime: 1_000,
    entryTime: 1_000,
    exitTime: 2_000,
    pnl: 500,
    status: 'closed' as const,
    entryPrice: 1.1,
    exitPrice: 1.105,
    sl: 1.09,
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'session-1',
    name: 'Test Session',
    instrument: 'EURUSD',
    timeframe: 'm1',
    data: [],
    balance: 10_000,
    initialBalance: 10_000,
    trades: [makeTrade()],
    ...overrides,
  };
}

test('flattenClosedTrades keeps only closed trades, enriches and sorts', () => {
  const session = makeSession({
    trades: [
      makeTrade({ id: 'a', status: 'open', pnl: 99 }),
      makeTrade({ id: 'b', status: 'closed', exitTime: 5_000, pnl: -50 }),
      makeTrade({ id: 'c', status: 'closed', exitTime: 3_000, pnl: 25 }),
    ],
  });

  const trades = flattenClosedTrades([session]);
  assert.equal(trades.length, 2);
  assert.deepEqual(trades.map((t) => t.id), ['c', 'b']);
  assert.equal(trades[0].pnlValue, 25);
  assert.equal(trades[0].instrument, 'EURUSD');
  assert.equal(trades[0].holdingMs, 2_000);
  assert.equal(trades[1].pnlValue, -50);
});

test('computeTradeRisk: SL distance in USD is the primary source', () => {
  const trade = makeTrade({ entryPrice: 1.1, sl: 1.09, size: 1 });
  const risk = computeTradeRisk(trade as any, makeSession() as any);
  assert.equal(risk.source, 'sl');
  assert.ok(Math.abs(risk.riskUsd - 1_000) < 1e-6);
});

test('computeTradeRisk: riskDollar fallback when no SL', () => {
  const trade = makeTrade({ sl: undefined, riskDollar: 250 });
  const risk = computeTradeRisk(trade as any, makeSession() as any);
  assert.equal(risk.source, 'riskDollar');
  assert.equal(risk.riskUsd, 250);
});

test('computeTradeRisk: riskPercent of session balance when nothing else', () => {
  const trade = makeTrade({ sl: undefined, riskDollar: undefined, riskPercent: 1 });
  const risk = computeTradeRisk(trade as any, makeSession() as any);
  assert.equal(risk.source, 'riskPercent');
  assert.equal(risk.riskUsd, 100);
});

test('computeTradeRisk: never invents risk — none source when no data', () => {
  const trade = makeTrade({ sl: undefined, riskDollar: undefined, riskPercent: undefined });
  const risk = computeTradeRisk(trade as any, makeSession() as any);
  assert.equal(risk.source, 'none');
  assert.equal(risk.riskUsd, 0);
});

test('computeTradeRMultiple: real R from SL risk, null when risk unknown', () => {
  const session = makeSession() as any;
  const withSl = computeTradeRMultiple(makeTrade({ pnlValue: 500 }) as any, session);
  assert.ok(Math.abs(withSl! - 0.5) < 1e-9);

  const noSl = computeTradeRMultiple(makeTrade({ sl: undefined, pnlValue: 500 }) as any, session);
  assert.equal(noSl, null);
});

test('computeMonteCarlo: deterministic with fixed seed, stats correct', () => {
  const trades = [
    makeTrade({ pnlValue: 100 }),
    makeTrade({ pnlValue: 100 }),
    makeTrade({ pnlValue: -50 }),
    makeTrade({ pnlValue: -50 }),
  ] as any;

  const a = computeMonteCarlo(trades, { simulations: 500, seed: 42 });
  const b = computeMonteCarlo(trades, { simulations: 500, seed: 42 });
  assert.deepEqual(a.percentiles, b.percentiles);
  assert.deepEqual(a.seededRun, b.seededRun);

  assert.equal(a.tradeCount, 4);
  assert.equal(a.winRate, 0.5);
  assert.equal(a.avgWin, 100);
  assert.equal(a.avgLoss, -50);
  assert.equal(a.expectedNet, 100);
  assert.ok(a.positiveProbability > 0 && a.positiveProbability < 1);
  assert.ok(a.percentiles.p5 <= a.percentiles.p50 && a.percentiles.p50 <= a.percentiles.p95);
});

test('computeMonteCarlo: single outcome collapses to that value', () => {
  const mc = computeMonteCarlo([makeTrade({ pnlValue: 100 })] as any, { simulations: 200, seed: 1 });
  assert.equal(mc.percentiles.p5, 100);
  assert.equal(mc.percentiles.p95, 100);
  assert.equal(mc.positiveProbability, 1);
  assert.equal(mc.ruinProbability, 0);
});

test('computeMonteCarlo: different seeds produce different runs', () => {
  const trades = [makeTrade({ pnlValue: 100 }), makeTrade({ pnlValue: -50 })] as any;
  const a = computeMonteCarlo(trades, { simulations: 100, seed: 1 });
  const b = computeMonteCarlo(trades, { simulations: 100, seed: 2 });
  assert.notDeepEqual(a.percentiles, b.percentiles);
});

test('mulberry32: reproducible sequence', () => {
  const gen1 = mulberry32(123);
  const gen2 = mulberry32(123);
  const seq1 = Array.from({ length: 5 }, () => gen1());
  const seq2 = Array.from({ length: 5 }, () => gen2());
  assert.deepEqual(seq1, seq2);
  assert.ok(seq1.every((v) => v >= 0 && v < 1));
});

test('computeSizeAfterStreaks: detects size drift after losses', () => {
  const trades = [
    makeTrade({ pnlValue: 100, size: 1 }),
    makeTrade({ pnlValue: -50, size: 1 }),
    makeTrade({ pnlValue: -50, size: 2 }),
    makeTrade({ pnlValue: 100, size: 1 }),
  ] as any;

  const result = computeSizeAfterStreaks(trades);
  const loss1 = result.afterLossStreak.find((s) => s.streak === 1);
  const loss2 = result.afterLossStreak.find((s) => s.streak === 2);
  const win1 = result.afterWinStreak.find((s) => s.streak === 1);

  assert.equal(loss1?.avgSize, 1);
  assert.equal(loss2?.avgSize, 2);
  assert.equal(win1?.trades, 2);
  assert.equal(win1?.avgSize, 1);
});

test('computeTradeExcursion: real MAE/MFE in USD from candle window', () => {
  const candles = [
    { timestamp: 1_000, high: 1.105, low: 1.095 },
    { timestamp: 2_000, high: 1.11, low: 1.098 },
    { timestamp: 3_000, high: 1.09, low: 1.085 },
    { timestamp: 4_000, high: 1.115, low: 1.1 },
  ];
  const excursion = computeTradeExcursion(candles, 1_000, 4_000, 'buy', 1.1, 1, 'EURUSD')!;
  assert.ok(Math.abs(excursion.mae + 1_500) < 1e-6);
  assert.ok(Math.abs(excursion.mfe - 1_500) < 1e-6);
});

test('computeTradeExcursion: sell side and empty-window null', () => {
  const candles = [
    { timestamp: 1_000, high: 1.11, low: 1.09 },
    { timestamp: 2_000, high: 1.115, low: 1.085 },
  ];
  const sell = computeTradeExcursion(candles, 1_000, 2_000, 'sell', 1.1, 1, 'EURUSD')!;
  assert.ok(Math.abs(sell.mae + 1_500) < 1e-6);
  assert.ok(Math.abs(sell.mfe - 1_500) < 1e-6);

  const empty = computeTradeExcursion(candles, 9_000, 10_000, 'buy', 1.1, 1, 'EURUSD');
  assert.equal(empty, null);
});

test('computeAnalytics: real R pipeline end-to-end (graded + ungraded)', () => {
  const session = makeSession({
    trades: [
      makeTrade({ id: 't1', pnl: 500, sl: 1.09, riskPercent: 1 }),
      makeTrade({ id: 't2', sl: undefined, pnl: -200, orderTime: 3_000, entryTime: 3_000, exitTime: 4_000 }),
    ],
  }) as any;

  const trades = flattenClosedTrades([session]);
  const analytics = computeAnalytics(trades, [session]);

  const t1 = analytics.gradedTrades.find((t) => t.id === 't1')!;
  const t2 = analytics.gradedTrades.find((t) => t.id === 't2')!;

  assert.ok(Math.abs(t1.rMultiple! - 0.5) < 1e-9);
  assert.equal(t1.grade, 'C');
  assert.ok(t1.gradeReason.length > 0);

  assert.equal(t2.rMultiple, null);
  assert.equal(t2.grade, null);
  assert.equal(t2.gradeReason, 'No stop loss recorded — R unavailable');

  assert.equal(analytics.gradeDistribution.C, 1);
  assert.equal(analytics.gradeDistribution.Ungraded, 1);
  assert.equal(analytics.riskCoverage, 50);
  assert.equal(analytics.rBuckets['No SL'], 1);
  assert.equal(analytics.rBuckets['0-1R'], 1);
  assert.ok(Math.abs(analytics.avgRMultiple - 0.5) < 1e-9);
  assert.ok(analytics.monteCarlo.tradeCount === 2);
  assert.ok(analytics.sizeAfterStreaks.afterLossStreak.length > 0);
});

test('computeAnalytics: scatter and cumulative-R use real risk, null-safe', () => {
  const session = makeSession({
    trades: [
      makeTrade({ id: 't1', pnl: 500, sl: 1.09 }),
      makeTrade({ id: 't2', sl: undefined, pnl: -200, orderTime: 3_000, entryTime: 3_000, exitTime: 4_000 }),
    ],
  }) as any;

  const analytics = computeAnalytics(flattenClosedTrades([session]), [session]);

  const scatter = analytics.maeMfeScatter;
  assert.ok(Math.abs(scatter[0].rMultiple! - 0.5) < 1e-9);
  assert.equal(scatter[0].mae, null);
  assert.equal(scatter[1].rMultiple, null);

  const curve = analytics.cumulativeRMultipleCurve;
  assert.ok(Math.abs(curve[0].rMultiple! - 0.5) < 1e-9);
  assert.ok(Math.abs(curve[0].cumulativeR! - 0.5) < 1e-9);
  assert.equal(curve[1].rMultiple, null);
  assert.equal(curve[1].cumulativeR, null);
});
