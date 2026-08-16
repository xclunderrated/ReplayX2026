import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceSessionPlayback,
  applySessionData,
  createEmptySessionDataState,
} from '../src/lib/simulatorEngine';

function candle(timestamp: number, price: number) {
  return {
    timestamp,
    open: price,
    high: price + 0.0005,
    low: price - 0.0005,
    close: price,
    volume: 1,
  };
}

function createSession(overrides: Partial<any> = {}) {
  return {
    id: 'session-1',
    timeframe: 'm1',
    startDate: '2024-01-01',
    endDate: '2024-01-02',
    data: [],
    currentIndex: 0,
    targetTimestamp: undefined,
    isPlaying: false,
    balance: 10000,
    initialBalance: 10000,
    trades: [],
    dataState: createEmptySessionDataState(),
    ...overrides,
  };
}

test('applySessionData replace preserves target timestamp and derives loaded range', () => {
  const session = createSession({
    targetTimestamp: 2_000,
  });

  const next = applySessionData(session, [
    candle(1_000, 1.1),
    candle(2_000, 1.2),
    candle(3_000, 1.3),
  ], 'replace', {
    absoluteFromTs: 500,
    absoluteToTs: 4_000,
  });

  assert.equal(next.currentIndex, 1);
  assert.equal(next.targetTimestamp, undefined);
  assert.equal(next.dataState.loadedFromTs, 1_000);
  assert.equal(next.dataState.loadedToTs, 3_000);
  assert.equal(next.dataState.hasMoreBefore, true);
  assert.equal(next.dataState.hasMoreAfter, true);
});

test('applySessionData prepend keeps replay anchor stable', () => {
  const session = createSession({
    data: [candle(2_000, 1.2), candle(3_000, 1.3), candle(4_000, 1.4)],
    currentIndex: 1,
    dataState: {
      ...createEmptySessionDataState(),
      absoluteFromTs: 1_000,
      absoluteToTs: 5_000,
      loadedFromTs: 2_000,
      loadedToTs: 4_000,
    },
  });

  const next = applySessionData(session, [candle(1_000, 1.1)], 'prepend');

  assert.equal(next.data.length, 4);
  assert.equal(next.data[next.currentIndex].timestamp, 3_000);
  assert.equal(next.dataState.loadedFromTs, 1_000);
  assert.equal(next.dataState.hasMoreBefore, false);
  assert.equal(next.dataState.hasMoreAfter, true);
});

test('advanceSessionPlayback executes pending limit and closes at TP', () => {
  const session = createSession({
    data: [
      candle(1_000, 1.1000),
      {
        timestamp: 2_000,
        open: 1.0990,
        high: 1.1015,
        low: 1.0980,
        close: 1.1010,
        volume: 1,
      },
      {
        timestamp: 3_000,
        open: 1.1010,
        high: 1.1040,
        low: 1.1005,
        close: 1.1035,
        volume: 1,
      },
    ],
    trades: [{
      id: 't1',
      type: 'buy',
      orderType: 'limit',
      limitPrice: 1.0995,
      tp: 1.1030,
      size: 1,
      orderTime: 1_000,
      status: 'pending',
    }],
  });

  const opened = advanceSessionPlayback(session);
  assert.equal(opened.advanced, true);
  assert.equal(opened.session.trades[0].status, 'open');
  assert.equal(opened.session.trades[0].entryPrice, 1.0990);

  const closed = advanceSessionPlayback({ ...opened.session, isPlaying: true });
  assert.equal(closed.advanced, true);
  assert.equal(closed.session.trades[0].status, 'closed');
  assert.equal(closed.session.trades[0].exitPrice, 1.1030);
  assert.ok((closed.session.trades[0].pnl ?? 0) > 0);
  assert.ok(closed.session.balance > session.balance);
});

test('advanceSessionPlayback does not stop playback at temporary loaded edge if more session range should exist', () => {
  const session = createSession({
    isPlaying: true,
    endDate: '2024-01-10',
    data: [candle(Date.UTC(2024, 0, 1, 0, 0), 1.1)],
    currentIndex: 0,
  });

  const result = advanceSessionPlayback(session);
  assert.equal(result.advanced, false);
  assert.equal(result.reachedDataEnd, true);
  assert.equal(result.mayHaveMoreData, true);
  assert.equal(result.session.isPlaying, true);
});

