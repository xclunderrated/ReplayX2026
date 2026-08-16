import type { Candle, OrderDraft, Trade } from '../store/useSimulatorStore';

export type ActiveOrderDraft = NonNullable<OrderDraft>;

// ─── Instrument Specification Registry ───────────────────────────────────────

export type AssetClass = 'forex' | 'metal' | 'index' | 'crypto' | 'stock';

export interface InstrumentSpec {
  /** Units per 1 standard lot (e.g. 100,000 for forex, 100 oz for gold) */
  contractSize: number;
  /** Minimum price movement representing 1 pip */
  pipSize: number;
  /** Standard decimal places for price display */
  digits: number;
  /** Asset class */
  assetClass: AssetClass;
  /**
   * true  → quote currency IS USD → P&L = priceDiff × lots × contractSize  (USD directly)
   * false → quote currency is NOT USD → additional conversion required
   */
  quoteIsUSD: boolean;
  /**
   * true → quote is JPY → pipValue = pipSize × contractSize / entryPrice
   * This correctly converts JPY-denominated P&L to USD.
   */
  quoteIsJPY?: boolean;
}

/**
 * Master instrument registry.
 * Keys are normalised (trimmed, upper-cased) symbol strings.
 *
 * Pip value per lot (in USD) = pipSize × contractSize             [quoteIsUSD]
 *                            = pipSize × contractSize / entryPrice [quoteIsJPY]
 *
 * Verified against MetaTrader 5 / IC Markets / Pepperstone specs.
 */
