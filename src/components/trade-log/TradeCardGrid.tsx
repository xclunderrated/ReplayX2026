import React from 'react';
import { clsx } from 'clsx';
import { EnrichedTrade, formatDuration, formatTradeTime } from '../../services/math/tradeMetrics';
import {
  ArrowUpRight,
  ArrowDownRight,
  Play,
  Download,
  FileText,
  Flame,
  ShieldAlert,
  Calendar,
  Layers,
  Award,
} from 'lucide-react';

interface TradeCardGridProps {
  trades: EnrichedTrade[];
  selectedTradeIds: Set<string>;
  onToggleSelectTrade: (id: string) => void;
  onReplayTrade: (trade: EnrichedTrade) => void;
  onInspectTrade: (trade: EnrichedTrade) => void;
  onExportSinglePdf: (trade: EnrichedTrade) => void;
}

export default function TradeCardGrid({
  trades,
  selectedTradeIds,
  onToggleSelectTrade,
  onReplayTrade,
  onInspectTrade,
  onExportSinglePdf,
}: TradeCardGridProps) {
  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] text-[var(--text-muted)]">
        <Layers size={36} className="mb-3 opacity-40" />
        <p className="text-sm font-medium">No trades found matching current filter criteria.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {trades.map((trade) => {
        const isSelected = selectedTradeIds.has(trade.id);
        const pnl = Number(trade.pnl || 0);
        const isWin = pnl > 0.5;
        const isLoss = pnl < -0.5;
        const pnlSign = pnl >= 0 ? '+' : '';

        return (
          <div
            key={trade.id}
            onClick={() => onInspectTrade(trade)}
            className={clsx(
              'group relative flex flex-col justify-between p-4 rounded-2xl border bg-[var(--app-bg)] hover:border-[var(--accent-1)]/60 hover:shadow-md transition-all cursor-pointer select-none',
              isSelected ? 'border-[var(--accent-1)] bg-[var(--accent-1)]/5 ring-1 ring-[var(--accent-1)]' : 'border-[var(--border-soft)] shadow-2xs'
            )}
          >
            {/* Header: Checkbox + Pair + Side + Grade Badge */}
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleSelectTrade(trade.id);
                  }}
                  className="rounded border-[var(--border-soft)] text-[var(--accent-1)] focus:ring-0 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-bold text-[var(--text-primary)]">{trade.instrument}</span>
                    <span
                      className={clsx(
                        'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider',
                        trade.type === 'buy'
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                      )}
                    >
                      {trade.type === 'buy' ? <ArrowUpRight size={11} className="mr-0.5" /> : <ArrowDownRight size={11} className="mr-0.5" />}
                      {trade.type}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] font-medium mt-0.5">
                    {trade.sessionName} • {trade.timeframe.toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Grade Badge */}
              <span
                className={clsx(
                  'px-2 py-0.5 rounded-lg text-[10px] font-extrabold font-mono border',
                  trade.grade === 'A+' || trade.grade === 'A'
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : trade.grade === 'B' || trade.grade === 'C'
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    : trade.grade === 'D' || trade.grade === 'F'
                    ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                    : 'bg-[var(--surface-3)] text-[var(--text-muted)] border-transparent'
                )}
              >
                {trade.grade || '—'}
              </span>
            </div>

            {/* PnL & Return Display */}
            <div className="my-3.5 flex items-baseline justify-between border-y border-[var(--border-soft)] py-3">
              <div>
                <div
                  className={clsx(
                    'text-2xl font-black font-mono tracking-tight',
                    isWin ? 'text-emerald-500' : isLoss ? 'text-rose-500' : 'text-[var(--text-muted)]'
                  )}
                >
                  {pnlSign}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1">
                  {trade.pipGain >= 0 ? '+' : ''}{trade.pipGain} pips • {trade.size} lot{trade.size > 1 ? 's' : ''}
                </div>
              </div>

              <div className="text-right">
                {trade.riskAmountDollar > 0 ? (
                  <>
                    <span
                      className={clsx(
                        'inline-block px-2.5 py-1 rounded-lg text-xs font-bold font-mono',
                        trade.calculatedRMultiple >= 0
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-rose-500/10 text-rose-500'
                      )}
                    >
                      {trade.calculatedRMultiple >= 0 ? '+' : ''}{trade.calculatedRMultiple}R
                    </span>
                    <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1">
                      Risk: ${trade.riskAmountDollar.toFixed(0)}
                    </div>
                  </>
                ) : (
                  <>
                    <span className="inline-block px-2 py-1 text-xs text-[var(--text-muted)] font-mono">—</span>
                    <div className="text-[11px] text-[var(--text-muted)] mt-1">No SL</div>
                  </>
                )}
              </div>
            </div>

            {/* Excursion & Duration Metrics */}
            <div className="grid grid-cols-2 gap-2 text-[11px] mb-3.5 font-mono">
              <div className="p-2 rounded-xl bg-[var(--surface-ghost)] border border-[var(--border-soft)]">
                <div className="text-[9px] uppercase font-bold text-[var(--text-muted)] mb-0.5 flex items-center gap-1">
                  <Flame size={11} className="text-teal-500" />
                  <span>Max MFE</span>
                </div>
                <div className="font-bold text-teal-500">+${trade.mfeDollar.toFixed(0)}</div>
              </div>

              <div className="p-2 rounded-xl bg-[var(--surface-ghost)] border border-[var(--border-soft)]">
                <div className="text-[9px] uppercase font-bold text-[var(--text-muted)] mb-0.5 flex items-center gap-1">
                  <ShieldAlert size={11} className="text-rose-500" />
                  <span>Max MAE</span>
                </div>
                <div className="font-bold text-rose-500">-${trade.maeDollar.toFixed(0)}</div>
              </div>
            </div>

            {/* Footer Details & Quick Action Bar */}
            <div className="flex items-center justify-between text-[11px] pt-1">
              <div className="text-[11px] text-[var(--text-muted)]">
                {formatTradeTime(trade.entryTime || trade.orderTime)}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExportSinglePdf(trade);
                  }}
                  className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                  title="Export PDF Autopsy"
                >
                  <Download size={14} />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReplayTrade(trade);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--accent-1)] text-white hover:opacity-90 transition-opacity shadow-xs cursor-pointer"
                >
                  <Play size={12} />
                  <span>Replay</span>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