test('advanceSessionPlayback pauses when searched range is exhausted with no later candles', () => {
  const session = createSession({
    isPlaying: true,
    startDate: '2024-01-01',
    endDate: '2024-01-10',
    data: [candle(Date.UTC(2024, 0, 1, 0, 0), 1.1)],
    currentIndex: 0,
    dataState: {
      ...createEmptySessionDataState(),
      absoluteFromTs: Date.UTC(2024, 0, 1, 0, 0),
      absoluteToTs: Date.UTC(2024, 0, 11, 0, 0),
      coveredFromTs: Date.UTC(2024, 0, 1, 0, 0),
      coveredToTs: Date.UTC(2024, 0, 11, 0, 0),
      loadedFromTs: Date.UTC(2024, 0, 1, 0, 0),
      loadedToTs: Date.UTC(2024, 0, 1, 0, 0),
    },
  });

  const result = advanceSessionPlayback(session);
  assert.equal(result.advanced, false);
  assert.equal(result.reachedDataEnd, true);
  assert.equal(result.mayHaveMoreData, false);
  assert.equal(result.session.isPlaying, false);
});

test('advanceSessionPlayback executes sell stop orders with gap-aware pricing', () => {
  const session = createSession({
    data: [
      candle(1_000, 1.1000),
      {
        timestamp: 2_000,
        open: 1.0980,
        high: 1.0990,
        low: 1.0970,
        close: 1.0975,
        volume: 1,
      },
    ],
    trades: [{
      id: 'sell-stop',
      type: 'sell',
      orderType: 'stop',
      limitPrice: 1.0995,
      size: 1,
      orderTime: 1_000,
      status: 'pending',
    }],
  });

  const result = advanceSessionPlayback(session);
  assert.equal(result.session.trades[0].status, 'open');
  assert.equal(result.session.trades[0].entryPrice, 1.0980);
});

test('advanceSessionPlayback uses stop-loss precedence when SL and TP are both touched in one candle', () => {
  const session = createSession({
    currentIndex: 0,
    data: [
      candle(1_000, 1.1000),
      {
        timestamp: 2_000,
        open: 1.1000,
        high: 1.1040,
        low: 1.0960,
        close: 1.1020,
        volume: 1,
      },
    ],
    trades: [{
      id: 'both-hit',
      type: 'buy',
      orderType: 'market',
      entryPrice: 1.1000,
      size: 1,
      sl: 1.0970,
      tp: 1.1030,
      orderTime: 1_000,
      entryTime: 1_000,
      status: 'open',
    }],
  });

  const result = advanceSessionPlayback(session);
  assert.equal(result.session.trades[0].status, 'closed');
  assert.equal(result.session.trades[0].exitPrice, 1.0970);
  assert.ok((result.session.trades[0].pnl ?? 0) < 0);
});

test('advanceSessionPlayback applies gap-through stop loss at candle open price', () => {
  const session = createSession({
    currentIndex: 0,
    data: [
      candle(1_000, 1.1000),
      {
        timestamp: 2_000,
        open: 1.0940,
        high: 1.0960,
        low: 1.0930,
        close: 1.0950,
        volume: 1,
      },
    ],
    trades: [{
      id: 'gap-sl',
      type: 'buy',
      orderType: 'market',
      entryPrice: 1.1000,
      size: 1,
      sl: 1.0970,
      orderTime: 1_000,
      entryTime: 1_000,
      status: 'open',
    }],
  });

  const result = advanceSessionPlayback(session);
  assert.equal(result.session.trades[0].status, 'closed');
  assert.equal(result.session.trades[0].exitPrice, 1.0940);
});