const INSTRUMENT_REGISTRY: Record<string, InstrumentSpec> = {
  // ── Major forex – USD quoted ───────────────────────────────────────────────
  // pip value/lot: 0.0001 × 100,000 = $10.00
  EURUSD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: true },
  GBPUSD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: true },
  AUDUSD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: true },
  NZDUSD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: true },

  // ── USD-base pairs – non-USD quote (approx as ≈ $10/pip/lot for simulation) ─
  USDCAD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  USDCHF: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },

  // ── JPY pairs – pip value converted via entry price ────────────────────────
  // pip value/lot: 0.01 × 100,000 / entryPrice  (e.g. ≈ $6.67/pip at USDJPY 150)
  USDJPY: { contractSize: 100_000, pipSize: 0.01, digits: 3, assetClass: 'forex', quoteIsUSD: false, quoteIsJPY: true },
  EURJPY: { contractSize: 100_000, pipSize: 0.01, digits: 3, assetClass: 'forex', quoteIsUSD: false, quoteIsJPY: true },
  GBPJPY: { contractSize: 100_000, pipSize: 0.01, digits: 3, assetClass: 'forex', quoteIsUSD: false, quoteIsJPY: true },
  AUDJPY: { contractSize: 100_000, pipSize: 0.01, digits: 3, assetClass: 'forex', quoteIsUSD: false, quoteIsJPY: true },
  NZDJPY: { contractSize: 100_000, pipSize: 0.01, digits: 3, assetClass: 'forex', quoteIsUSD: false, quoteIsJPY: true },
  CADJPY: { contractSize: 100_000, pipSize: 0.01, digits: 3, assetClass: 'forex', quoteIsUSD: false, quoteIsJPY: true },
  CHFJPY: { contractSize: 100_000, pipSize: 0.01, digits: 3, assetClass: 'forex', quoteIsUSD: false, quoteIsJPY: true },

  // ── Non-USD cross pairs (quote ≈ USD for simulation purposes) ─────────────
  EURGBP: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  EURCHF: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  EURCAD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  EURAUD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  EURNZD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  GBPCAD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  GBPCHF: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  GBPAUD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  GBPNZD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  AUDCAD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  AUDCHF: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  AUDNZD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  NZDCAD: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  NZDCHF: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },
  CADCHF: { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: false },

  // ── Metals – USD quoted ────────────────────────────────────────────────────
  // XAUUSD: pip value/lot = 0.1 × 100 = $10.00
  XAUUSD: { contractSize: 100,   pipSize: 0.1,    digits: 2, assetClass: 'metal',  quoteIsUSD: true },
  // XAGUSD: pip value/lot = 0.01 × 5,000 = $50.00
  XAGUSD: { contractSize: 5_000, pipSize: 0.01,   digits: 3, assetClass: 'metal',  quoteIsUSD: true },
  XPTUSD: { contractSize: 100,   pipSize: 0.1,    digits: 2, assetClass: 'metal',  quoteIsUSD: true },
  XPDUSD: { contractSize: 100,   pipSize: 0.1,    digits: 2, assetClass: 'metal',  quoteIsUSD: true },

  // ── US Indices – USD quoted ────────────────────────────────────────────────
  // pip value/lot = pipSize × 1 (1 USD per point per lot)
  US30:   { contractSize: 1, pipSize: 1.0,  digits: 1, assetClass: 'index', quoteIsUSD: true },
  USA30IDXUSD: { contractSize: 1, pipSize: 1.0,  digits: 1, assetClass: 'index', quoteIsUSD: true },
  NAS100: { contractSize: 1, pipSize: 0.25, digits: 2, assetClass: 'index', quoteIsUSD: true },
  USATECHIDXUSD: { contractSize: 1, pipSize: 0.25, digits: 2, assetClass: 'index', quoteIsUSD: true },
  SPX500: { contractSize: 1, pipSize: 0.25, digits: 2, assetClass: 'index', quoteIsUSD: true },
  US500:  { contractSize: 1, pipSize: 0.25, digits: 2, assetClass: 'index', quoteIsUSD: true },
  USA500IDXUSD: { contractSize: 1, pipSize: 0.25, digits: 2, assetClass: 'index', quoteIsUSD: true },
  US2000: { contractSize: 1, pipSize: 0.1,  digits: 1, assetClass: 'index', quoteIsUSD: true },
  VIX:    { contractSize: 1, pipSize: 0.01, digits: 2, assetClass: 'index', quoteIsUSD: true },

  // ── European / Asian Indices ───────────────────────────────────────────────
  GER40:  { contractSize: 1, pipSize: 1.0, digits: 1, assetClass: 'index', quoteIsUSD: false },
  UK100:  { contractSize: 1, pipSize: 1.0, digits: 1, assetClass: 'index', quoteIsUSD: false },
  FRA40:  { contractSize: 1, pipSize: 1.0, digits: 1, assetClass: 'index', quoteIsUSD: false },
  JPN225: { contractSize: 1, pipSize: 1.0, digits: 1, assetClass: 'index', quoteIsUSD: false },
  AUS200: { contractSize: 1, pipSize: 1.0, digits: 1, assetClass: 'index', quoteIsUSD: false },
  HK50:   { contractSize: 1, pipSize: 1.0, digits: 1, assetClass: 'index', quoteIsUSD: false },
  STOXX50:{ contractSize: 1, pipSize: 1.0, digits: 1, assetClass: 'index', quoteIsUSD: false },
  SWI20:  { contractSize: 1, pipSize: 1.0, digits: 1, assetClass: 'index', quoteIsUSD: false },

  // ── Crypto – USD quoted ────────────────────────────────────────────────────
  BTCUSD: { contractSize: 1, pipSize: 0.01,   digits: 2, assetClass: 'crypto', quoteIsUSD: true },
  ETHUSD: { contractSize: 1, pipSize: 0.01,   digits: 2, assetClass: 'crypto', quoteIsUSD: true },
  LTCUSD: { contractSize: 1, pipSize: 0.01,   digits: 2, assetClass: 'crypto', quoteIsUSD: true },
  XRPUSD: { contractSize: 1, pipSize: 0.0001, digits: 4, assetClass: 'crypto', quoteIsUSD: true },
  SOLUSD: { contractSize: 1, pipSize: 0.01,   digits: 2, assetClass: 'crypto', quoteIsUSD: true },
  ADAUSD: { contractSize: 1, pipSize: 0.0001, digits: 4, assetClass: 'crypto', quoteIsUSD: true },
  DOGEUSD:{ contractSize: 1, pipSize: 0.0001, digits: 4, assetClass: 'crypto', quoteIsUSD: true },
};

