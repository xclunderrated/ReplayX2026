import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrderPayloadFromDraft,
  createOrderDraft,
  getContractMultiplier,
  getCurrentSessionPrice,
  getOrderDraftMetrics,
  normalizeOrderDraft,
  validateOrderDraft,
  validateTradeUpdate,
} from '../src/lib/orders';
import type { Trade } from '../src/store/useSimulatorStore';

function createTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-1',
    type: 'buy',
    orderType: 'limit',
    limitPrice: 1.095,
    entryPrice: undefined,
    exitPrice: undefined,
    size: 0.5,
    riskType: 'percent',
    riskPercent: 1,
    riskDollar: undefined,
    sl: 1.09,
    tp: 1.105,
    orderTime: 1_000,
    entryTime: undefined,
    exitTime: undefined,
    pnl: undefined,
    status: 'pending',
    checklistHits: undefined,
    strategyId: undefined,
    ...overrides,
  };
}

test('createOrderDraft starts in stop-loss placement mode', () => {
  const draft = createOrderDraft('buy', 'limit', 1.09543);
  assert.equal(draft.phase, 'placing-sl');
  assert.equal(draft.entryPrice, 1.09543);
  assert.equal(draft.riskType, 'percent');
  assert.equal(draft.riskValue, 1);
});

test('normalizeOrderDraft advances phase as stops and targets are added', () => {
  const draft = createOrderDraft('buy', 'limit', 1.095);
  const withStop = normalizeOrderDraft(draft, { sl: 1.09, phase: 'placing-tp' });
  assert.equal(withStop.phase, 'placing-tp');
  const withTarget = normalizeOrderDraft(withStop, { tp: 1.105 });
  assert.equal(withTarget.phase, 'ready');
});

test('validateOrderDraft rejects buy limit entries above the current price', () => {
  const draft = normalizeOrderDraft(createOrderDraft('buy', 'limit', 1.101), { sl: 1.099, phase: 'ready' });
  const validation = validateOrderDraft(draft, 1.1);
  assert.equal(validation.canSubmit, false);
  assert.ok(validation.errors.includes('Buy limit entry must be below the current price.'));
});

test('validateOrderDraft rejects sell stop entries above the current price', () => {
  const draft = normalizeOrderDraft(createOrderDraft('sell', 'stop', 1.101), { sl: 1.103, phase: 'ready' });
  const validation = validateOrderDraft(draft, 1.1);
  assert.equal(validation.canSubmit, false);
  assert.ok(validation.errors.includes('Sell stop entry must be below the current price.'));
});

test('validateOrderDraft warns when a ready order has no take profit', () => {
  const draft = normalizeOrderDraft(createOrderDraft('buy', 'market', 1.1), { sl: 1.099, phase: 'ready', tp: undefined });
  const validation = validateOrderDraft(draft, 1.1);
  assert.equal(validation.canSubmit, true);
  assert.ok(validation.warnings.includes('No take profit is set for this order.'));
});
test('getOrderDraftMetrics uses live price for market orders', () => {
  const draft = normalizeOrderDraft(createOrderDraft('buy', 'market', 1.08), { sl: 1.099, tp: 1.103, phase: 'ready' });
  const metrics = getOrderDraftMetrics(draft, 10000, 'EURUSD', 1.1);
  assert.equal(metrics.entryPrice, 1.1);
  assert.equal(Number(metrics.stopPips.toFixed(1)), 10);
  assert.equal(Number(metrics.targetPips.toFixed(1)), 30);
});

test('buildOrderPayloadFromDraft carries normalized pending entry and risk fields', () => {
  const draft = normalizeOrderDraft(createOrderDraft('sell', 'limit', 1.101234), {
    sl: 1.103456,
    tp: 1.098765,
    riskType: 'dollar',
    riskValue: 75,
    phase: 'ready',
  });
  const payload = buildOrderPayloadFromDraft(draft, 10000, 1.1, {
    strategyId: 'strategy-1',
    checklistHits: ['a', 'b'],
  });
  assert.equal(payload.limitPrice, 1.10123);
  assert.equal(payload.riskDollar, 75);
  assert.equal(payload.riskPercent, undefined);
  assert.equal(payload.strategyId, 'strategy-1');
});

test('validateTradeUpdate rejects invalid stop-loss direction for open sell trades', () => {
  const trade = createTrade({
    type: 'sell',
    orderType: 'market',
    status: 'open',
    limitPrice: undefined,
    entryPrice: 1.1,
    sl: 1.103,
    tp: 1.097,
  });
  const validation = validateTradeUpdate(trade, { sl: 1.099 }, 1.1);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.includes('Sell orders need the stop loss above entry.'));
});

test('validateTradeUpdate keeps pending entries on the correct side of price', () => {
  const trade = createTrade({
    type: 'buy',
    orderType: 'limit',
    limitPrice: 1.095,
    sl: 1.09,
  });
  const validation = validateTradeUpdate(trade, { limitPrice: 1.101 }, 1.1);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.includes('Buy limit entry must remain below the current price.'));
});

test('getCurrentSessionPrice returns the visible candle close', () => {
  const price = getCurrentSessionPrice({
    currentIndex: 1,
    data: [
      { timestamp: 1, open: 1, high: 1, low: 1, close: 1.1, volume: 1 },
      { timestamp: 2, open: 1, high: 1, low: 1, close: 1.2, volume: 1 },
    ],
  });
  assert.equal(price, 1.2);
});

test('getContractMultiplier returns correct values for different instruments', () => {
  assert.equal(getContractMultiplier('eurusd'), 100000);
  assert.equal(getContractMultiplier('USDJPY'), 100000);
  assert.equal(getContractMultiplier('gbpjpy'), 100000);
  assert.equal(getContractMultiplier('xauusd'), 100);
  assert.equal(getContractMultiplier('xagusd'), 5000);
  assert.equal(getContractMultiplier('btcusd'), 1);
  assert.equal(getContractMultiplier('ethusd'), 1);
  assert.equal(getContractMultiplier('usa500idxusd'), 1);
  assert.equal(getContractMultiplier(undefined), 100000);
});