test('applySessionData replace clears hasMore flags at absolute boundaries', () => {
  const session = createSession({
    targetTimestamp: 1_000,
  });

  const next = applySessionData(session, [
    candle(1_000, 1.1),
    candle(2_000, 1.2),
  ], 'replace', {
    absoluteFromTs: 1_000,
    absoluteToTs: 2_000,
  });

  assert.equal(next.dataState.hasMoreBefore, false);
  assert.equal(next.dataState.hasMoreAfter, false);
});

test('applySessionData append returns same session when incoming data adds no new candles', () => {
  const session = createSession({
    data: [candle(1_000, 1.1), candle(2_000, 1.2)],
    currentIndex: 1,
    dataState: {
      ...createEmptySessionDataState(),
      loadedFromTs: 1_000,
      loadedToTs: 2_000,
    },
  });

  const next = applySessionData(session, [candle(1_000, 1.1), candle(2_000, 1.2)], 'append', {
    isViewportLoading: false,
    error: null,
  });

  assert.equal(next, session);
});

test('advanceSessionPlayback closes pending order on same candle when SL is hit after fill', () => {
  const session = createSession({
    currentIndex: 0,
    data: [
      candle(1_000, 1.1000),
      {
        timestamp: 2_000,
        open: 1.0990,
        high: 1.1010,
        low: 1.0940,
        close: 1.0960,
        volume: 1,
      },
    ],
    trades: [{
      id: 'same-bar',
      type: 'buy',
      orderType: 'limit',
      limitPrice: 1.0995,
      sl: 1.0950,
      tp: 1.1050,
      size: 1,
      orderTime: 1_000,
      status: 'pending',
    }],
  });

  const result = advanceSessionPlayback(session);
  assert.equal(result.session.trades[0].status, 'closed');
  assert.equal(result.session.trades[0].entryPrice, 1.0990);
  assert.equal(result.session.trades[0].exitPrice, 1.0950);
  assert.ok((result.session.trades[0].pnl ?? 0) < 0);
});

test('advanceSessionPlayback uses instrument-aware multiplier for PnL', () => {
  const session = createSession({
    instrument: 'usdjpy',
    currentIndex: 0,
    data: [
      candle(1_000, 150.000),
      {
        timestamp: 2_000,
        open: 150.050,
        high: 150.200,
        low: 149.950,
        close: 150.100,
        volume: 1,
      },
    ],
    trades: [{
      id: 'jpy-trade',
      type: 'buy',
      orderType: 'market',
      entryPrice: 150.000,
      size: 1,
      sl: 149.500,
      tp: 150.150,
      orderTime: 1_000,
      entryTime: 1_000,
      status: 'open',
    }],
  });

  const result = advanceSessionPlayback(session);
  assert.equal(result.session.trades[0].status, 'closed');
  assert.equal(result.session.trades[0].exitPrice, 150.150);
  // JPY uses correct conversion via entry price, so PnL = (150.150 - 150.000) * 1 * 100000 / 150 = 100
  const pnl = result.session.trades[0].pnl ?? 0;
  assert.ok(Math.abs(pnl - 100) < 0.01, `Expected PnL ~100, got ${pnl}`);
});

test('applySessionData replace finds seconds timestamp when old m1 candle is present in aggregated s5 data', () => {
  const base = Date.UTC(2024, 0, 1);
  const m1Data = Array.from({ length: 10 }, (_, i) => candle(base + i * 60_000, 1.1 + i * 0.001));
  const session = createSession({
    data: m1Data,
    currentIndex: 5,
    timeframe: 'm1',
    targetTimestamp: m1Data[5].timestamp,
  });

  // 61 s5 candles from midnight to +5min exactly, so 5:00 is index 60
  const s5Data = Array.from({ length: 61 }, (_, i) => ({
    timestamp: base + i * 5_000,
    open: 1.0, high: 1.1, low: 0.9, close: 1.05, volume: 1,
  }));

  const next = applySessionData(session, s5Data, 'replace', {
    absoluteFromTs: base - 86_400_000,
    absoluteToTs: base + 86_400_000,
  });

  assert.equal(next.currentIndex, 60);
  assert.strictEqual(next.targetTimestamp, undefined);
  assert.equal(next.data.length, 61);
  assert.equal(next.data[next.currentIndex].timestamp, base + 5 * 60_000);
});
