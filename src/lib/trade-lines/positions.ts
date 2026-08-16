import * as Drawings from 'lightweight-charts-drawing';
import type { Trade } from '../../store/useSimulatorStore';
import type { ActiveOrderDraft } from '../orders';
import { getOrderReferencePrice, getPipSize } from '../orders';
import { DRAFT_TRADE_DRAWING_ID, tradeEntryLineId, tradePnlLabelId, tradeSlLineId, tradeTpLineId } from './ids';
import { TradeLineDrawing, TradePnlLabel } from './tradeLineDrawing';

const ENTRY_COLOR = '#2962ff';
const SL_COLOR = '#ef5350';
const TP_COLOR = '#26a69a';
const BUY_COLOR = '#089981';
const SELL_COLOR = '#f23645';

const POSITION_STYLE: Partial<Drawings.DrawingStyle> = {
  lineColor: ENTRY_COLOR,
  lineWidth: 2,
};

const POSITION_OPTIONS: Partial<Drawings.LongPositionOptions> = {
  showPrices: true,
  showPercentage: true,
  showRiskReward: true,
  visible: true,
  locked: false,
  zIndex: 1000,
};

const SL_LINE_STYLE: Partial<Drawings.DrawingStyle> = {
  lineColor: SL_COLOR,
  lineWidth: 2,
};

const TP_LINE_STYLE: Partial<Drawings.DrawingStyle> = {
  lineColor: TP_COLOR,
  lineWidth: 2,
};

const ENTRY_LINE_STYLE: Partial<Drawings.DrawingStyle> = {
  lineColor: ENTRY_COLOR,
  lineWidth: 2,
};

const LINE_OPTIONS: Partial<Drawings.DrawingOptions> = {
  visible: true,
  locked: false,
  zIndex: 900,
};

const ENTRY_LINE_OPTIONS: Partial<Drawings.DrawingOptions> = {
  visible: true,
  locked: true,
  zIndex: 950,
};

/** Compact price text used in the line chips, e.g. 1.23456 or 2345.60. */
export function formatTradePrice(price: number): string {
  if (!Number.isFinite(price)) return '';
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toFixed(2);
  if (abs >= 100) return price.toFixed(3);
  return price.toFixed(5);
}

/** Live PnL note text drawn next to the entry line, TradingView position-label style. */
export function formatTradePnlNote(trade: Trade, currentPrice?: number, multiplier = 1): string {
  const side = trade.type === 'buy' ? 'BUY' : 'SELL';
  const effectiveSize = trade.remainingSize ?? trade.size;
  const formattedSize = Number(effectiveSize.toFixed(4));
  const size = `${formattedSize} L`;
  if (trade.status === 'pending') {
    const limit = trade.limitPrice ?? 0;
    return `${side} ${size} @ ${formatTradePrice(limit)}`;
  }
  let pnl = 0;
  if (trade.entryPrice && currentPrice !== undefined && Number.isFinite(currentPrice)) {
    pnl = trade.type === 'buy'
      ? (currentPrice - trade.entryPrice) * effectiveSize * multiplier
      : (trade.entryPrice - currentPrice) * effectiveSize * multiplier;
  }
  const sign = pnl >= 0 ? '+' : '';
  return `${side} ${size} ${sign}$${pnl.toFixed(2)}`;
}

export interface PositionDrawingInput {
  id: string;
  type: 'buy' | 'sell';
  entryPrice: number;
  sl?: number;
  tp?: number;
  /** Chart time (ordinal or timestamp) of the bar the box is anchored to. */
  time: number;
  quantity: number;
}

export function createPositionDrawing(input: PositionDrawingInput): Drawings.IDrawing {
  const time = input.time as any;
  const entry: Drawings.Anchor = { time, price: input.entryPrice };
  const stopLoss: Drawings.Anchor = { time, price: input.sl ?? input.entryPrice };
  const takeProfit: Drawings.Anchor = { time, price: input.tp ?? input.entryPrice };
  const options: Partial<Drawings.LongPositionOptions> = {
    ...POSITION_OPTIONS,
    quantity: input.quantity,
  };

  if (input.type === 'buy') {
    return Drawings.LongPosition.create(input.id, entry, stopLoss, takeProfit, POSITION_STYLE, options);
  }
  return Drawings.ShortPosition.create(input.id, entry, stopLoss, takeProfit, POSITION_STYLE, options);
}

