import React from 'react';
import { clsx } from 'clsx';
import { EnrichedTrade } from '../../services/math/tradeMetrics';
import { computeTradePnL, getPipSize } from '../../lib/orders';
import { Candle } from '../../store/useSimulatorStore';
import {
  TrendingUp,
  Crosshair,
  Flame,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Clock,
} from 'lucide-react';

interface ReplayTelemetryWidgetProps {
  trade: EnrichedTrade;
  currentCandle?: Candle;
  visibleIndex: number;
  entryIndex: number;
  exitIndex: number;
}

export default function ReplayTelemetryWidget({
  trade,
  currentCandle,
  visibleIndex,
  entryIndex,
  exitIndex,
}: ReplayTelemetryWidgetProps) {
  const isInTrade = visibleIndex >= entryIndex && visibleIndex <= exitIndex;
  const isPreEntry = visibleIndex < entryIndex;
  const isPostExit = visibleIndex > exitIndex;

  const currentPrice = currentCandle ? currentCandle.close : Number(trade.entryPrice || 0);
  const entryPrice = Number(trade.entryPrice || currentPrice);
  const pipSize = getPipSize(trade.instrument);
  const size = Number(trade.size || 1);

  // Calculate live floating PnL & Pips at this exact candle
  let liveFloatingPnl = 0;
  let liveFloatingPips = 0;
  let liveFloatingR = 0;

  if (isInTrade && entryPrice > 0 && currentPrice > 0) {
    const diff = trade.type === 'buy' ? currentPrice - entryPrice : entryPrice - currentPrice;
    liveFloatingPips = pipSize > 0 ? Number((diff / pipSize).toFixed(1)) : 0;
    liveFloatingPnl = Number(computeTradePnL(trade.type, entryPrice, currentPrice, size, trade.instrument).toFixed(2));
    if (trade.riskAmountDollar > 0) {
      liveFloatingR = Number((liveFloatingPnl / trade.riskAmountDollar).toFixed(2));
    }
  } else if (isPostExit) {
    liveFloatingPnl = Number(trade.pnl || 0);
    liveFloatingPips = trade.pipGain;
    liveFloatingR = trade.calculatedRMultiple;
  }

  const pnlSign = liveFloatingPnl >= 0 ? '+' : '';

  return (
    <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 p-3 rounded-2xl bg-[var(--app-bg)]/90 backdrop-blur-md border border-[var(--border-soft)] shadow-lg select-none min-w-[220px]">
      {/* Top Status Badge */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-soft)] pb-2">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-xs text-[var(--text-primary)]">{trade.instrument}</span>
          <span
            className={clsx(
              'px-1.5 py-0.2 rounded text-[9px] font-bold uppercase',
              trade.type === 'buy' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
            )}
          >
            {trade.type}
          </span>
        </div>

        <div className={clsx(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
          isPreEntry
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
            : isInTrade
            ? 'bg-blue-500/10 border-blue-500/30 text-blue-500 animate-pulse'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
        )}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          <span>{isPreEntry ? 'PRE-TRADE' : isInTrade ? 'IN TRADE' : 'POST-EXIT'}</span>
        </div>
      </div>

      {/* Floating PnL Display */}
      {isInTrade || isPostExit ? (
        <div>
          <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
            {isInTrade ? 'Floating PnL' : 'Final Realized PnL'}
          </div>
          <div
            className={clsx(
              'text-lg font-black tracking-tight',
              liveFloatingPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'
            )}
          >
            {pnlSign}${liveFloatingPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold mt-0.5">
            <span
              className={clsx(
                'px-1.5 py-0.2 rounded font-mono',
                liveFloatingR >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
              )}
            >
              {pnlSign}{liveFloatingR}R
            </span>
            <span className="text-[var(--text-secondary)] font-mono">
              ({liveFloatingPips >= 0 ? '+' : ''}{liveFloatingPips} pips)
            </span>
          </div>
        </div>
      ) : (
        <div className="py-1 text-xs text-[var(--text-muted)] font-medium">
          Observing price action leading into entry trigger...
        </div>
      )}

      {/* Price Levels Breakdown */}
      <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[var(--border-soft)] text-[10px]">
        <div>
          <span className="text-[var(--text-muted)]">Current Bar:</span>
          <div className="font-mono font-bold text-[var(--text-primary)]">{currentPrice.toFixed(5)}</div>
        </div>
        <div>
          <span className="text-[var(--text-muted)]">Entry Level:</span>
          <div className="font-mono font-bold text-[var(--text-primary)]">{entryPrice.toFixed(5)}</div>
        </div>
        {trade.sl && (
          <div>
            <span className="text-[var(--text-muted)]">Stop Loss:</span>
            <div className="font-mono font-bold text-rose-500">{Number(trade.sl).toFixed(5)}</div>
          </div>
        )}
        {trade.tp && (
          <div>
            <span className="text-[var(--text-muted)]">Take Profit:</span>
            <div className="font-mono font-bold text-emerald-500">{Number(trade.tp).toFixed(5)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
