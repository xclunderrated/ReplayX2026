import React, { useCallback, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Download,
  Play,
  Search,
} from 'lucide-react';
import { DataBlock, GradeBadge, SectionHeader } from '../AnalyticsPrimitives';
import { formatCompactCurrency, formatCurrency, formatDuration } from '../formatters';
import { getPipSize } from '../../../lib/orders';
import type { computeAnalytics, GradedTrade } from '../analyticsEngine';

type Analytics = ReturnType<typeof computeAnalytics>;

type SortKey =
  | 'closedAt'
  | 'pnlValue'
  | 'holdingMs'
  | 'rMultiple'
  | 'grade'
  | 'size'
  | 'timeframe'
  | 'instrument'
  | 'type'
  | 'pips';
type SortDir = 'asc' | 'desc';

const TIMEFRAME_OPTIONS = ['all', '1m', '5m', '15m', '30m', '1h', '4h', '1d'];
const GRADE_FILTER_OPTIONS = ['all', 'A', 'B', 'C', 'D', 'F', 'Ungraded'];

function getTimeframeColor(tf?: string): string {
  const norm = (tf || '1m').toLowerCase();
  if (norm.includes('1m') || norm === 'm1') return 'bg-gray-500/15 border-gray-500/30 text-gray-300';
  if (norm.includes('5m') || norm === 'm5') return 'bg-zinc-500/15 border-zinc-500/30 text-zinc-300';
  if (norm.includes('15m') || norm === 'm15') return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
  if (norm.includes('30m') || norm === 'm30') return 'bg-zinc-500/15 border-zinc-500/30 text-zinc-300';
  if (norm.includes('1h') || norm === 'h1') return 'bg-amber-500/15 border-amber-500/30 text-amber-300';
  if (norm.includes('4h') || norm === 'h4') return 'bg-orange-500/15 border-orange-500/30 text-orange-300';
  if (norm.includes('1d') || norm === 'd1') return 'bg-rose-500/15 border-rose-500/30 text-rose-300';
  return 'bg-zinc-500/15 border-zinc-500/30 text-zinc-300';
}

function calculatePips(trade: GradedTrade): number {
  const entry = trade.entryPrice ?? (trade as any).limitPrice;
  const exit = trade.exitPrice;
  if (!entry || !exit) return 0;
  const diff = trade.type === 'buy' ? exit - entry : entry - exit;
  return diff / getPipSize(trade.instrument);
}

function formatTradePrice(price: number | undefined | null, instrument?: string): string {
  if (price === undefined || price === null || !Number.isFinite(price)) return '—';
  const pip = getPipSize(instrument || '');
  if (pip < 0.001) return price.toFixed(5);
  if (pip < 0.1) return price.toFixed(3);
  return price.toFixed(2);
}

const gradeColors: Record<string, string> = {
  A: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  B: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
  C: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  D: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
  F: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
};