/** Pattern-based fallback for unknown symbols. */
function inferSpec(normalized: string): InstrumentSpec {
  if (normalized.endsWith('JPY')) {
    return { contractSize: 100_000, pipSize: 0.01, digits: 3, assetClass: 'forex', quoteIsUSD: false, quoteIsJPY: true };
  }
  if (normalized.startsWith('XAU')) {
    return { contractSize: 100, pipSize: 0.1, digits: 2, assetClass: 'metal', quoteIsUSD: true };
  }
  if (normalized.startsWith('XAG')) {
    return { contractSize: 5_000, pipSize: 0.01, digits: 3, assetClass: 'metal', quoteIsUSD: true };
  }
  if (normalized.startsWith('BTC') || normalized.startsWith('ETH') || normalized.startsWith('LTC')) {
    return { contractSize: 1, pipSize: 0.01, digits: 2, assetClass: 'crypto', quoteIsUSD: true };
  }
  if (
    normalized.includes('IDX') ||
    /(?:^|[^A-Z])(100|200|30|40|50|225|500|2000)(?:[^0-9]|$)/.test(normalized)
  ) {
    return { contractSize: 1, pipSize: 1.0, digits: 1, assetClass: 'index', quoteIsUSD: true };
  }
  // Default: standard forex, USD quoted
  return { contractSize: 100_000, pipSize: 0.0001, digits: 5, assetClass: 'forex', quoteIsUSD: true };
}

/**
 * Returns the full instrument specification for a given symbol.
 * Falls back to pattern-based inference for unknown symbols.
 */
