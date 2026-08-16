import React, { useState } from 'react';
import { clsx } from 'clsx';
import { EnrichedTrade, formatDuration, formatTradeTime } from '../../services/math/tradeMetrics';
import {
  ArrowUpRight,
  ArrowDownRight,
  Play,
  FileText,
  Download,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Award,
  AlertCircle,
  ExternalLink,
  Flame,
  ShieldAlert,
} from 'lucide-react';

interface TradeTableProps {
  trades: EnrichedTrade[];
  selectedTradeIds: Set<string>;
  onToggleSelectTrade: (id: string) => void;
  onToggleSelectAll: () => void;
  onReplayTrade: (trade: EnrichedTrade) => void;
  onInspectTrade: (trade: EnrichedTrade) => void;
  onExportSinglePdf: (trade: EnrichedTrade) => void;
}

type SortField = 'date' | 'pnl' | 'r' | 'pips' | 'duration' | 'instrument' | 'mae' | 'mfe';
type SortOrder = 'asc' | 'desc';

export default function TradeTable({
  trades,
  selectedTradeIds,
  onToggleSelectTrade,
  onToggleSelectAll,
  onReplayTrade,
  onInspectTrade,
  onExportSinglePdf,
}: TradeTableProps) {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortedTrades = [...trades].sort((a, b) => {
    let valA = 0;
    let valB = 0;

    switch (sortField) {
      case 'date':
        valA = a.exitTime || a.entryTime || a.orderTime || 0;
        valB = b.exitTime || b.entryTime || b.orderTime || 0;
        break;
      case 'pnl':
        valA = Number(a.pnl || 0);
        valB = Number(b.pnl || 0);
        break;
      case 'r':
        valA = a.calculatedRMultiple;
        valB = b.calculatedRMultiple;
        break;
      case 'pips':
        valA = a.pipGain;
        valB = b.pipGain;
        break;
      case 'duration':
        valA = a.calculatedDurationMs;
        valB = b.calculatedDurationMs;
        break;
      case 'mae':
        valA = a.maeDollar;
        valB = b.maeDollar;
        break;
      case 'mfe':
        valA = a.mfeDollar;
        valB = b.mfeDollar;
        break;
      case 'instrument':
        return sortOrder === 'asc'
          ? a.instrument.localeCompare(b.instrument)
          : b.instrument.localeCompare(a.instrument);
    }

    return sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  const isAllSelected = trades.length > 0 && selectedTradeIds.size === trades.length;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-2)] text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider select-none">
              <th className="w-12 px-4 py-3.5 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={onToggleSelectAll}
                  className="rounded border-[var(--border-soft)] text-[var(--accent-1)] focus:ring-0 cursor-pointer"
                />
              </th>
              <th
                onClick={() => handleSort('date')}
                className="px-4 py-3.5 cursor-pointer hover:text-[var(--text-primary)] transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Execution Date</span>
                  {sortField === 'date' && (sortOrder === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                </div>
              </th>
              <th
                onClick={() => handleSort('instrument')}
                className="px-4 py-3.5 cursor-pointer hover:text-[var(--text-primary)] transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Pair / Side</span>
                  {sortField === 'instrument' && (sortOrder === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                </div>
              </th>
              <th className="px-4 py-3.5">Session / TF</th>
              <th className="px-4 py-3.5">Entry → Exit</th>
              <th
                onClick={() => handleSort('pips')}
                className="px-4 py-3.5 cursor-pointer hover:text-[var(--text-primary)] transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Pips / Lots</span>
                  {sortField === 'pips' && (sortOrder === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                </div>
              </th>
              <th
                onClick={() => handleSort('pnl')}
                className="px-4 py-3.5 cursor-pointer hover:text-[var(--text-primary)] transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Net PnL ($)</span>
                  {sortField === 'pnl' && (sortOrder === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                </div>
              </th>
              <th
                onClick={() => handleSort('r')}
                className="px-4 py-3.5 cursor-pointer hover:text-[var(--text-primary)] transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Return (R)</span>
                  {sortField === 'r' && (sortOrder === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                </div>
              </th>
              <th
                onClick={() => handleSort('mae')}
                className="px-4 py-3.5 cursor-pointer hover:text-[var(--text-primary)] transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>MAE / MFE</span>
                  {sortField === 'mae' && (sortOrder === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                </div>
              </th>
              <th
                onClick={() => handleSort('duration')}
                className="px-4 py-3.5 cursor-pointer hover:text-[var(--text-primary)] transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Duration</span>
                  {sortField === 'duration' && (sortOrder === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                </div>
              </th>
              <th className="px-4 py-3.5 text-center">Grade</th>
              <th className="px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border-soft)]">
            {sortedTrades.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center text-sm text-[var(--text-muted)]">
                  No trades found matching current filter criteria.
                </td>
              </tr>
            ) : (
              sortedTrades.map((trade) => {
                const isSelected = selectedTradeIds.has(trade.id);
                const pnl = Number(trade.pnl || 0);
                const isWin = pnl > 0.5;
                const isLoss = pnl < -0.5;
                const pnlSign = pnl >= 0 ? '+' : '';

                return (
                  <tr
                    key={trade.id}
                    className={clsx(
                      'group hover:bg-[var(--surface-2)] transition-colors cursor-pointer',
                      isSelected && 'bg-[var(--accent-1)]/5'
                    )}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (!target.closest('button') && !target.closest('input')) {
                        onInspectTrade(trade);
                      }
                    }}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelectTrade(trade.id)}
                        className="rounded border-[var(--border-soft)] text-[var(--accent-1)] focus:ring-0 cursor-pointer"
                      />
                    </td>

                    {/* Date & Time */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {formatTradeTime(trade.entryTime || trade.orderTime)}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        Exit: {formatTradeTime(trade.exitTime)}
                      </div>
                    </td>

                    {/* Pair & Direction */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)]">{trade.instrument}</span>
                        <span
                          className={clsx(
                            'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider',
                            trade.type === 'buy'
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                          )}
                        >
                          {trade.type === 'buy' ? (
                            <ArrowUpRight size={12} className="mr-0.5" />
                          ) : (
                            <ArrowDownRight size={12} className="mr-0.5" />
                          )}
                          {trade.type}
                        </span>
                      </div>
                      {trade.setupTag && (
                        <div className="text-[11px] text-[var(--text-muted)] truncate max-w-[130px] mt-0.5">
                          {trade.setupTag}
                        </div>
                      )}
                    </td>

                    {/* Session & TF */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="font-medium text-[var(--text-secondary)] truncate max-w-[140px]" title={trade.sessionName}>
                        {trade.sessionName}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold mt-0.5">
                        {trade.timeframe} {trade.isArchived ? '(Archived)' : ''}
                      </div>
                    </td>

                    {/* Price Range */}
                    <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px]">
                      <div className="text-[var(--text-primary)] font-medium">
                        {Number(trade.entryPrice || 0).toFixed(5)}
                      </div>
                      <div className="text-[var(--text-muted)] mt-0.5">
                        → {Number(trade.exitPrice || 0).toFixed(5)}
                      </div>
                    </td>

                    {/* Pips & Lots */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className={clsx('font-bold font-mono', trade.pipGain >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                        {trade.pipGain >= 0 ? '+' : ''}{trade.pipGain} pips
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">
                        {trade.size} lot{trade.size > 1 ? 's' : ''} • {trade.riskAmountDollar > 0 ? `${trade.riskAmountDollar.toFixed(0)} risk` : 'No SL'}
                      </div>
                    </td>

                    {/* Net PnL */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div
                        className={clsx(
                          'font-bold font-mono text-sm tracking-tight',
                          isWin ? 'text-emerald-500' : isLoss ? 'text-rose-500' : 'text-[var(--text-muted)]'
                        )}
                      >
                        {pnlSign}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </td>

                    {/* Return R */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {trade.riskAmountDollar > 0 ? (
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
                      ) : (
                        <span className="text-xs text-[var(--text-muted)] font-mono" title="No Stop Loss defined">—</span>
                      )}
                    </td>

                    {/* MAE / MFE */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-[11px] font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="text-teal-500 font-semibold inline-flex items-center" title="Max Favorable Excursion">
                          <Flame size={11} className="mr-0.5" />
                          +${trade.mfeDollar.toFixed(0)}
                        </span>
                        <span className="text-[var(--text-muted)]">/</span>
                        <span className="text-rose-500 font-semibold inline-flex items-center" title="Max Adverse Excursion">
                          <ShieldAlert size={11} className="mr-0.5" />
                          -${trade.maeDollar.toFixed(0)}
                        </span>
                      </div>
                    </td>

                    {/* Duration */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-[var(--text-muted)] font-mono font-medium">
                      {formatDuration(trade.calculatedDurationMs)}
                    </td>

                    {/* Execution Grade */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-center">
                      <span
                        className={clsx(
                          'inline-block px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold font-mono',
                          trade.grade === 'A+' || trade.grade === 'A'
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : trade.grade === 'B' || trade.grade === 'C'
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            : trade.grade === 'D' || trade.grade === 'F'
                            ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                            : 'bg-[var(--surface-3)] text-[var(--text-muted)]'
                        )}
                      >
                        {trade.grade || '—'}
                      </span>
                    </td>

                    {/* Action Buttons */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onReplayTrade(trade);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-[var(--accent-1)]/10 text-[var(--accent-1)] hover:bg-[var(--accent-1)] hover:text-white transition-colors cursor-pointer"
                          title="Replay this trade bar-by-bar"
                        >
                          <Play size={12} />
                          <span>Replay</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onExportSinglePdf(trade);
                          }}
                          className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
                          title="Export Single Trade PDF Autopsy"
                        >
                          <Download size={14} />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectTrade(trade);
                          }}
                          className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
                          title="Open Trade Details & Notes"
                        >
                          <FileText size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