export const TradesTab: React.FC<{
  analytics: Analytics;
  onReplayTrade?: (trade: GradedTrade) => void;
}> = ({ analytics, onReplayTrade }) => {
  const [sortKey, setSortKey] = useState<SortKey>('closedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterTimeframe, setFilterTimeframe] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'WIN' | 'LOSS' | 'BE'>('ALL');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);

  const gradedTrades = analytics.gradedTrades;

  // Exact pip calculation function
  const getTradePips = useCallback((t: GradedTrade): number => {
    return calculatePips(t);
  }, []);

  // Multi-attribute filtering (Grade, Timeframe, Outcome, Side, Search)
  const filtered = useMemo(() => {
    return gradedTrades.filter((t) => {
      // Grade filter
      if (filterGrade !== 'all') {
        if (filterGrade === 'Ungraded' && t.grade !== null) return false;
        if (filterGrade !== 'Ungraded' && t.grade !== filterGrade) return false;
      }

      // Timeframe filter
      if (filterTimeframe !== 'all') {
        const targetTf = filterTimeframe.toLowerCase();
        const tf = (t.timeframe || '1m').toLowerCase();
        const matches =
          tf === targetTf ||
          (targetTf === '1m' && tf === 'm1') ||
          (targetTf === '5m' && tf === 'm5') ||
          (targetTf === '15m' && tf === 'm15') ||
          (targetTf === '30m' && tf === 'm30') ||
          (targetTf === '1h' && tf === 'h1') ||
          (targetTf === '4h' && tf === 'h4') ||
          (targetTf === '1d' && tf === 'd1');
        if (!matches) return false;
      }

      // Outcome filter
      const pnl = t.pnlValue ?? 0;
      if (outcomeFilter === 'WIN' && pnl <= 0.0001) return false;
      if (outcomeFilter === 'LOSS' && pnl >= -0.0001) return false;
      if (outcomeFilter === 'BE' && Math.abs(pnl) > 0.0001) return false;

      // Side filter
      if (sideFilter !== 'ALL') {
        const isBuy = t.type === 'buy';
        if (sideFilter === 'BUY' && !isBuy) return false;
        if (sideFilter === 'SELL' && isBuy) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const instMatch = (t.instrument || '').toLowerCase().includes(q);
        const sessionMatch = (t.sessionName || '').toLowerCase().includes(q);
        const idMatch = (t.id || '').toLowerCase().includes(q);
        if (!instMatch && !sessionMatch && !idMatch) return false;
      }

      return true;
    });
  }, [gradedTrades, filterGrade, filterTimeframe, outcomeFilter, sideFilter, searchQuery]);

  // Live Performance Summary ribbon for the filtered subset
  const summaryStats = useMemo(() => {
    const total = filtered.length;
    if (total === 0) {
      return { total: 0, wins: 0, losses: 0, winRate: 0, netPnl: 0, profitFactor: 0, avgR: 0, totalPips: 0 };
    }
    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let netPnl = 0;
    let sumR = 0;
    let validRCount = 0;
    let totalPips = 0;

    for (const t of filtered) {
      const pnl = t.pnlValue ?? 0;
      netPnl += pnl;
      if (pnl > 0.0001) {
        wins++;
        grossProfit += pnl;
      } else if (pnl < -0.0001) {
        losses++;
        grossLoss += Math.abs(pnl);
      }

      if (t.rMultiple !== null && t.rMultiple !== undefined && Number.isFinite(t.rMultiple)) {
        sumR += t.rMultiple;
        validRCount++;
      }

      totalPips += getTradePips(t);
    }

    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    const avgR = validRCount > 0 ? sumR / validRCount : 0;

    return { total, wins, losses, winRate, netPnl, profitFactor, avgR, totalPips };
  }, [filtered, getTradePips]);

  // Sorted list
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'closedAt': diff = a.closedAt - b.closedAt; break;
        case 'pnlValue': diff = a.pnlValue - b.pnlValue; break;
        case 'holdingMs': diff = a.holdingMs - b.holdingMs; break;
        case 'rMultiple': diff = (a.rMultiple ?? -Infinity) - (b.rMultiple ?? -Infinity); break;
        case 'size': diff = (a.size || 0) - (b.size || 0); break;
        case 'timeframe': diff = (a.timeframe || '').localeCompare(b.timeframe || ''); break;
        case 'grade': diff = (a.grade ?? 'Z').localeCompare(b.grade ?? 'Z'); break;
        case 'instrument': diff = (a.instrument || '').localeCompare(b.instrument || ''); break;
        case 'type': diff = (a.type || '').localeCompare(b.type || ''); break;
        case 'pips': diff = getTradePips(a) - getTradePips(b); break;
      }
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [filtered, sortKey, sortDir, getTradePips]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown size={11} className="text-zinc-600 ml-1 inline" />;
    return sortDir === 'asc' ? (
      <ArrowUp size={11} className="text-emerald-400 ml-1 inline" />
    ) : (
      <ArrowDown size={11} className="text-emerald-400 ml-1 inline" />
    );
  };

  // Comprehensive CSV Exporter
  const handleExportCsv = () => {
    if (sorted.length === 0) return;
    const headers = [
      'Trade ID',
      'Instrument',
      'Session',
      'Timeframe',
      'Side',
      'Size (Lots)',
      'Open Time',
      'Close Time',
      'Entry Price',
      'Exit Price',
      'Stop Loss',
      'Take Profit',
      'Realized PnL ($)',
      'Pips / Pts',
      'R-Multiple',
      'MAE ($)',
      'MFE ($)',
      'Capture Efficiency (%)',
      'Grade',
      'Hold Duration',
    ];

    const rows = sorted.map((t) => {
      const isBuy = t.type === 'buy';
      const calcPips = getTradePips(t).toFixed(1);
      const eff =
        t.mfe && t.mfe > 0 && t.pnlValue && t.pnlValue > 0
          ? Math.min(100, (t.pnlValue / t.mfe) * 100).toFixed(1)
          : '0.0';

      return [
        `"${t.id}"`,
        `"${t.instrument || ''}"`,
        `"${t.sessionName || ''}"`,
        `"${t.timeframe || '1m'}"`,
        `"${isBuy ? 'BUY' : 'SELL'}"`,
        t.size ?? 1,
        `"${t.openedAt ? new Date(t.openedAt).toISOString() : ''}"`,
        `"${t.closedAt ? new Date(t.closedAt).toISOString() : ''}"`,
        t.entryPrice ?? '',
        t.exitPrice ?? '',
        t.sl ?? '',
        (t as any).tp ?? '',
        (t.pnlValue ?? 0).toFixed(2),
        calcPips,
        t.rMultiple !== null && t.rMultiple !== undefined ? t.rMultiple.toFixed(2) : '',
        t.mae !== undefined && t.mae !== null ? t.mae.toFixed(2) : '',
        t.mfe !== undefined && t.mfe !== null ? t.mfe.toFixed(2) : '',
        eff,
        `"${t.grade || 'Ungraded'}"`,
        `"${formatDuration(t.holdingMs)}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `replayx_analytics_trades_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      {/* 100% Real Calculated Performance Summary Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Net Realized P&L</div>
          <div className={`mt-1 text-base font-bold font-mono ${summaryStats.netPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            {summaryStats.netPnl >= 0 ? '+' : ''}${summaryStats.netPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Win Rate</div>
          <div className="mt-1 text-base font-bold text-white">
            {summaryStats.winRate.toFixed(1)}%{' '}
            <span className="text-xs font-normal text-zinc-500">
              ({summaryStats.wins}W / {summaryStats.losses}L)
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Profit Factor</div>
          <div className="mt-1 text-base font-bold text-white">
            {summaryStats.profitFactor >= 999 ? '∞' : summaryStats.profitFactor.toFixed(2)}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Total Pips / Pts</div>
          <div className={`mt-1 text-base font-bold font-mono ${summaryStats.totalPips >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            {summaryStats.totalPips >= 0 ? '+' : ''}{summaryStats.totalPips.toFixed(1)}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Average R</div>
          <div className={`mt-1 text-base font-bold font-mono ${summaryStats.avgR >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            {summaryStats.avgR >= 0 ? '+' : ''}{summaryStats.avgR.toFixed(2)}R
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Filtered Trades</div>
          <div className="mt-1 text-base font-bold text-white">
            {summaryStats.total}{' '}
            <span className="text-xs font-normal text-zinc-500">of {gradedTrades.length}</span>
          </div>
        </div>
      </div>

      {/* Streamlined Filter Toolbar */}
      <div className="space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <SectionHeader
            title="Trade Registry"
            description="Complete log of closed trades with real metrics, price excursions, and expandable execution inspection"
          />

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative flex items-center min-w-[190px]">
              <Search size={13} className="absolute left-2.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search symbol, session, ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-2.5 py-1.5 text-xs rounded-xl border border-white/10 bg-zinc-900/90 text-white placeholder-zinc-500 outline-none focus:border-[var(--accent-1)]"
              />
            </div>

            {/* Outcome Filter Pills */}
            <div className="flex items-center rounded-xl border border-white/10 bg-zinc-900/90 p-0.5 text-xs">
              {(['ALL', 'WIN', 'LOSS', 'BE'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setOutcomeFilter(mode)}
                  className={`rounded-lg px-2.5 py-1 font-medium transition ${
                    outcomeFilter === mode
                      ? 'bg-white/15 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {mode === 'ALL' ? 'All' : mode === 'WIN' ? 'Wins' : mode === 'LOSS' ? 'Losses' : 'B/E'}
                </button>
              ))}
            </div>

            {/* Side Filter */}
            <div className="flex items-center rounded-xl border border-white/10 bg-zinc-900/90 p-0.5 text-xs">
              {(['ALL', 'BUY', 'SELL'] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => setSideFilter(side)}
                  className={`rounded-lg px-2.5 py-1 font-medium transition ${
                    sideFilter === side
                      ? side === 'BUY'
                        ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                        : side === 'SELL'
                        ? 'border border-rose-500/30 bg-rose-500/20 text-rose-300'
                        : 'bg-white/15 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {side === 'ALL' ? 'All Sides' : side === 'BUY' ? 'Long' : 'Short'}
                </button>
              ))}
            </div>

            {/* Timeframe Filter Dropdown */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">TF:</span>
              <select
                value={filterTimeframe}
                onChange={(e) => setFilterTimeframe(e.target.value)}
                className="rounded-xl border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 focus:border-[var(--accent-1)] focus:outline-none uppercase"
              >
                {TIMEFRAME_OPTIONS.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf === 'all' ? 'All TFs' : tf.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Grade Filter Dropdown */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">Grade:</span>
              <select
                value={filterGrade}
                onChange={(e) => setFilterGrade(e.target.value)}
                className="rounded-xl border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 focus:border-[var(--accent-1)] focus:outline-none"
              >
                {GRADE_FILTER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g === 'all' ? 'All Grades' : g === 'Ungraded' ? 'No SL / Ungraded' : `Grade ${g}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Export CSV Button */}
            <button
              onClick={handleExportCsv}
              disabled={sorted.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-zinc-900 border border-white/10 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all disabled:opacity-40 disabled:pointer-events-none"
              title="Export filtered trade records to CSV"
            >
              <Download size={13} />
              CSV
            </button>
          </div>
        </div>

        {/* Expandable Trade Log Table */}
        <DataBlock title="Closed Trade Log" subtitle="Click any row to expand execution and price excursion profile" noPadding>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="border-b border-white/10 bg-zinc-900/90 text-zinc-400 sticky top-0 z-10 select-none uppercase tracking-wider text-[11px] font-semibold">
                <tr>
                  <th className="px-3 py-3 w-8"></th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort('instrument')}>
                    Instrument / TF {getSortIcon('instrument')}
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort('type')}>
                    Side {getSortIcon('type')}
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort('closedAt')}>
                    Close Date {getSortIcon('closedAt')}
                  </th>
                  <th className="px-3 py-3 text-right">Entry / Exit</th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white text-right" onClick={() => toggleSort('holdingMs')}>
                    Hold {getSortIcon('holdingMs')}
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white text-right" onClick={() => toggleSort('pips')}>
                    Pips / Pts {getSortIcon('pips')}
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white text-right" onClick={() => toggleSort('pnlValue')}>
                    Realized P&L {getSortIcon('pnlValue')}
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white text-right" onClick={() => toggleSort('rMultiple')}>
                    R-Multiple {getSortIcon('rMultiple')}
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white text-center" onClick={() => toggleSort('grade')}>
                    Grade {getSortIcon('grade')}
                  </th>
                  {onReplayTrade && <th className="px-3 py-3 text-center w-12">Replay</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-zinc-300">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={onReplayTrade ? 11 : 10} className="px-4 py-10 text-center text-xs text-zinc-500 font-semibold">
                      No trades matched the selected filters.
                    </td>
                  </tr>
                ) : (
                  sorted.map((trade) => {
                    const isBuy = trade.type === 'buy';
                    const pnl = trade.pnlValue ?? 0;
                    const pnlClass = pnl >= 0 ? 'text-emerald-300' : 'text-rose-300';
                    const rClass =
                      trade.rMultiple === null
                        ? 'text-zinc-500'
                        : trade.rMultiple >= 1
                        ? 'text-emerald-300'
                        : trade.rMultiple >= 0
                        ? 'text-white'
                        : 'text-rose-300';

                    const pips = getTradePips(trade);
                    const isExpanded = expandedTradeId === trade.id;
                    const tfBadgeClass = getTimeframeColor(trade.timeframe);

                    return (
                      <React.Fragment key={trade.id}>
                        <tr
                          onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
                          className={`cursor-pointer transition hover:bg-white/5 ${isExpanded ? 'bg-white/[0.04]' : ''}`}
                        >
                          <td className="px-3 py-3 text-center text-zinc-500">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td className="px-3 py-3 font-semibold text-white">
                            <div className="flex items-center gap-1.5">
                              <span>{trade.instrument.toUpperCase()}</span>
                              <span className={`inline-flex rounded border px-1.5 py-0.2 text-[9px] font-bold uppercase ${tfBadgeClass}`}>
                                {(trade.timeframe || '1m').toUpperCase()}
                              </span>
                              {trade.size && <span className="text-[11px] font-normal text-zinc-500">({trade.size}L)</span>}
                            </div>
                            <div className="text-[10px] text-zinc-500 font-normal">{trade.sessionName}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                                isBuy
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                              }`}
                            >
                              {isBuy ? 'LONG' : 'SHORT'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-zinc-400">
                            <div>{new Date(trade.closedAt).toLocaleDateString()}</div>
                            <div className="text-[10px] text-zinc-600">
                              {new Date(trade.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-right text-zinc-300">
                            <div>{formatTradePrice(trade.entryPrice ?? (trade as any).limitPrice, trade.instrument)}</div>
                            <div className="text-[10px] text-zinc-500">
                              → {formatTradePrice(trade.exitPrice, trade.instrument)}
                            </div>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-right text-zinc-400">
                            {formatDuration(trade.holdingMs)}
                          </td>
                          <td className={`px-3 py-3 font-mono text-xs text-right font-medium ${pips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {pips >= 0 ? '+' : ''}{pips.toFixed(1)}
                          </td>
                          <td className={`px-3 py-3 font-mono text-sm text-right font-bold ${pnlClass}`}>
                            {pnl >= 0 ? '+' : ''}${pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={`px-3 py-3 font-mono text-xs text-right font-semibold ${rClass}`}>
                            {trade.rMultiple !== null && trade.rMultiple !== undefined ? `${trade.rMultiple.toFixed(2)}R` : '—'}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span
                              title={trade.gradeReason}
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                                trade.grade ? gradeColors[trade.grade] || 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300' : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300'
                              }`}
                            >
                              {trade.grade ?? '—'}
                            </span>
                          </td>
                          {onReplayTrade && (
                            <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => onReplayTrade(trade)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-1)]/10 border border-[var(--accent-1)]/20 text-[var(--accent-1)] hover:bg-[var(--accent-1)]/25 transition-all duration-200 mx-auto"
                                title="Replay this trade visually"
                              >
                                <Play size={11} strokeWidth={3} />
                              </button>
                            </td>
                          )}
                        </tr>

                        {/* Expandable Trade Execution Details Accordion */}
                        {isExpanded && (
                          <tr className="bg-zinc-950/70 border-y border-white/10">
                            <td colSpan={onReplayTrade ? 11 : 10} className="p-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                {/* Execution & Risk Parameters */}
                                <div className="rounded-lg border border-white/10 bg-zinc-900/70 p-3 space-y-2">
                                  <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-white/5 pb-1">
                                    Execution & Risk
                                  </div>
                                  <div className="grid grid-cols-2 gap-y-1.5 font-mono text-zinc-300">
                                    <span className="text-zinc-500 font-sans">Stop Loss:</span>
                                    <span>{trade.sl ? formatTradePrice(trade.sl, trade.instrument) : 'None'}</span>
                                    <span className="text-zinc-500 font-sans">Take Profit:</span>
                                    <span>{(trade as any).tp ? formatTradePrice((trade as any).tp, trade.instrument) : 'None'}</span>
                                    <span className="text-zinc-500 font-sans">Size:</span>
                                    <span>{trade.size ? `${trade.size} Lots` : '—'}</span>
                                    <span className="text-zinc-500 font-sans">Grade Feedback:</span>
                                    <span className="font-sans text-[11px] text-zinc-400">{trade.gradeReason || 'No rule violations detected.'}</span>
                                  </div>
                                </div>

                                {/* Excursion & Performance Metrics */}
                                <div className="rounded-lg border border-white/10 bg-zinc-900/70 p-3 space-y-2">
                                  <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-white/5 pb-1">
                                    Price Excursion Profile
                                  </div>
                                  <div className="grid grid-cols-2 gap-y-1.5 font-mono text-zinc-300">
                                    <span className="text-zinc-500 font-sans">Max Drawdown (MAE):</span>
                                    <span className="text-rose-400">
                                      {trade.mae !== undefined && trade.mae !== null ? `-$${Math.abs(trade.mae).toFixed(2)}` : '—'}
                                    </span>
                                    <span className="text-zinc-500 font-sans">Max Profit (MFE):</span>
                                    <span className="text-emerald-400">
                                      {trade.mfe !== undefined && trade.mfe !== null ? `+$${trade.mfe.toFixed(2)}` : '—'}
                                    </span>
                                    <span className="text-zinc-500 font-sans">Capture Efficiency:</span>
                                    <span>
                                      {trade.mfe && trade.mfe > 0 && trade.pnlValue && trade.pnlValue > 0
                                        ? `${Math.min(100, (trade.pnlValue / trade.mfe) * 100).toFixed(1)}%`
                                        : '—'}
                                    </span>
                                    <span className="text-zinc-500 font-sans">Exact Timestamps:</span>
                                    <span className="font-sans text-[10px] text-zinc-400">
                                      {trade.openedAt ? new Date(trade.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} → {new Date(trade.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </div>

                                {/* Notes & Quick Replay */}
                                <div className="rounded-lg border border-white/10 bg-zinc-900/70 p-3 flex flex-col justify-between space-y-2">
                                  <div>
                                    <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-white/5 pb-1 mb-1.5">
                                      Trade Notes & Context
                                    </div>
                                    <p className="text-zinc-400 text-xs italic line-clamp-3">
                                      {trade.notes ? trade.notes : 'No custom notes attached for this execution.'}
                                    </p>
                                  </div>
                                  {onReplayTrade && (
                                    <div className="pt-2 border-t border-white/5">
                                      <button
                                        onClick={() => onReplayTrade(trade)}
                                        className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[var(--accent-1)] hover:opacity-90 text-[var(--accent-contrast)] rounded-lg text-xs font-semibold transition"
                                      >
                                        <Play size={12} className="fill-current" />
                                        Launch Visual Replay
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </DataBlock>
      </div>

      {/* Expectancy & Hold Analysis */}
      <div className="space-y-6">
        <SectionHeader title="Expectancy & Hold Dynamics" description="Analysis of moving expectancy and holding distribution profile" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Rolling Expectancy */}
          <DataBlock title="Rolling Expectancy" subtitle="10-trade moving average expectancy trajectory">
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.rollingExpectancy} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border-soft)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="index" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={(v) => formatCompactCurrency(v)} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--surface-overlay)', borderColor: 'var(--border-strong)', borderRadius: '12px', fontSize: '11px', color: 'var(--text-primary)' }} formatter={(v: number, k: string) => [formatCurrency(v), k === 'expectancy' ? 'Rolling Expectancy' : 'Trade P&L']} />
                  <Line dataKey="pnl" stroke="var(--text-muted)" strokeOpacity={0.3} dot={false} strokeWidth={1.2} />
                  <Line dataKey="expectancy" stroke="var(--accent-1)" dot={false} strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </DataBlock>

          {/* Duration Distribution */}
          <DataBlock title="Duration Distribution" subtitle="Trade hold-time frequency breakdown">
            <div className="space-y-5">
              <div className="grid grid-cols-5 gap-2.5 text-center text-[11px] font-semibold">
                {[
                  { key: 'Min', val: formatDuration(analytics.durationDistribution.min), style: 'text-[var(--text-muted)] bg-[var(--surface-ghost)] border border-[var(--border-soft)]' },
                  { key: 'Q1', val: formatDuration(analytics.durationDistribution.q1), style: 'text-[var(--text-muted)] bg-[var(--surface-ghost)] border border-[var(--border-soft)]' },
                  { key: 'Median', val: formatDuration(analytics.durationDistribution.median), style: 'text-[var(--accent-1)] bg-[var(--accent-1)]/10 border border-[var(--accent-1)]/30' },
                  { key: 'Q3', val: formatDuration(analytics.durationDistribution.q3), style: 'text-[var(--text-muted)] bg-[var(--surface-ghost)] border border-[var(--border-soft)]' },
                  { key: 'Max', val: formatDuration(analytics.durationDistribution.max), style: 'text-[var(--text-muted)] bg-[var(--surface-ghost)] border border-[var(--border-soft)]' }
                ].map((item) => (
                  <div key={item.key} className={`rounded-xl py-3 px-1 transition-all duration-300 ${item.style}`}>
                    <span className="block text-[9px] uppercase tracking-wider text-[var(--text-muted)]/70 mb-1">{item.key}</span>
                    <span className="truncate block px-1">{item.val}</span>
                  </div>
                ))}
              </div>
              <div className="h-[175px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.durationBucketDistribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border-soft)" vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--surface-overlay)', borderColor: 'var(--border-strong)', borderRadius: '12px', fontSize: '11px', color: 'var(--text-primary)' }} formatter={(v: number) => [`${v}`, 'Trades']} />
                    <Bar dataKey="trades" fill="var(--accent-1)" radius={[4, 4, 0, 0]} fillOpacity={0.75} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </DataBlock>
        </div>
      </div>
    </div>
  );
};