/**
 * Project an open/pending trade onto the chart as three full-width lines —
 * entry (solid blue, fixed) + stop-loss + take-profit (solid, draggable) —
 * plus a canvas-native TradingView-style PnL label (PriceNote) pinned to the
 * entry line at the current bar. The trading tool box only exists while the
 * order is being drafted; once a trade is entered, the chart shows plain
 * lines that are dragged directly to adjust the trade.
 *
 * `pnlNote` is the live label text (BUY/SELL + size + PnL or limit price);
 * the hook refreshes it on every recompute via `setNote`, so the canvas
 * repaints without recreating the drawing.
 */
export function tradeToTradeLineDrawings(
  trade: Trade,
  time: number,
  pnlNote: string,
  pnlLabelColor: string,
): Drawings.IDrawing[] {
  const drawings: Drawings.IDrawing[] = [];
  const t = time as any;

  const entry = trade.entryPrice ?? trade.limitPrice;
  if (entry != null && Number.isFinite(entry)) {
    const entryLabel = trade.status === 'pending'
      ? `LMT ${formatTradePrice(entry)}`
      : `ENTRY ${formatTradePrice(entry)}`;

    drawings.push(
      TradeLineDrawing.create(
        tradeEntryLineId(trade.id),
        'entry',
        entry,
        time,
        entryLabel,
        ENTRY_LINE_STYLE,
        ENTRY_LINE_OPTIONS,
      ),
    );
  }

  if (trade.sl != null && Number.isFinite(trade.sl)) {
    drawings.push(
      TradeLineDrawing.create(
        tradeSlLineId(trade.id),
        'sl',
        trade.sl,
        time,
        `SL ${formatTradePrice(trade.sl)}`,
        SL_LINE_STYLE,
        LINE_OPTIONS,
      ),
    );
  }

  if (trade.tp != null && Number.isFinite(trade.tp)) {
    drawings.push(
      TradeLineDrawing.create(
        tradeTpLineId(trade.id),
        'tp',
        trade.tp,
        time,
        `TP ${formatTradePrice(trade.tp)}`,
        TP_LINE_STYLE,
        LINE_OPTIONS,
      ),
    );
  }

  if (entry != null && Number.isFinite(entry)) {
    drawings.push(
      TradePnlLabel.create(
        tradePnlLabelId(trade.id),
        { time: t, price: entry },
        pnlNote,
        { lineColor: pnlLabelColor, lineWidth: 2 },
        { chipColor: pnlLabelColor, fontSize: 12 },
      ),
    );
  }

  return drawings;
}

/**
 * Project the in-progress order draft onto the chart as a position drawing.
 *
 * While the draft is in its click-to-place phases the SL/TP may not be set
 * yet; the box still renders with default placeholder offsets so the full
 * position tool is visible from the moment the order entry starts. Real
 * values replace the placeholders the moment they are set.
 */
export function draftToPositionDrawing(
  draft: ActiveOrderDraft,
  time: number,
  currentPrice?: number,
  instrument?: string,
): Drawings.IDrawing | null {
  const entry = getOrderReferencePrice(draft, currentPrice);
  if (entry == null || !Number.isFinite(entry)) return null;

  const defaultDistance = Math.max(getPipSize(instrument) * 50, entry * 0.0001);
  const isBuy = draft.type === 'buy';
  const sl = draft.sl ?? (isBuy ? entry - defaultDistance : entry + defaultDistance);
  const tp = draft.tp ?? (isBuy ? entry + defaultDistance * 2 : entry - defaultDistance * 2);

  return createPositionDrawing({
    id: DRAFT_TRADE_DRAWING_ID,
    type: draft.type,
    entryPrice: entry,
    sl,
    tp,
    time,
    quantity: 1,
  });
}