export function getInstrumentSpec(instrument?: string): InstrumentSpec {
  const normalized = instrument?.trim().toUpperCase() ?? '';
  return INSTRUMENT_REGISTRY[normalized] ?? inferSpec(normalized);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the pip size (minimum price increment = 1 pip) for a given instrument.
 */
export function getPipSize(instrument?: string): number {
  return getInstrumentSpec(instrument).pipSize;
}

export function formatTradePrice(price: number, instrument?: string): string {
  if (price === undefined || price === null || !Number.isFinite(price)) return '--';
  const spec = getInstrumentSpec(instrument);
  return price.toFixed(spec.digits);
}

/**
 * Returns the contract size (units per 1 standard lot) for a given instrument.
 *
 * Used in the engine P&L formula — together with computeTradePnL this ensures
 * estimates and actual simulation results are always consistent.
 */
export function getContractMultiplier(instrument?: string): number {
  return getInstrumentSpec(instrument).contractSize;
}

/**
 * Returns the pip value in USD per 1 standard lot for a given instrument.
 *
 * This is the key value that drives position sizing.
 *
 * | Instrument | Formula                              | Example (1 lot)      |
 * |------------|--------------------------------------|----------------------|
 * | EURUSD     | 0.0001 × 100,000                     | $10.00               |
 * | XAUUSD     | 0.10   × 100                         | $10.00               |
 * | USDJPY     | 0.01   × 100,000 / entryPrice        | ≈ $6.67 @ 150        |
 * | NAS100     | 0.25   × 1                           | $0.25                |
 * | US30       | 1.00   × 1                           | $1.00                |
 * | BTCUSD     | 0.01   × 1                           | $0.01                |
 *
 * @param instrument    Symbol string
 * @param entryPrice    Required for JPY-quoted pairs to convert JPY → USD
 */
export function getPipValuePerLot(instrument?: string, entryPrice?: number): number {
  const spec = getInstrumentSpec(instrument);
  const rawValue = spec.pipSize * spec.contractSize;
  if (spec.quoteIsJPY && entryPrice && entryPrice > 0) {
    return rawValue / entryPrice;
  }
  return rawValue;
}

/**
 * The single authoritative P&L function for the simulation.
 *
 * Used by BOTH the metrics estimator (overlay) AND the simulation engine
 * (simulatorEngine.ts) to guarantee that pre-trade estimates always match
 * post-trade recorded results.
 *
 * @param type        'buy' or 'sell'
 * @param entryPrice  Price at trade entry
 * @param exitPrice   Price at trade close (SL, TP, or manual)
 * @param lots        Position size in standard lots
 * @param instrument  Symbol string
 */
export function computeTradePnL(
  type: 'buy' | 'sell',
  entryPrice: number,
  exitPrice: number,
  lots: number,
  instrument?: string,
): number {
  const spec = getInstrumentSpec(instrument);

  // Price difference in quote currency
  const rawPnl = type === 'buy'
    ? (exitPrice - entryPrice) * lots * spec.contractSize
    : (entryPrice - exitPrice) * lots * spec.contractSize;

  // JPY-quoted: raw P&L is in JPY → convert to USD via entry price
  if (spec.quoteIsJPY && entryPrice > 0) {
    return rawPnl / entryPrice;
  }

  return rawPnl;
}

/**
 * Computes the real maximum adverse excursion (MAE) and maximum favorable
 * excursion (MFE) of a trade in USD, from the candle data between entry and
 * exit. Uses `computeTradePnL` so excursions are expressed in the exact same
 * P&L terms as recorded trade results.
 *
 * MAE is the worst (most negative) unrealized P&L during the trade (clamped
 * to ≤ 0); MFE is the best (most positive) unrealized P&L (clamped to ≥ 0).
 *
 * @returns `null` when no candles fall in the entry→exit window.
 */
export function computeTradeExcursion(
  candles: Array<{ timestamp: number; high: number; low: number }>,
  entryTs: number,
  exitTs: number,
  type: 'buy' | 'sell',
  entryPrice: number,
  size: number,
  instrument?: string,
): { mae: number; mfe: number } | null {
  if (!candles.length || !entryPrice || size <= 0) return null;

  const minTs = Math.min(entryTs, exitTs);
  const maxTs = Math.max(entryTs, exitTs);

  let worst = 0;
  let best = 0;
  let found = false;

  // Fast binary search for starting candle
  let low = 0;
  let high = candles.length - 1;
  let startIdx = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (candles[mid].timestamp >= minTs) {
      startIdx = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  for (let i = startIdx; i < candles.length; i++) {
    const candle = candles[i];
    if (candle.timestamp > maxTs) break;
    if (candle.timestamp < minTs) continue;
    found = true;
    const atLow = computeTradePnL(type, entryPrice, candle.low, size, instrument);
    const atHigh = computeTradePnL(type, entryPrice, candle.high, size, instrument);
    worst = Math.min(worst, atLow, atHigh);
    best = Math.max(best, atLow, atHigh);
  }

  if (!found) return null;
  return { mae: Math.min(worst, 0), mfe: Math.max(best, 0) };
}

/**
 * Calculates position size in standard lots such that hitting the stop loss
 * results in exactly `riskAmount` USD of loss.
 *
 * Formula: lots = riskAmount / (stopPips × pipValuePerLot)
 *
 * This guarantees that:
 *   computeTradePnL('buy', entryPrice, slPrice, lots, instrument) ≈ -riskAmount
 *
 * @param riskAmount   Desired maximum risk in USD
 * @param entryPrice   Trade entry price (used for JPY conversion)
 * @param stopPrice    Stop loss price
 * @param instrument   Symbol string
 */
export function calculatePositionSize(
  balance: number,
  riskPercent: number,
  riskDollar: number | undefined,
  riskType: 'percent' | 'dollar' | undefined,
  entryPrice: number,
  stopPrice: number,
  instrument?: string,
): number {
  const riskAmount = riskType === 'dollar' && riskDollar !== undefined
    ? riskDollar
    : balance * ((riskPercent ?? 1) / 100);

  const spec = getInstrumentSpec(instrument);
  const stopDistance = Math.abs(entryPrice - stopPrice);
  if (stopDistance <= 0) return 0.01;

  const stopPips = stopDistance / spec.pipSize;
  const pipValue = getPipValuePerLot(instrument, entryPrice);
  if (pipValue <= 0) return 0.01;

  const lots = riskAmount / (stopPips * pipValue);
  return Math.max(0.00001, Number(lots.toFixed(5)));
}

// ─── Draft helpers ─────────────────────────────────────────────────────────────

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function roundPrice(value: number): number {
  return Number(value.toFixed(5));
}

export function createOrderDraft(
  type: ActiveOrderDraft['type'],
  orderType: ActiveOrderDraft['orderType'],
  entryPrice: number,
  instrument?: string,
): ActiveOrderDraft {
  const spec = getInstrumentSpec(instrument);
  const pip = spec.pipSize || 0.0001;
  const defaultSlDistance = Math.max(pip * 25, entryPrice * 0.002);
  const defaultTpDistance = defaultSlDistance * 2; // Default 1:2 R:R

  const isBuy = type === 'buy';
  const sl = isBuy ? entryPrice - defaultSlDistance : entryPrice + defaultSlDistance;
  const tp = isBuy ? entryPrice + defaultTpDistance : entryPrice - defaultTpDistance;

  return {
    type,
    orderType,
    entryPrice: roundPrice(entryPrice),
    riskType: 'percent',
    riskValue: 1,
    sl: roundPrice(sl),
    tp: roundPrice(tp),
    phase: 'ready',
  };
}

export function normalizeOrderDraft(
  draft: ActiveOrderDraft,
  updates?: Partial<ActiveOrderDraft>,
  instrument?: string,
): ActiveOrderDraft {
  const merged = { ...draft, ...updates };

  // If changing direction from buy to sell or vice versa, flip SL and TP across entry
  let nextSl = merged.sl;
  let nextTp = merged.tp;
  if (updates?.type && updates.type !== draft.type && draft.entryPrice) {
    const isNowBuy = updates.type === 'buy';
    const entry = draft.entryPrice;
    if (draft.sl != null) {
      const slDist = Math.abs(entry - draft.sl);
      nextSl = isNowBuy ? entry - slDist : entry + slDist;
    }
    if (draft.tp != null) {
      const tpDist = Math.abs(entry - draft.tp);
      nextTp = isNowBuy ? entry + tpDist : entry - tpDist;
    }
  }

  const computedPhase = updates?.phase ?? (
    merged.sl && merged.tp ? 'ready' :
    merged.sl ? 'placing-tp' : 'placing-sl'
  );

  const nextDraft: ActiveOrderDraft = {
    ...merged,
    entryPrice: isFinitePositive(merged.entryPrice) ? roundPrice(merged.entryPrice) : draft.entryPrice,
    riskValue: isFinitePositive(merged.riskValue) ? Number(merged.riskValue.toFixed(2)) : draft.riskValue,
    sl: isFinitePositive(nextSl) ? roundPrice(nextSl) : undefined,
    tp: isFinitePositive(nextTp) ? roundPrice(nextTp) : undefined,
    phase: computedPhase,
  };

  return nextDraft;
}

export function getOrderReferencePrice(draft: ActiveOrderDraft, currentPrice?: number): number {
  if (draft.orderType === 'market' && isFinitePositive(currentPrice)) {
    return roundPrice(currentPrice);
  }
  return roundPrice(draft.entryPrice);
}

// ─── Metrics ───────────────────────────────────────────────────────────────────

export interface OrderDraftMetrics {
  entryPrice: number;
  stopDistance: number;
  targetDistance: number;
  stopPips: number;
  targetPips: number;
  riskAmount: number;
  estimatedSize: number;
  estimatedLoss: number;
  estimatedGain: number;
  riskRewardRatio: number | null;
  rewardMultiple: number | null;
  riskPercent: number;
  rewardPercent: number;
}

/**
 * Computes all display metrics for the order draft overlay.
 *
 * All values use the same formulas as the simulation engine, so what you see
 * before confirming will exactly match what you see after the trade closes.
 */
export function getOrderDraftMetrics(
  draft: ActiveOrderDraft,
  balance: number,
  instrument?: string,
  currentPrice?: number,
): OrderDraftMetrics {
  const entryPrice = getOrderReferencePrice(draft, currentPrice);
  const spec = getInstrumentSpec(instrument);

  const stopDistance = draft.sl ? Math.abs(entryPrice - draft.sl) : 0;
  const targetDistance = draft.tp ? Math.abs(draft.tp - entryPrice) : 0;
  const stopPips = stopDistance > 0 ? stopDistance / spec.pipSize : 0;
  const targetPips = targetDistance > 0 ? targetDistance / spec.pipSize : 0;

  const riskAmount = draft.riskType === 'dollar'
    ? draft.riskValue
    : balance * (draft.riskValue / 100);

  const estimatedSize = draft.sl
    ? calculatePositionSize(
        balance,
        draft.riskType === 'percent' ? draft.riskValue : 1,
        draft.riskType === 'dollar' ? draft.riskValue : undefined,
        draft.riskType,
        entryPrice,
        draft.sl,
        instrument,
      )
    : 0;

  const riskRewardRatio = stopDistance > 0 && targetDistance > 0
    ? targetDistance / stopDistance
    : null;

  const rewardMultiple = riskRewardRatio;

  // Estimated loss: use computeTradePnL to guarantee consistency with engine
  const estimatedLoss = draft.sl && estimatedSize > 0
    ? computeTradePnL(draft.type, entryPrice, draft.sl, estimatedSize, instrument)
    : 0;

  // Estimated gain: use computeTradePnL for consistency
  const estimatedGain = draft.tp && estimatedSize > 0
    ? computeTradePnL(draft.type, entryPrice, draft.tp, estimatedSize, instrument)
    : 0;

  const riskPercent = balance > 0
    ? (Math.abs(estimatedLoss) / balance) * 100
    : draft.riskValue;

  const rewardPercent = balance > 0 && estimatedGain > 0
    ? (estimatedGain / balance) * 100
    : 0;

  return {
    entryPrice,
    stopDistance,
    targetDistance,
    stopPips,
    targetPips,
    riskAmount,
    estimatedSize,
    estimatedLoss,
    estimatedGain,
    riskRewardRatio,
    rewardMultiple,
    riskPercent,
    rewardPercent,
  };
}

// ─── Validation ────────────────────────────────────────────────────────────────

export interface OrderDraftValidation {
  errors: string[];
  warnings: string[];
  canSubmit: boolean;
}

export function validateOrderDraft(
  draft: ActiveOrderDraft,
  currentPrice?: number,
): OrderDraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entryPrice = getOrderReferencePrice(draft, currentPrice);

  if (!isFinitePositive(entryPrice)) {
    errors.push('Entry price must be greater than zero.');
  }

  if (!isFinitePositive(draft.riskValue)) {
    errors.push('Risk must be greater than zero.');
  }

  if (!draft.sl) {
    errors.push('Stop loss is required before confirming an order.');
  }

  if (isFinitePositive(currentPrice) && draft.orderType !== 'market') {
    if (draft.orderType === 'limit') {
      if (draft.type === 'buy'  && !(entryPrice < currentPrice)) errors.push('Buy limit entry must be below the current price.');
      if (draft.type === 'sell' && !(entryPrice > currentPrice)) errors.push('Sell limit entry must be above the current price.');
    }
    if (draft.orderType === 'stop') {
      if (draft.type === 'buy'  && !(entryPrice > currentPrice)) errors.push('Buy stop entry must be above the current price.');
      if (draft.type === 'sell' && !(entryPrice < currentPrice)) errors.push('Sell stop entry must be below the current price.');
    }
  }

  if (draft.sl) {
    if (draft.type === 'buy'  && !(draft.sl < entryPrice)) errors.push('Buy orders need the stop loss below entry.');
    if (draft.type === 'sell' && !(draft.sl > entryPrice)) errors.push('Sell orders need the stop loss above entry.');
  }

  if (draft.tp) {
    if (draft.type === 'buy'  && !(draft.tp > entryPrice)) errors.push('Buy orders need the take profit above entry.');
    if (draft.type === 'sell' && !(draft.tp < entryPrice)) errors.push('Sell orders need the take profit below entry.');
  } else if (draft.phase === 'ready') {
    warnings.push('No take profit is set for this order.');
  }

  return { errors, warnings, canSubmit: errors.length === 0 };
}

// ─── Trade update validation ────────────────────────────────────────────────────

export function validateTradeUpdate(
  trade: Trade,
  updates: Partial<Trade>,
  currentPrice?: number,
): { isValid: boolean; errors: string[]; nextTrade: Trade } {
  const nextTrade: Trade = {
    ...trade,
    ...updates,
    limitPrice: isFinitePositive(updates.limitPrice) ? roundPrice(updates.limitPrice) : updates.limitPrice === undefined ? trade.limitPrice : undefined,
    sl: isFinitePositive(updates.sl) ? roundPrice(updates.sl) : updates.sl === undefined ? trade.sl : undefined,
    tp: isFinitePositive(updates.tp) ? roundPrice(updates.tp) : updates.tp === undefined ? trade.tp : undefined,
  };

  const errors: string[] = [];
  const entryReference = nextTrade.entryPrice ?? nextTrade.limitPrice;

  if (nextTrade.status === 'pending') {
    if (!isFinitePositive(nextTrade.limitPrice)) {
      errors.push('Pending orders require a valid entry price.');
    }

    if (isFinitePositive(currentPrice) && isFinitePositive(nextTrade.limitPrice)) {
      if (nextTrade.orderType === 'limit') {
        if (nextTrade.type === 'buy'  && !(nextTrade.limitPrice < currentPrice)) errors.push('Buy limit entry must remain below the current price.');
        if (nextTrade.type === 'sell' && !(nextTrade.limitPrice > currentPrice)) errors.push('Sell limit entry must remain above the current price.');
      }
      if (nextTrade.orderType === 'stop') {
        if (nextTrade.type === 'buy'  && !(nextTrade.limitPrice > currentPrice)) errors.push('Buy stop entry must remain above the current price.');
        if (nextTrade.type === 'sell' && !(nextTrade.limitPrice < currentPrice)) errors.push('Sell stop entry must remain below the current price.');
      }
    }
  }

  if (entryReference) {
    if (nextTrade.sl !== undefined) {
      if (nextTrade.type === 'buy'  && !(nextTrade.sl < entryReference)) errors.push('Buy orders need the stop loss below entry.');
      if (nextTrade.type === 'sell' && !(nextTrade.sl > entryReference)) errors.push('Sell orders need the stop loss above entry.');
    }
    if (nextTrade.tp !== undefined) {
      if (nextTrade.type === 'buy'  && !(nextTrade.tp > entryReference)) errors.push('Buy orders need the take profit above entry.');
      if (nextTrade.type === 'sell' && !(nextTrade.tp < entryReference)) errors.push('Sell orders need the take profit below entry.');
    }
  }

  return { isValid: errors.length === 0, errors, nextTrade };
}

// ─── Order payload builder ──────────────────────────────────────────────────────

/**
 * Builds the Trade payload from a confirmed draft.
 * instrument is required so that position sizing uses the correct contract spec.
 */
export function buildOrderPayloadFromDraft(
  draft: ActiveOrderDraft,
  balance: number,
  currentPrice: number,
  extras: Pick<Trade, 'strategyId' | 'checklistHits'>,
  instrument?: string,
): Omit<Trade, 'id' | 'orderTime' | 'status' | 'entryTime' | 'entryPrice'> {
  const metrics = getOrderDraftMetrics(draft, balance, instrument, currentPrice);

  return {
    type: draft.type,
    orderType: draft.orderType,
    limitPrice: draft.orderType === 'market' ? undefined : metrics.entryPrice,
    size: metrics.estimatedSize,
    riskType: draft.riskType,
    riskPercent: draft.riskType === 'percent' ? draft.riskValue : undefined,
    riskDollar:  draft.riskType === 'dollar'  ? draft.riskValue : undefined,
    sl: draft.sl,
    tp: draft.tp,
    strategyId: extras.strategyId,
    checklistHits: extras.checklistHits,
  };
}

// ─── Session helpers ────────────────────────────────────────────────────────────

export function getCurrentSessionPrice(
  session: { data: Candle[]; currentIndex: number } | null | undefined,
): number | undefined {
  const price = session?.data?.[session.currentIndex]?.close;
  return isFinitePositive(price) ? roundPrice(price) : undefined;
}
