import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { 
  BookOpen, Calendar, Camera, Image as ImageIcon, MoveUpRight, Trash2, 
  Search, Filter, SortAsc, SortDesc, X, ChevronLeft, ChevronRight, ChevronDown,
  Check, Edit3, Tag, Plus, TrendingUp, TrendingDown, DollarSign,
  LayoutGrid, List, Star, Play, Pause, Layers, Maximize2,
  Activity, Archive, RotateCcw, Download, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { flattenClosedTrades, computeAnalytics, type GradedTrade } from './analytics/analyticsEngine';
import { formatDuration } from './analytics/formatters';
import { TradeReplayModal } from './analytics/TradeReplayModal';
import { getPipSize, formatTradePrice } from '../lib/orders';
import { formatTimeframeBadgeLabel } from '../services/autoScreenshotService';
import { getTimeframeSeconds, auraTimeframeToDukascopy } from '../lib/timeframe';

type SortField = 'date' | 'pnl' | 'instrument' | 'session';
type SortDirection = 'asc' | 'desc';

interface EntryWithSession {
  id: string;
  createdAt: number;
  title: string;
  note?: string;
  imageDataUrl: string;
  instrument: string;
  timeframe: string;
  candleTimestamp?: number;
  tradeId?: string;
  tradeType?: 'buy' | 'sell';
  pnl?: number;
  tags?: string[];
  isFavorite?: boolean;
  sessionId: string;
  sessionName: string;
  trade?: any;
}

export interface GroupedJournalCard {
  id: string;
  tradeId?: string;
  isTradeGroup: boolean;
  sessionId: string;
  sessionName: string;
  instrument: string;
  tradeType?: 'buy' | 'sell';
  pnl?: number;
  trade?: any;
  createdAt: number;
  isFavorite: boolean;
  tags: string[];
  note?: string;
  title: string;
  entries: EntryWithSession[];
}

const LIGHTBOX_IMAGE_ID = 'journal-lightbox-image';

interface SummaryStats {
  totalEntries: number;
  wins: number;
  totalPnl: number;
  winRate: number;
  bestTrade: { pnl: number; title: string } | null;
  worstTrade: { pnl: number; title: string } | null;
  resultCount: number;
}

function summarizeTradesAndEntries(
  trades: { id: string; pnlValue: number; instrument: string; type: string }[],
  entries: EntryWithSession[],
): SummaryStats {
  const tradeIds = new Set(trades.map((t) => t.id));
  const results: { pnl: number; title: string }[] = trades.map((t) => ({
    pnl: t.pnlValue,
    title: `${t.instrument.toUpperCase()} ${t.type.toUpperCase()}`,
  }));

  for (const e of entries) {
    if (e.tradeId && tradeIds.has(e.tradeId)) continue;
    if (typeof e.pnl !== 'number') continue;
    results.push({ pnl: e.pnl, title: e.title });
  }

  const totalEntries = results.length;
  const wins = results.filter((r) => r.pnl > 0).length;
  const totalPnl = results.reduce((sum, r) => sum + r.pnl, 0);
  const winRate = totalEntries > 0 ? (wins / totalEntries) * 100 : 0;
  const bestTrade = totalEntries > 0 ? results.reduce((best, r) => (r.pnl > best.pnl ? r : best), results[0]) : null;
  const worstTrade = totalEntries > 0 ? results.reduce((worst, r) => (r.pnl < worst.pnl ? r : worst), results[0]) : null;

  return { totalEntries, wins, totalPnl, winRate, bestTrade, worstTrade, resultCount: totalEntries };
}

type TradeSortKey = 'closedAt' | 'holdingMs' | 'pnlValue' | 'rMultiple' | 'grade' | 'instrument' | 'type' | 'pips';
type TradeSortDir = 'asc' | 'desc';

const GRADE_FILTER_OPTIONS = ['all', 'A', 'B', 'C', 'D', 'F', 'Ungraded'];

const TradeLogTable: React.FC<{
  trades: GradedTrade[];
  onReplay: (trade: GradedTrade) => void;
}> = ({ trades, onReplay }) => {
  const [sortKey, setSortKey] = useState<TradeSortKey>('closedAt');
  const [sortDir, setSortDir] = useState<TradeSortDir>('desc');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'WIN' | 'LOSS' | 'BE'>('ALL');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);

  // Exact pip calculation function based on verified instrument specifications
  const getTradePips = useCallback((t: GradedTrade): number => {
    const entry = t.entryPrice ?? t.limitPrice;
    const exit = t.exitPrice;
    if (!entry || !exit) return 0;
    const pipSize = getPipSize(t.instrument);
    const isBuy = t.type === 'buy';
    return ((exit - entry) / pipSize) * (isBuy ? 1 : -1);
  }, []);

  // Filter trades by Grade, Outcome, Side, and Search Term
  const filtered = useMemo(() => {
    return trades.filter((t) => {
      // Grade filter
      if (filterGrade !== 'all') {
        if (filterGrade === 'Ungraded' && t.grade !== null) return false;
        if (filterGrade !== 'Ungraded' && t.grade !== filterGrade) return false;
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

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const instMatch = (t.instrument || '').toLowerCase().includes(term);
        const sessionMatch = (t.sessionName || '').toLowerCase().includes(term);
        const idMatch = (t.id || '').toLowerCase().includes(term);
        if (!instMatch && !sessionMatch && !idMatch) return false;
      }

      return true;
    });
  }, [trades, filterGrade, outcomeFilter, sideFilter, searchTerm]);

  // Live mathematically exact KPI calculations
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

  // Sorted trades
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'closedAt': diff = a.closedAt - b.closedAt; break;
        case 'holdingMs': diff = a.holdingMs - b.holdingMs; break;
        case 'pnlValue': diff = a.pnlValue - b.pnlValue; break;
        case 'rMultiple': diff = (a.rMultiple ?? -Infinity) - (b.rMultiple ?? -Infinity); break;
        case 'grade': diff = (a.grade ?? 'Z').localeCompare(b.grade ?? 'Z'); break;
        case 'instrument': diff = (a.instrument || '').localeCompare(b.instrument || ''); break;
        case 'type': diff = (a.type || '').localeCompare(b.type || ''); break;
        case 'pips': diff = getTradePips(a) - getTradePips(b); break;
      }
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [filtered, sortKey, sortDir, getTradePips]);

  const toggleSort = (key: TradeSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const getSortIcon = (key: TradeSortKey) => {
    if (sortKey !== key) return <ArrowUpDown size={11} className="text-zinc-600 ml-1 inline" />;
    return sortDir === 'asc' ? (
      <ArrowUp size={11} className="text-emerald-400 ml-1 inline" />
    ) : (
      <ArrowDown size={11} className="text-emerald-400 ml-1 inline" />
    );
  };

  // CSV Export handler
  const handleExportCSV = () => {
    if (sorted.length === 0) return;
    const headers = [
      'Trade ID',
      'Instrument',
      'Session',
      'Side',
      'Open Time',
      'Close Time',
      'Entry Price',
      'Exit Price',
      'Stop Loss',
      'Take Profit',
      'Size (Lots)',
      'Realized PnL ($)',
      'Pips',
      'R-Multiple',
      'MAE ($)',
      'MFE ($)',
      'Efficiency (%)',
      'Grade',
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
        `"${isBuy ? 'BUY' : 'SELL'}"`,
        `"${t.openedAt ? new Date(t.openedAt).toISOString() : ''}"`,
        `"${t.closedAt ? new Date(t.closedAt).toISOString() : ''}"`,
        t.entryPrice ?? '',
        t.exitPrice ?? '',
        t.sl ?? '',
        t.tp ?? '',
        t.size ?? '',
        (t.pnlValue ?? 0).toFixed(2),
        calcPips,
        t.rMultiple !== null && t.rMultiple !== undefined ? t.rMultiple.toFixed(2) : '',
        t.mae !== undefined ? t.mae.toFixed(2) : '',
        t.mfe !== undefined ? t.mfe.toFixed(2) : '',
        eff,
        `"${t.grade || 'Ungraded'}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `replayx_trade_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const gradeColors: Record<string, string> = {
    A: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    B: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
    C: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    D: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
    F: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
  };

  return (
    <div className="space-y-3.5">
      {/* 100% Real KPI Summary Ribbon */}
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
            <span className="text-xs font-normal text-zinc-500">of {trades.length}</span>
          </div>
        </div>
      </div>

      {/* Clean Filter & Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Symbol / Session search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search symbol/session..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-44 rounded-lg border border-white/10 bg-zinc-900/90 py-1 pl-7 pr-2.5 text-xs text-white placeholder-zinc-500 focus:border-[var(--accent-1)] focus:outline-none"
            />
          </div>

          {/* Outcome Filter Pills */}
          <div className="flex items-center rounded-lg border border-white/10 bg-zinc-900/90 p-0.5 text-xs">
            {(['ALL', 'WIN', 'LOSS', 'BE'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setOutcomeFilter(mode)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
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
          <div className="flex items-center rounded-lg border border-white/10 bg-zinc-900/90 p-0.5 text-xs">
            {(['ALL', 'BUY', 'SELL'] as const).map((side) => (
              <button
                key={side}
                onClick={() => setSideFilter(side)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
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

          {/* Grade Filter */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-zinc-500">Grade:</span>
            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 focus:border-[var(--accent-1)] focus:outline-none"
            >
              {GRADE_FILTER_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g === 'all' ? 'All Grades' : g === 'Ungraded' ? 'No SL / Ungraded' : `Grade ${g}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* CSV Exporter */}
        <button
          onClick={handleExportCSV}
          disabled={sorted.length === 0}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:pointer-events-none disabled:opacity-40"
          title="Export filtered trade records to CSV"
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      {/* Main Trade Logs Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs font-medium uppercase tracking-wider text-zinc-500 select-none">
              <th className="px-3 py-3 w-8"></th>
              <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort('instrument')}>
                Instrument {getSortIcon('instrument')}
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
              <th className="px-3 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-zinc-300">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-sm text-zinc-500">
                  No closed trades match the selected filters.
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
                          <span>{trade.instrument}</span>
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
                        <div>{formatTradePrice(trade.entryPrice ?? trade.limitPrice ?? 0, trade.instrument)}</div>
                        <div className="text-[10px] text-zinc-500">
                          → {formatTradePrice(trade.exitPrice ?? 0, trade.instrument)}
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
                        {trade.rMultiple !== null ? `${trade.rMultiple.toFixed(2)}R` : '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          title={trade.gradeReason}
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                            trade.grade ? gradeColors[trade.grade] : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300'
                          }`}
                        >
                          {trade.grade ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onReplay(trade)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-1)]/10 border border-[var(--accent-1)]/20 text-[var(--accent-1)] hover:bg-[var(--accent-1)]/25 transition-all duration-200 mx-auto"
                          title="Replay this trade visually"
                        >
                          <Play size={11} strokeWidth={3} />
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Trade Execution Details */}
                    {isExpanded && (
                      <tr className="bg-zinc-950/70 border-y border-white/10">
                        <td colSpan={11} className="p-4">
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
                                <span>{trade.tp ? formatTradePrice(trade.tp, trade.instrument) : 'None'}</span>
                                <span className="text-zinc-500 font-sans">Size:</span>
                                <span>{trade.size ? `${trade.size} Lots` : '—'}</span>
                                <span className="text-zinc-500 font-sans">Grade Feedback:</span>
                                <span className="font-sans text-[11px] text-zinc-400">{trade.gradeReason}</span>
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
                                  {trade.mae !== undefined ? `-$${Math.abs(trade.mae).toFixed(2)}` : '—'}
                                </span>
                                <span className="text-zinc-500 font-sans">Max Profit (MFE):</span>
                                <span className="text-emerald-400">
                                  {trade.mfe !== undefined ? `+$${trade.mfe.toFixed(2)}` : '—'}
                                </span>
                                <span className="text-zinc-500 font-sans">Capture Efficiency:</span>
                                <span>
                                  {trade.mfe && trade.mfe > 0 && trade.pnlValue && trade.pnlValue > 0
                                    ? `${Math.min(100, (trade.pnlValue / trade.mfe) * 100).toFixed(1)}%`
                                    : '—'}
                                </span>
                                <span className="text-zinc-500 font-sans">Exact Timestamps:</span>
                                <span className="font-sans text-[10px] text-zinc-400">
                                  {new Date(trade.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → {new Date(trade.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                              <div className="pt-2 border-t border-white/5">
                                <button
                                  onClick={() => onReplay(trade)}
                                  className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[var(--accent-1)] hover:opacity-90 text-[var(--accent-contrast)] rounded-lg text-xs font-semibold transition"
                                >
                                  <Play size={12} className="fill-current" />
                                  Launch Visual Replay
                                </button>
                              </div>
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
    </div>
  );
};

const TAG_COLORS = [
  'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
  'bg-green-500/20 text-green-300 border-green-500/30',
  'bg-gray-500/20 text-gray-300 border-gray-500/30',
  'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
  'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'bg-rose-500/20 text-rose-300 border-rose-500/30',
];

export const JournalView: React.FC<{ archiveNonce?: number }> = ({ archiveNonce = 0 }) => {
  const {
    sessions,
    archivedSessions,
    currentSessionId,
    removeJournalEntry,
    setCurrentSession,
    updateJournalEntry,
    strategies,
    restoreArchivedSession,
    permanentlyDeleteArchivedSession,
    journalViewMode,
    setJournalViewMode,
    journalViewSubMode: viewMode,
    setJournalViewSubMode: setViewMode,
    journalSelectedSessionId: selectedSessionInJournal,
    setJournalSelectedSessionId: setSelectedSessionInJournal,
  } = useSimulatorStore();

  const safeArchivedSessions = archivedSessions ?? [];

  const entries: EntryWithSession[] = useMemo(() => 
    sessions.flatMap((session) =>
      (session.journalEntries ?? []).map((entry) => ({
        ...entry,
        sessionId: session.id,
        sessionName: session.name,
        trade: entry.tradeId ? session.trades.find(t => t.id === entry.tradeId) : undefined,
      }))
    ),
    [sessions]
  );

  const archivedEntries: EntryWithSession[] = useMemo(() =>
    safeArchivedSessions.flatMap((session) =>
      (session.journalEntries ?? []).map((entry) => ({
        ...entry,
        sessionId: session.id,
        sessionName: session.name,
        trade: entry.tradeId ? session.trades.find(t => t.id === entry.tradeId) : undefined,
      })),
    ),
    [safeArchivedSessions]
  );

  const currentSession = sessions.find((session) => session.id === currentSessionId) || null;

  const [searchQuery, setSearchQuery] = useState('');
  const [filterInstrument, setFilterInstrument] = useState<string>('all');
  const [filterSession, setFilterSession] = useState<string>('all');
  const [filterTimeframe, setFilterTimeframe] = useState<string>('all');
  const [filterTradeType, setFilterTradeType] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editEntry, setEditEntry] = useState<EntryWithSession | null>(null);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [slideshowInterval, setSlideshowInterval] = useState<number | null>(null);
  const [slideshowSpeed, setSlideshowSpeed] = useState<number>(5);
  const slideshowRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedArchivedSessionId, setSelectedArchivedSessionId] = useState<string | null>(null);
  const [replayTarget, setReplayTarget] = useState<GradedTrade | null>(null);
  const [confirmingPermanentDelete, setConfirmingPermanentDelete] = useState<string | null>(null);
  const [cardActiveTfIndex, setCardActiveTfIndex] = useState<Record<string, number>>({});

  useEffect(() => {
    if (archiveNonce === 0) return;
    setJournalViewMode('archive');
    setSelectedSessionInJournal(null);
    setSelectedArchivedSessionId(null);
    setConfirmingPermanentDelete(null);
  }, [archiveNonce]);

  const instruments = useMemo(() => 
    [...new Set(entries.map(e => e.instrument.toUpperCase()))],
    [entries]
  );

  const sessionNames = useMemo(() => 
    [...new Set(entries.map(e => e.sessionName))],
    [entries]
  );

  const timeframes = useMemo(() =>
    [...new Set(entries.map(e => (e.timeframe || '1m').toUpperCase()))],
    [entries]
  );

  const sessionsWithEntries = useMemo(() => {
    return sessions
      .filter(session => (session.journalEntries ?? []).length > 0 || session.trades.some(t => t.status === 'closed'))
      .map(session => {
        const sessionEntries = entries.filter(e => e.sessionId === session.id);
        const closedTrades = session.trades.filter(t => t.status === 'closed');
        const closedTradeIds = new Set(closedTrades.map(t => t.id));
        const manualPnlEntries = sessionEntries.filter(e => typeof e.pnl === 'number' && !(e.tradeId && closedTradeIds.has(e.tradeId)));

        const results = [
          ...closedTrades.map(t => t.pnl ?? 0),
          ...manualPnlEntries.map(e => e.pnl ?? 0),
        ];
        const wins = results.filter(p => p > 0).length;
        const totalPnl = results.reduce((sum, p) => sum + p, 0);
        const hasTrades = results.length > 0;
        const winRate = hasTrades ? (wins / results.length) * 100 : 0;

        return {
          id: session.id,
          name: session.name,
          instrument: session.instrument,
          timeframe: session.timeframe,
          startDate: session.startDate,
          endDate: session.endDate,
          initialBalance: session.initialBalance,
          balance: session.balance,
          entryCount: sessionEntries.length,
          closedTradeCount: closedTrades.length,
          pnl: totalPnl,
          winRate,
          entriesWithPnlCount: results.length,
        };
      })
      .sort((a, b) => {
        const dateA = new Date(a.startDate).getTime();
        const dateB = new Date(b.startDate).getTime();
        return dateB - dateA;
      });
  }, [sessions, entries]);

  const allClosedTrades = useMemo(() => flattenClosedTrades(sessions), [sessions]);

  const analytics = useMemo(() => {
    if (allClosedTrades.length === 0) return null;
    return computeAnalytics(allClosedTrades, sessions);
  }, [allClosedTrades, sessions]);

  const gradedTrades = useMemo(() => analytics?.gradedTrades ?? [], [analytics]);

  const tradeStats = useMemo(() => {
    if (gradedTrades.length === 0) return null;
    const wins = gradedTrades.filter(t => t.pnlValue > 0).length;
    const totalPnl = gradedTrades.reduce((sum, t) => sum + t.pnlValue, 0);
    const winRate = (wins / gradedTrades.length) * 100;
    const avgR = gradedTrades.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0) / gradedTrades.length;
    return { totalTrades: gradedTrades.length, wins, totalPnl, winRate, avgR };
  }, [gradedTrades]);

  const selectedSessionData = useMemo(() => {
    if (!selectedSessionInJournal) return null;
    return sessionsWithEntries.find(s => s.id === selectedSessionInJournal) || null;
  }, [selectedSessionInJournal, sessionsWithEntries]);

  const archivedSessionsWithEntries = useMemo(() => {
    return safeArchivedSessions
      .filter(session => (session.journalEntries ?? []).length > 0 || session.trades.some(t => t.status === 'closed'))
      .map(session => {
        const sessionEntries = archivedEntries.filter(e => e.sessionId === session.id);
        const closedTrades = session.trades.filter(t => t.status === 'closed');
        const closedTradeIds = new Set(closedTrades.map(t => t.id));
        const manualPnlEntries = sessionEntries.filter(e => typeof e.pnl === 'number' && !(e.tradeId && closedTradeIds.has(e.tradeId)));

        const results = [
          ...closedTrades.map(t => t.pnl ?? 0),
          ...manualPnlEntries.map(e => e.pnl ?? 0),
        ];
        const wins = results.filter(p => p > 0).length;
        const totalPnl = results.reduce((sum, p) => sum + p, 0);
        const hasTrades = results.length > 0;
        const winRate = hasTrades ? (wins / results.length) * 100 : 0;

        return {
          id: session.id,
          name: session.name,
          instrument: session.instrument,
          timeframe: session.timeframe,
          startDate: session.startDate,
          endDate: session.endDate,
          initialBalance: session.initialBalance,
          balance: session.balance,
          entryCount: sessionEntries.length,
          closedTradeCount: closedTrades.length,
          pnl: totalPnl,
          winRate,
          entriesWithPnlCount: results.length,
          deletedAt: session.deletedAt,
        };
      })
      .sort((a, b) => b.deletedAt - a.deletedAt);
  }, [safeArchivedSessions, archivedEntries]);

  const archivedClosedTrades = useMemo(() => flattenClosedTrades(safeArchivedSessions), [safeArchivedSessions]);

  const archivedAnalytics = useMemo(() => {
    if (archivedClosedTrades.length === 0) return null;
    return computeAnalytics(archivedClosedTrades, safeArchivedSessions);
  }, [archivedClosedTrades, safeArchivedSessions]);

  const archivedGradedTrades = useMemo(() => archivedAnalytics?.gradedTrades ?? [], [archivedAnalytics]);

  const selectedArchivedSessionData = useMemo(() => {
    if (!selectedArchivedSessionId) return null;
    return archivedSessionsWithEntries.find(s => s.id === selectedArchivedSessionId) || null;
  }, [selectedArchivedSessionId, archivedSessionsWithEntries]);

  const archiveFilteredEntries = useMemo(() => {
    if (!selectedArchivedSessionId) return [];
    return archivedEntries.filter(e => e.sessionId === selectedArchivedSessionId);
  }, [archivedEntries, selectedArchivedSessionId]);

  const filteredAndSortedEntries = useMemo(() => {
    let result = [...entries];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(e => 
        e.title.toLowerCase().includes(query) ||
        e.note?.toLowerCase().includes(query) ||
        e.instrument.toLowerCase().includes(query) ||
        e.sessionName.toLowerCase().includes(query) ||
        e.tags?.some(t => t.toLowerCase().includes(query))
      );
    }

    if (filterInstrument !== 'all') {
      result = result.filter(e => e.instrument.toUpperCase() === filterInstrument);
    }

    if (filterSession !== 'all') {
      result = result.filter(e => e.sessionName === filterSession);
    }

    if (filterTimeframe !== 'all') {
      const targetTf = filterTimeframe.toLowerCase();
      result = result.filter(e => {
        const tf = (e.timeframe || '1m').toLowerCase();
        return tf === targetTf || (targetTf === '1m' && tf === 'm1') || (targetTf === '5m' && tf === 'm5') || (targetTf === '15m' && tf === 'm15') || (targetTf === '1h' && tf === 'h1') || (targetTf === '4h' && tf === 'h4') || (targetTf === '1d' && tf === 'd1');
      });
    }

    if (filterTradeType !== 'all') {
      result = result.filter(e => e.tradeType === filterTradeType);
    }

    if (filterFavorites) {
      result = result.filter(e => e.isFavorite === true);
    }

    if (dateFrom) {
      const fromTimestamp = new Date(dateFrom).getTime();
      result = result.filter(e => e.createdAt >= fromTimestamp);
    }

    if (dateTo) {
      const toTimestamp = new Date(dateTo).getTime() + 86400000;
      result = result.filter(e => e.createdAt < toTimestamp);
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date':
          comparison = a.createdAt - b.createdAt;
          break;
        case 'pnl':
          comparison = (a.pnl ?? 0) - (b.pnl ?? 0);
          break;
        case 'instrument':
          comparison = a.instrument.localeCompare(b.instrument);
          break;
        case 'session':
          comparison = a.sessionName.localeCompare(b.sessionName);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [entries, searchQuery, filterInstrument, filterSession, filterTimeframe, filterTradeType, filterFavorites, dateFrom, dateTo, sortField, sortDirection]);

  const sessionFilteredEntries = useMemo(() => {
    if (!selectedSessionInJournal) return filteredAndSortedEntries;
    return filteredAndSortedEntries.filter(e => e.sessionId === selectedSessionInJournal);
  }, [selectedSessionInJournal, filteredAndSortedEntries]);

  const visibleEntries = useMemo(() => {
    if (selectedArchivedSessionId) return archiveFilteredEntries;
    if (selectedSessionInJournal) return sessionFilteredEntries;
    return filteredAndSortedEntries;
  }, [selectedArchivedSessionId, selectedSessionInJournal, sessionFilteredEntries, filteredAndSortedEntries, archiveFilteredEntries]);

  const visibleCards = useMemo<GroupedJournalCard[]>(() => {
    const map = new Map<string, GroupedJournalCard>();
    const list: GroupedJournalCard[] = [];

    for (const entry of visibleEntries) {
      if (entry.tradeId) {
        const key = `${entry.sessionId}_${entry.tradeId}`;
        if (map.has(key)) {
          const group = map.get(key)!;
          if (!group.entries.some(e => e.id === entry.id)) {
            group.entries.push(entry);
          }
          if (entry.tags) {
            for (const t of entry.tags) {
              if (!group.tags.includes(t)) group.tags.push(t);
            }
          }
          if (entry.isFavorite) group.isFavorite = true;
          if (!group.trade && entry.trade) group.trade = entry.trade;
          group.createdAt = Math.max(group.createdAt, entry.createdAt);
        } else {
          const group: GroupedJournalCard = {
            id: key,
            tradeId: entry.tradeId,
            isTradeGroup: true,
            sessionId: entry.sessionId,
            sessionName: entry.sessionName,
            instrument: entry.instrument,
            tradeType: entry.tradeType,
            pnl: entry.pnl,
            trade: entry.trade,
            createdAt: entry.createdAt,
            isFavorite: Boolean(entry.isFavorite),
            tags: [...(entry.tags || [])],
            note: entry.note,
            title: entry.title,
            entries: [entry],
          };
          map.set(key, group);
          list.push(group);
        }
      } else {
        list.push({
          id: entry.id,
          isTradeGroup: false,
          sessionId: entry.sessionId,
          sessionName: entry.sessionName,
          instrument: entry.instrument,
          tradeType: entry.tradeType,
          pnl: entry.pnl,
          trade: entry.trade,
          createdAt: entry.createdAt,
          isFavorite: Boolean(entry.isFavorite),
          tags: [...(entry.tags || [])],
          note: entry.note,
          title: entry.title,
          entries: [entry],
        });
      }
    }

    // Sort timeframes in ascending chronological duration within each group (e.g. 1M -> 5M -> 15M -> 30M -> 1H -> 4H -> 1D)
    for (const group of list) {
      if (group.entries.length > 1) {
        group.entries.sort((a, b) => {
          const secA = getTimeframeSeconds(auraTimeframeToDukascopy(a.timeframe));
          const secB = getTimeframeSeconds(auraTimeframeToDukascopy(b.timeframe));
          return secA - secB;
        });
      }
    }

    return list;
  }, [visibleEntries]);

  const gridEntries = useMemo(() => (
    selectedArchivedSessionId ? archiveFilteredEntries : sessionFilteredEntries
  ), [selectedArchivedSessionId, archiveFilteredEntries, sessionFilteredEntries]);

  const stats = useMemo(() => {
    let trades = allClosedTrades;
    if (selectedSessionInJournal) {
      trades = trades.filter((t) => t.sessionId === selectedSessionInJournal);
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      trades = trades.filter((t) => t.closedAt >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000;
      trades = trades.filter((t) => t.closedAt < to);
    }
    if (filterInstrument !== 'all') {
      trades = trades.filter((t) => t.instrument.toUpperCase() === filterInstrument.toUpperCase());
    }
    if (filterSession !== 'all') {
      trades = trades.filter((t) => t.sessionName === filterSession);
    }
    if (filterTimeframe !== 'all') {
      const tf = filterTimeframe.toLowerCase();
      trades = trades.filter((t) => (t.timeframe || '').toLowerCase() === tf);
    }
    if (filterTradeType !== 'all') {
      trades = trades.filter((t) => t.type === filterTradeType);
    }

    return summarizeTradesAndEntries(trades, visibleEntries);
  }, [visibleEntries, allClosedTrades, selectedSessionInJournal, dateFrom, dateTo, filterInstrument, filterSession, filterTimeframe, filterTradeType]);

  const displayStats = useMemo(() => {
    if (selectedArchivedSessionId) {
      const trades = archivedClosedTrades.filter((t) => t.sessionId === selectedArchivedSessionId);
      return summarizeTradesAndEntries(trades, archiveFilteredEntries);
    }
    if (journalViewMode === 'archive') {
      return summarizeTradesAndEntries(archivedClosedTrades, archivedEntries);
    }
    return stats;
  }, [selectedArchivedSessionId, journalViewMode, archivedClosedTrades, archiveFilteredEntries, archivedEntries, stats]);

  const calendarData = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const entriesToUse = visibleEntries;
    const entriesByDate: Record<string, EntryWithSession[]> = {};
    entriesToUse.forEach(entry => {
      const dateKey = new Date(entry.createdAt).toISOString().split('T')[0];
      if (!entriesByDate[dateKey]) entriesByDate[dateKey] = [];
      entriesByDate[dateKey].push(entry);
    });

    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) week.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      week.push(day);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }

    return { weeks, entriesByDate, year, month, monthName: firstDay.toLocaleString('default', { month: 'long' }) };
  }, [visibleEntries, calendarMonth]);

  const handleCalendarDayClick = (day: number) => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setDateFrom(dateStr);
    setDateTo(dateStr);
  };

  const pnLChartData = useMemo(() => {
    const entriesToUse = visibleEntries;
    const entriesWithPnl = entriesToUse
      .filter(e => typeof e.pnl === 'number')
      .sort((a, b) => a.createdAt - b.createdAt);

    let cumulative = 0;
    return entriesWithPnl.map(entry => {
      cumulative += entry.pnl ?? 0;
      return {
        date: new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        pnl: cumulative,
        rawPnl: entry.pnl,
        title: entry.title,
      };
    });
  }, [visibleEntries]);

  const handleSelectAll = () => {
    if (selectedEntries.size === gridEntries.length) {
      setSelectedEntries(new Set());
    } else {
      setSelectedEntries(new Set(gridEntries.map(e => e.id)));
    }
  };

  const handleSelectEntry = (id: string) => {
    const newSelected = new Set(selectedEntries);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedEntries(newSelected);
  };

  const handleBatchDelete = () => {
    selectedEntries.forEach(id => {
      const entry = entries.find(e => e.id === id) ?? archivedEntries.find(e => e.id === id);
      if (entry) {
        removeJournalEntry(id, entry.sessionId);
      }
    });
    setSelectedEntries(new Set());
  };

  const handleLightboxNavigate = useCallback((direction: 'prev' | 'next') => {
    if (lightboxIndex === null) return;
    const images = visibleEntries.filter(e => e.imageDataUrl);
    const currentImage = images[lightboxIndex];
    if (!currentImage) return;

    const currentOriginalIndex = visibleEntries.findIndex(e => e.id === currentImage.id);
    let newIndex: number;

    if (direction === 'prev') {
      newIndex = currentOriginalIndex > 0 ? currentOriginalIndex - 1 : visibleEntries.length - 1;
    } else {
      newIndex = currentOriginalIndex < visibleEntries.length - 1 ? currentOriginalIndex + 1 : 0;
    }

    while (newIndex !== currentOriginalIndex && !visibleEntries[newIndex].imageDataUrl) {
      newIndex = direction === 'prev' 
        ? (newIndex > 0 ? newIndex - 1 : visibleEntries.length - 1)
        : (newIndex < visibleEntries.length - 1 ? newIndex + 1 : 0);
    }

    setLightboxIndex(images.findIndex(e => e.id === visibleEntries[newIndex].id));
  }, [lightboxIndex, visibleEntries]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowLeft') handleLightboxNavigate('prev');
      if (e.key === 'ArrowRight') handleLightboxNavigate('next');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, handleLightboxNavigate]);

  useEffect(() => {
    if (slideshowInterval !== null && lightboxIndex !== null) {
      slideshowRef.current = setInterval(() => {
        handleLightboxNavigate('next');
      }, slideshowInterval * 1000);
    }
    return () => {
      if (slideshowRef.current) {
        clearInterval(slideshowRef.current);
      }
    };
  }, [slideshowInterval, slideshowSpeed, lightboxIndex, handleLightboxNavigate]);

  const toggleSlideshow = () => {
    if (slideshowInterval !== null) {
      setSlideshowInterval(null);
      if (slideshowRef.current) {
        clearInterval(slideshowRef.current);
      }
    } else {
      setSlideshowInterval(slideshowSpeed);
    }
  };

  const handleAddTag = (entry: EntryWithSession) => {
    const draftTag = tagDrafts[entry.id]?.trim() ?? '';
    if (!draftTag) return;
    const currentTags = entry.tags ?? [];
    if (!currentTags.includes(draftTag)) {
      updateJournalEntry(entry.id, entry.sessionId, { 
        tags: [...currentTags, draftTag] 
      });
    }
    setTagDrafts((current) => ({ ...current, [entry.id]: '' }));
  };

  const handleRemoveTag = (entry: EntryWithSession, tagToRemove: string) => {
    const currentTags = entry.tags ?? [];
    updateJournalEntry(entry.id, entry.sessionId, { 
      tags: currentTags.filter(t => t !== tagToRemove) 
    });
  };

  const handleToggleFavorite = (entry: EntryWithSession) => {
    updateJournalEntry(entry.id, entry.sessionId, { 
      isFavorite: !entry.isFavorite 
    });
  };

  const handleSaveEdit = () => {
    if (!editEntry) return;
    updateJournalEntry(editEntry.id, editEntry.sessionId, {
      title: editEntry.title,
      note: editEntry.note,
      tags: editEntry.tags,
    });
    setEditEntry(null);
  };

  const lightboxEntries = useMemo(() => visibleEntries.filter(e => e.imageDataUrl), [visibleEntries]);

  const activeLightboxEntry = lightboxIndex !== null ? lightboxEntries[lightboxIndex] : null;

  if (entries.length === 0 && allClosedTrades.length === 0 && archivedEntries.length === 0 && archivedClosedTrades.length === 0) {
    return (
      <div className="warm-journal relative flex flex-1 items-center justify-center overflow-hidden bg-transparent p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative max-w-xl rounded-3xl border border-white/10 bg-white/5 px-8 py-8 text-center shadow-lg "
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] ring-1 ring-[var(--border-soft)]">
            <BookOpen size={24} className="text-[var(--accent-2)]" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">Nothing here yet.</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Take a screenshot while replaying to save a setup, or close a trade and it will show up in
            your trade log below.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="warm-journal relative flex-1 overflow-y-auto bg-transparent">
      <div className="relative mx-auto max-w-7xl px-5 py-6 lg:px-6 lg:py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 rounded-xl border border-white/10 bg-gradient-to-br from-white/8 via-white/5 to-white/[0.03] p-4 shadow-md "
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-1)]">
                <Camera size={13} />
                Trading journal
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white lg:text-4xl">Your trades, in one place.</h1>
              <p className="mt-3 text-sm leading-6 text-zinc-400 lg:text-[15px]">
                Every closed trade lands in the log below, and screenshots let you look back at a setup
                exactly how you saw it.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-[var(--app-bg)]/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Entries</div>
                <div className="mt-1 text-2xl font-semibold text-white">{displayStats.totalEntries}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[var(--app-bg)]/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Win Rate</div>
                <div className={`mt-1 text-2xl font-semibold ${displayStats.winRate >= 50 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {displayStats.resultCount > 0 ? `${displayStats.winRate.toFixed(0)}%` : '-'}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[var(--app-bg)]/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Total P&L</div>
                <div className={`mt-1 text-2xl font-semibold ${displayStats.totalPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {displayStats.totalPnl >= 0 ? '+' : ''}{displayStats.totalPnl.toFixed(2)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[var(--app-bg)]/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Current focus</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {currentSession ? `${currentSession.instrument.toUpperCase()} | ${currentSession.timeframe}` : 'All sessions'}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-0.5">
              <button
                onClick={() => { setJournalViewMode('sessions'); setSelectedSessionInJournal(null); setSelectedArchivedSessionId(null); }}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  journalViewMode === 'sessions' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
                }`}
                title="Session overview"
              >
                <LayoutGrid size={13} />
                Sessions
              </button>
              <button
                onClick={() => { setJournalViewMode('all'); setSelectedSessionInJournal(null); setSelectedArchivedSessionId(null); }}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  journalViewMode === 'all' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
                }`}
                title="All journal content"
              >
                <List size={13} />
                All Journal
              </button>
              <button
                onClick={() => { setJournalViewMode('archive'); setSelectedArchivedSessionId(null); setSelectedSessionInJournal(null); }}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  journalViewMode === 'archive' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
                }`}
                title="Deleted sessions archive"
              >
                <Archive size={13} />
                Archive{safeArchivedSessions.length > 0 ? ` (${safeArchivedSessions.length})` : ''}
              </button>
            </div>
          </div>
        </motion.div>

        {journalViewMode === 'sessions' && !selectedSessionInJournal && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Sessions ({sessionsWithEntries.length})</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {sessionsWithEntries.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSessionInJournal(session.id)}
                  className="group flex flex-col items-start rounded-xl border border-white/10 bg-white/5 p-4 text-left shadow-lg transition hover:-translate-y-1 hover:border-[var(--border-strong)] hover:bg-white/10"
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="text-base font-semibold text-white group-hover:text-[var(--accent-1)]">
                      {session.name}
                    </div>
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 text-zinc-400 transition group-hover:bg-white/10 group-hover:text-white">
                      <ChevronRight size={14} />
                    </div>
                  </div>
                  <div className="mt-1.5 text-sm text-zinc-400">
                    {session.instrument.toUpperCase()} | {session.timeframe}
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
                    <span>{session.startDate} {'->'} {session.endDate}</span>
                  </div>
                  <div className="mt-3 flex w-full items-center justify-between border-t border-white/10 pt-2.5">
                    <div className="flex items-center gap-2">
                      {session.closedTradeCount > 0 ? (
                        <Activity size={12} className="text-zinc-500" />
                      ) : (
                        <Camera size={12} className="text-zinc-500" />
                      )}
                      <span className="text-sm text-zinc-400">
                        {session.closedTradeCount > 0 && `${session.closedTradeCount} trades`}
                        {session.closedTradeCount > 0 && session.entryCount > 0 && ' · '}
                        {session.entryCount > 0 && `${session.entryCount} screenshots`}
                      </span>
                    </div>
                    <div className={`text-sm font-semibold ${session.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {session.pnl >= 0 ? '+' : ''}{session.pnl.toFixed(2)} P&L
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {journalViewMode === 'sessions' && selectedSessionInJournal && selectedSessionData && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4 "
          >
            <button
              onClick={() => setSelectedSessionInJournal(null)}
              className="mb-3 flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-white"
            >
              <ChevronLeft size={15} />
              Back to Sessions
            </button>
            
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">{selectedSessionData.name}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                  <span className="text-white">{selectedSessionData.instrument.toUpperCase()}</span>
                  <span>|</span>
                  <span>{selectedSessionData.timeframe}</span>
                  <span>|</span>
                  <span>{selectedSessionData.startDate} {'->'} {selectedSessionData.endDate}</span>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-3">
                <div className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Balance</div>
                  <div className="mt-0.5 text-base font-semibold text-white">
                    ${selectedSessionData.initialBalance.toLocaleString()} {'->'} ${selectedSessionData.balance.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">P&L</div>
                  <div className={`mt-0.5 text-base font-semibold ${selectedSessionData.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {selectedSessionData.pnl >= 0 ? '+' : ''}{selectedSessionData.pnl.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Win Rate</div>
                  <div className={`mt-0.5 text-base font-semibold ${selectedSessionData.winRate >= 50 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {selectedSessionData.entriesWithPnlCount > 0 || selectedSessionData.closedTradeCount > 0 ? `${selectedSessionData.winRate.toFixed(0)}%` : '-'}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Screenshots</div>
                  <div className="mt-0.5 text-base font-semibold text-white">{selectedSessionData.entryCount}</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {journalViewMode === 'archive' && !selectedArchivedSessionId && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Deleted Sessions ({archivedSessionsWithEntries.length})</h2>
            </div>
            {archivedSessionsWithEntries.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] ring-1 ring-[var(--border-soft)]">
                  <Archive size={24} className="text-[var(--accent-2)]" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white">Archive is empty</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Sessions you delete are moved here — their trade log and screenshots stay available.
                  Restore them anytime.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {archivedSessionsWithEntries.map((session) => (
                  <div
                    key={session.id}
                    className="group flex flex-col rounded-xl border border-white/10 bg-white/5 p-4 text-left shadow-lg transition hover:-translate-y-1 hover:border-[var(--border-strong)] hover:bg-white/10"
                  >
                    <button
                      onClick={() => setSelectedArchivedSessionId(session.id)}
                      className="flex w-full items-start justify-between text-left"
                    >
                      <div>
                        <div className="text-base font-semibold text-white group-hover:text-[var(--accent-1)]">
                          {session.name}
                        </div>
                        <div className="mt-1.5 text-sm text-zinc-400">
                          {session.instrument.toUpperCase()} | {session.timeframe}
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
                          <span>{session.startDate} {'->'} {session.endDate}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          Deleted {new Date(session.deletedAt).toLocaleString()}
                        </div>
                      </div>
                      <ChevronRight size={14} className="mt-1 text-zinc-400" />
                    </button>
                    <div className="mt-3 flex w-full items-center justify-between border-t border-white/10 pt-2.5">
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        {session.closedTradeCount > 0 && <Activity size={12} className="text-zinc-500" />}
                        <span>
                          {session.closedTradeCount > 0 && `${session.closedTradeCount} trades`}
                          {session.closedTradeCount > 0 && session.entryCount > 0 && ' · '}
                          {session.entryCount > 0 && `${session.entryCount} screenshots`}
                        </span>
                      </div>
                      <div className={`text-sm font-semibold ${session.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {session.pnl >= 0 ? '+' : ''}{session.pnl.toFixed(2)} P&L
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => {
                          restoreArchivedSession(session.id);
                          setJournalViewMode('sessions');
                          setSelectedSessionInJournal(session.id);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                      >
                        <RotateCcw size={12} />
                        Restore
                      </button>
                      <button
                        onClick={() => {
                          if (confirmingPermanentDelete === session.id) {
                            permanentlyDeleteArchivedSession(session.id);
                            setConfirmingPermanentDelete(null);
                          } else {
                            setConfirmingPermanentDelete(session.id);
                            setTimeout(() => setConfirmingPermanentDelete((cur) => (cur === session.id ? null : cur)), 3000);
                          }
                        }}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                          confirmingPermanentDelete === session.id
                            ? 'border-rose-500/50 bg-rose-500/20 text-rose-200'
                            : 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                        }`}
                      >
                        <Trash2 size={12} />
                        {confirmingPermanentDelete === session.id ? 'Click to confirm' : 'Delete forever'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {journalViewMode === 'archive' && selectedArchivedSessionId && selectedArchivedSessionData && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4"
          >
            <button
              onClick={() => setSelectedArchivedSessionId(null)}
              className="mb-3 flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-white"
            >
              <ChevronLeft size={15} />
              Back to Archive
            </button>

            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">{selectedArchivedSessionData.name}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                  <span className="text-white">{selectedArchivedSessionData.instrument.toUpperCase()}</span>
                  <span>|</span>
                  <span>{selectedArchivedSessionData.timeframe}</span>
                  <span>|</span>
                  <span>{selectedArchivedSessionData.startDate} {'->'} {selectedArchivedSessionData.endDate}</span>
                  <span>|</span>
                  <span>Deleted {new Date(selectedArchivedSessionData.deletedAt).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    restoreArchivedSession(selectedArchivedSessionData.id);
                    setSelectedArchivedSessionId(null);
                    setJournalViewMode('sessions');
                    setSelectedSessionInJournal(selectedArchivedSessionData.id);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                >
                  <RotateCcw size={12} />
                  Restore session
                </button>
                <button
                  onClick={() => {
                    if (confirmingPermanentDelete === selectedArchivedSessionData.id) {
                      permanentlyDeleteArchivedSession(selectedArchivedSessionData.id);
                      setSelectedArchivedSessionId(null);
                      setConfirmingPermanentDelete(null);
                    } else {
                      setConfirmingPermanentDelete(selectedArchivedSessionData.id);
                      setTimeout(() => setConfirmingPermanentDelete((cur) => (cur === selectedArchivedSessionData.id ? null : cur)), 3000);
                    }
                  }}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    confirmingPermanentDelete === selectedArchivedSessionData.id
                      ? 'border-rose-500/50 bg-rose-500/20 text-rose-200'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                  }`}
                >
                  <Trash2 size={12} />
                  {confirmingPermanentDelete === selectedArchivedSessionData.id ? 'Click to confirm' : 'Delete forever'}
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <div className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Balance</div>
                <div className="mt-0.5 text-base font-semibold text-white">
                  ${selectedArchivedSessionData.initialBalance.toLocaleString()} {'->'} ${selectedArchivedSessionData.balance.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">P&L</div>
                <div className={`mt-0.5 text-base font-semibold ${selectedArchivedSessionData.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {selectedArchivedSessionData.pnl >= 0 ? '+' : ''}{selectedArchivedSessionData.pnl.toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Win Rate</div>
                <div className={`mt-0.5 text-base font-semibold ${selectedArchivedSessionData.winRate >= 50 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {selectedArchivedSessionData.entriesWithPnlCount > 0 || selectedArchivedSessionData.closedTradeCount > 0 ? `${selectedArchivedSessionData.winRate.toFixed(0)}%` : '-'}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Screenshots</div>
                <div className="mt-0.5 text-base font-semibold text-white">{selectedArchivedSessionData.entryCount}</div>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="mb-3 text-sm font-semibold text-white">
                Trade Log ({archivedGradedTrades.filter((t) => t.sessionId === selectedArchivedSessionId).length})
              </h3>
              <TradeLogTable
                trades={archivedGradedTrades.filter((t) => t.sessionId === selectedArchivedSessionId)}
                onReplay={(trade) => setReplayTarget(trade)}
              />
            </div>
          </motion.div>
        )}

        {journalViewMode !== 'archive' && (
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search entries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 transition focus:border-[var(--accent-1)] focus:outline-none"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                showFilters 
                  ? 'border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-primary)]' 
                  : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white'
              }`}
            >
              <Filter size={15} />
              Filters
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
                }`}
                title="Grid view"
              >
                <LayoutGrid size={13} />
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  viewMode === 'calendar' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
                }`}
                title="Calendar view"
              >
                <Calendar size={13} />
              </button>
            </div>
            {selectedEntries.size > 0 && (
              <button
                onClick={handleBatchDelete}
                className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-300 transition hover:bg-rose-500/20"
              >
                <Trash2 size={15} />
                Delete ({selectedEntries.size})
              </button>
            )}
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-0.5">
              <button
                onClick={() => setSortField('date')}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  sortField === 'date' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Calendar size={11} />
              </button>
              <button
                onClick={() => setSortField('pnl')}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  sortField === 'pnl' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <DollarSign size={11} />
              </button>
              <button
                onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-400 transition hover:text-white"
              >
                {sortDirection === 'asc' ? <SortAsc size={13} /> : <SortDesc size={13} />}
              </button>
            </div>
          </div>
        </div>
        )}

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-5 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-4 "
            >
              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Instrument</label>
                  <select
                    value={filterInstrument}
                    onChange={(e) => setFilterInstrument(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-2.5 py-1.5 text-sm text-white focus:border-[var(--accent-1)] focus:outline-none"
                  >
                    <option value="all">All Instruments</option>
                    {instruments.map(i => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Session</label>
                  <select
                    value={filterSession}
                    onChange={(e) => setFilterSession(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-2.5 py-1.5 text-sm text-white focus:border-[var(--accent-1)] focus:outline-none"
                  >
                    <option value="all">All Sessions</option>
                    {sessionNames.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Timeframe</label>
                  <select
                    value={filterTimeframe}
                    onChange={(e) => setFilterTimeframe(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-2.5 py-1.5 text-sm text-white focus:border-[var(--accent-1)] focus:outline-none"
                  >
                    <option value="all">All Timeframes</option>
                    {timeframes.map(tf => (
                      <option key={tf} value={tf}>{tf}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Trade Type</label>
                  <select
                    value={filterTradeType}
                    onChange={(e) => setFilterTradeType(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-2.5 py-1.5 text-sm text-white focus:border-[var(--accent-1)] focus:outline-none"
                  >
                    <option value="all">All Types</option>
                    <option value="buy">Long</option>
                    <option value="sell">Short</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">From Date</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-2.5 py-1.5 text-sm text-white focus:border-[var(--accent-1)] focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">To Date</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-2.5 py-1.5 text-sm text-white focus:border-[var(--accent-1)] focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Favorites</label>
                  <button
                    onClick={() => setFilterFavorites(!filterFavorites)}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition ${
                      filterFavorites
                        ? 'border-amber-400/50 bg-amber-500/20 text-amber-300'
                        : 'border-white/10 bg-[var(--app-bg)]/20 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Star size={13} className={filterFavorites ? 'fill-amber-400 text-amber-400' : ''} />
                    {filterFavorites ? 'Starred Only' : 'Show All'}
                  </button>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setFilterInstrument('all');
                      setFilterSession('all');
                      setFilterTradeType('all');
                      setSearchQuery('');
                      setDateFrom('');
                      setDateTo('');
                      setFilterFavorites(false);
                    }}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-400 transition hover:text-white"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {journalViewMode !== 'archive' && displayStats.resultCount > 0 && (
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {displayStats.bestTrade && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-emerald-400">
                  <TrendingUp size={12} />
                  Best Trade
                </div>
                <div className="mt-1.5 text-xl font-semibold text-emerald-300">
                  +{Math.max(displayStats.bestTrade.pnl, 0).toFixed(2)}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {displayStats.bestTrade.title}
                </div>
              </div>
            )}
            {displayStats.worstTrade && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-rose-400">
                  <TrendingDown size={12} />
                  Worst Trade
                </div>
                <div className="mt-1.5 text-xl font-semibold text-rose-300">
                  {Math.min(displayStats.worstTrade.pnl, 0).toFixed(2)}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {displayStats.worstTrade.title}
                </div>
              </div>
            )}
          </div>
        )}

        {journalViewMode !== 'archive' && pnLChartData.length > 1 && (
          <div className="mb-5 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-4 ">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Cumulative P&L Over Time</div>
              <div className={`text-lg font-semibold ${pnLChartData[pnLChartData.length - 1]?.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {pnLChartData[pnLChartData.length - 1]?.pnl >= 0 ? '+' : ''}{pnLChartData[pnLChartData.length - 1]?.pnl.toFixed(2)}
              </div>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pnLChartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <defs>
                    <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickFormatter={(value) => value >= 0 ? `+${value}` : value.toString()}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{ 
                      backgroundColor: '#18181b', 
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      fontSize: '12px'
                    }}
                    labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                    formatter={(value: number) => [`${value >= 0 ? '+' : ''}${value.toFixed(2)}`, 'Cumulative P&L']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="pnl" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    fill="url(#pnlGradient)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {journalViewMode === 'all' && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            {gradedTrades.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center ">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] ring-1 ring-[var(--border-soft)]">
                  <Activity size={24} className="text-[var(--accent-2)]" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white">No trades recorded yet</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Execute trades during simulation and review them here. Every closed trade will appear in your journal's trade log.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-white">Trade Log ({gradedTrades.length})</h2>
                    {tradeStats && (
                      <>
                        <span className="text-sm text-zinc-500">|</span>
                        <span className={`text-sm font-semibold ${tradeStats.totalPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {tradeStats.totalPnl >= 0 ? '+' : ''}{tradeStats.totalPnl.toFixed(2)}
                        </span>
                        <span className="text-sm text-zinc-500">|</span>
                        <span className={`text-sm font-semibold ${tradeStats.winRate >= 50 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {tradeStats.winRate.toFixed(0)}% WR
                        </span>
                        <span className="text-sm text-zinc-500">|</span>
                        <span className="text-sm font-semibold text-zinc-300">{tradeStats.avgR.toFixed(2)}R avg</span>
                      </>
                    )}
                  </div>
                </div>

                <TradeLogTable
                  trades={gradedTrades}
                  onReplay={(trade) => setReplayTarget(trade)}
                />
              </>
            )}
          </motion.div>
        )}

        {(journalViewMode === 'all' || selectedSessionInJournal || selectedArchivedSessionId) && (
          <>
            <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={visibleCards.length > 0 && visibleCards.every(c => c.entries.every(e => selectedEntries.has(e.id)))}
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-[var(--accent-1)] focus:ring-[var(--accent-1)] cursor-pointer"
                />
                <span className="text-xs text-zinc-400 font-medium">
                  {selectedEntries.size > 0 ? `${selectedEntries.size} items selected` : `Select all (${visibleCards.length} ${visibleCards.length === 1 ? 'record' : 'records'})`}
                </span>
              </div>
              {selectedEntries.size > 0 && (
                <button
                  onClick={handleBatchDelete}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/20 transition"
                >
                  <Trash2 size={13} />
                  Delete Selected ({selectedEntries.size})
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              {visibleCards.map((card, index) => {
                const isActiveSession = card.sessionId === currentSessionId;
                const isLiveSession = sessions.some((s) => s.id === card.sessionId);
                const activeTfIdx = Math.min(cardActiveTfIndex[card.id] || 0, card.entries.length - 1);
                const activeEntry = card.entries[activeTfIdx] || card.entries[0];
                const isCardSelected = card.entries.every(e => selectedEntries.has(e.id));

                const handleToggleCardSelection = () => {
                  const next = new Set(selectedEntries);
                  if (isCardSelected) {
                    card.entries.forEach(e => next.delete(e.id));
                  } else {
                    card.entries.forEach(e => next.add(e.id));
                  }
                  setSelectedEntries(next);
                };

                const handleDeleteCard = () => {
                  card.entries.forEach(e => removeJournalEntry(e.id, e.sessionId));
                };

                const handleToggleCardFavorite = () => {
                  const nextFav = !card.isFavorite;
                  card.entries.forEach(e => updateJournalEntry(e.id, e.sessionId, { isFavorite: nextFav }));
                };

                const handleDownloadCardScreenshot = (dataUrl: string, tf: string) => {
                  if (!dataUrl) return;
                  const link = document.createElement('a');
                  link.href = dataUrl;
                  link.download = `ReplayX_${card.instrument.toUpperCase()}_${card.tradeType?.toUpperCase() || 'TRADE'}_${formatTimeframeBadgeLabel(tf)}_${Date.now()}.png`;
                  link.click();
                };

                return (
                  <motion.article
                    key={card.id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-md transition duration-300 hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-sm flex flex-col"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 border-b border-white/10 px-3.5 py-2.5 bg-black/10">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={isCardSelected}
                            onChange={handleToggleCardSelection}
                            className="h-4 w-4 rounded border-white/20 bg-white/5 text-[var(--accent-1)] focus:ring-[var(--accent-1)] cursor-pointer"
                          />
                          <button
                            onClick={() => setEditEntry(activeEntry)}
                            className={`text-left text-base font-semibold transition truncate max-w-md ${isActiveSession ? 'text-[var(--accent-1)]' : 'text-white group-hover:text-[var(--accent-1)]'}`}
                          >
                            {card.title}
                          </button>
                          {card.tradeType && (
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${card.tradeType === 'buy' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'}`}>
                              {card.tradeType === 'buy' ? 'Long' : 'Short'}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                          <span className="font-semibold text-zinc-300">{card.instrument.toUpperCase()}</span>
                          <span>•</span>
                          <span>{card.sessionName}</span>
                          {typeof card.pnl === 'number' && (
                            <>
                              <span>•</span>
                              <span className={`font-semibold ${card.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                                {card.pnl >= 0 ? '+' : ''}${Math.abs(card.pnl).toFixed(2)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={handleToggleCardFavorite}
                          className={`flex h-7 w-7 items-center justify-center rounded-xl transition ${
                            card.isFavorite 
                              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' 
                              : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white border border-white/10'
                          }`}
                          title={card.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star size={14} className={card.isFavorite ? 'fill-amber-300' : ''} />
                        </button>
                        <button
                          onClick={() => setEditEntry(activeEntry)}
                          className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white border border-white/10"
                          title="Edit entry"
                        >
                          <Edit3 size={14} />
                        </button>
                        {isLiveSession && (
                          <button
                            onClick={() => setCurrentSession(card.sessionId)}
                            className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white border border-white/10"
                            title="Open related session"
                          >
                            <MoveUpRight size={14} />
                          </button>
                        )}
                        <button
                          onClick={handleDeleteCard}
                          className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20 border border-rose-500/20"
                          title={card.entries.length > 1 ? `Delete all ${card.entries.length} screenshots for this trade` : 'Delete screenshot'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Multi-Timeframe Tab Bar (When multiple screenshots exist for this trade) */}
                    {card.entries.length > 1 && (
                      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-white/10 bg-black/20 overflow-x-auto scrollbar-none">
                        <div className="flex items-center gap-1.5 shrink-0">
                          {card.entries.map((item, tfIdx) => {
                            const isSelected = activeTfIdx === tfIdx;
                            const badge = formatTimeframeBadgeLabel(item.timeframe);
                            return (
                              <button
                                key={item.id || tfIdx}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCardActiveTfIndex((prev) => ({ ...prev, [card.id]: tfIdx }));
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                                  isSelected
                                    ? 'bg-[#2563eb] text-white shadow-sm ring-1 ring-white/30'
                                    : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/10'
                                }`}
                              >
                                <span>{badge}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 shrink-0">
                          <Camera size={12} className="text-[var(--accent-1)]" />
                          <span>{card.entries.length} Timeframes</span>
                        </div>
                      </div>
                    )}

                    {/* Chart Image Display with prominent timeframe badge */}
                    <div className="relative bg-[var(--app-bg)]/50 group/preview">
                      {activeEntry?.imageDataUrl ? (
                        <div className="relative w-full">
                          <img 
                            src={activeEntry.imageDataUrl} 
                            alt={activeEntry.title || card.title} 
                            className="h-56 w-full object-cover transition duration-500 group-hover:scale-[1.01] cursor-pointer"
                            onClick={() => {
                              const images = visibleEntries.filter((e) => e.imageDataUrl);
                              const idx = images.findIndex((e) => e.id === activeEntry.id);
                              setLightboxIndex(idx >= 0 ? idx : 0);
                            }}
                            id={LIGHTBOX_IMAGE_ID}
                          />

                          {/* Timeframe Badge Overlay */}
                          <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-[#2563eb] text-white shadow-lg ring-1 ring-white/30 uppercase tracking-wider">
                              {formatTimeframeBadgeLabel(activeEntry.timeframe)}
                            </span>
                          </div>

                          {/* Quick Action Overlay (Fullscreen & Download) */}
                          <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 opacity-0 group-hover/preview:opacity-100 transition-opacity duration-200">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadCardScreenshot(activeEntry.imageDataUrl, activeEntry.timeframe);
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-zinc-300 hover:text-white hover:bg-black/90 border border-white/20 shadow-md transition"
                              title="Download chart image"
                            >
                              <Download size={13} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const images = visibleEntries.filter((e) => e.imageDataUrl);
                                const idx = images.findIndex((e) => e.id === activeEntry.id);
                                setLightboxIndex(idx >= 0 ? idx : 0);
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-zinc-300 hover:text-white hover:bg-black/90 border border-white/20 shadow-md transition"
                              title="Open in fullscreen lightbox"
                            >
                              <Maximize2 size={13} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-56 items-center justify-center text-sm text-zinc-400">
                          <div className="flex items-center gap-2">
                            <ImageIcon size={16} />
                            No image available
                          </div>
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/50 to-transparent" />
                    </div>

                    {/* Card Content & Metadata */}
                    <div className="space-y-3 px-4 py-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                          <div className="flex items-center gap-2">
                            <Calendar size={13} />
                            <span>{new Date(card.createdAt).toLocaleString()}</span>
                          </div>
                        </div>

                        {card.tags && card.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {card.tags.map((tag, i) => (
                              <span
                                key={i}
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TAG_COLORS[i % TAG_COLORS.length]}`}
                              >
                                <Tag size={10} />
                                {tag}
                                <button
                                  onClick={() => handleRemoveTag(activeEntry, tag)}
                                  className="ml-1 hover:text-white"
                                >
                                  <X size={10} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              placeholder="Add tag..."
                              value={tagDrafts[activeEntry.id] ?? ''}
                              onChange={(e) => setTagDrafts((current) => ({ ...current, [activeEntry.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleAddTag(activeEntry);
                                }
                              }}
                              className="w-full rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-2.5 py-1 text-xs text-white placeholder-zinc-500 focus:border-[var(--accent-1)] focus:outline-none"
                            />
                          </div>
                          <button
                            onClick={() => handleAddTag(activeEntry)}
                            className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                          >
                            <Plus size={12} />
                          </button>
                        </div>

                        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">
                          {activeEntry.note || card.note || 'No notes added yet - use the journal to capture what you saw, what you felt, and what you learned.'}
                        </p>
                      </div>

                      {card.trade && card.trade.strategyId && (
                        (() => {
                          const strategy = strategies.find(s => s.id === card.trade?.strategyId);
                          if (!strategy) return null;
                          const hits = card.trade.checklistHits || [];
                          
                          return (
                            <div className="mt-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-1)] p-4 shadow-sm inset-shadow-sm">
                              <div className="mb-3 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--accent-1)]">
                                  <Layers size={14} />
                                  Strategy Execution
                                </div>
                                <span className="text-[10px] uppercase font-bold text-[var(--accent-1)] bg-[var(--accent-1)]/15 px-2 py-0.5 rounded-md border border-[var(--accent-1)]/30">
                                  {strategy.name}
                                </span>
                              </div>
                              <div className="space-y-2">
                                {strategy.checklists.map(c => {
                                  const checked = hits.includes(c.id);
                                  return (
                                    <div key={c.id} className={`flex items-start gap-3 text-xs p-2 rounded-lg border transition-colors ${checked ? 'border-[var(--accent-1)]/30 bg-[var(--accent-1)]/10' : 'border-white/5 bg-[var(--app-bg)]/20 opacity-60'}`}>
                                      <div className={`mt-0.5 shrink-0 flex h-4 w-4 items-center justify-center rounded-md border ${
                                        checked ? 'bg-[var(--accent-1)] border-[var(--accent-1)] text-[var(--accent-contrast)]' : 'border-zinc-600 bg-white/5'
                                      }`}>
                                        {checked && <Check size={10} strokeWidth={3} />}
                                      </div>
                                      <span className={`${checked ? 'text-[var(--text-primary)] font-medium' : 'text-zinc-400 line-through decoration-zinc-600/50'}`}>{c.text}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </>
        )}

        {journalViewMode !== 'archive' && viewMode === 'calendar' && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-4 "
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <ChevronLeft size={16} />
                </button>
                <h3 className="text-base font-semibold text-white">
                  {calendarData.monthName} {calendarData.year}
                </h3>
                <button
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <button
                onClick={() => setCalendarMonth(new Date())}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-400 transition hover:text-white"
              >
                Today
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="py-1.5 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
                  {day}
                </div>
              ))}
              {calendarData.weeks.flat().map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="h-16" />;
                }
                const dateStr = `${calendarData.year}-${String(calendarData.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayEntries = calendarData.entriesByDate[dateStr] || [];
                const isToday = new Date().toISOString().split('T')[0] === dateStr;
                const isSelected = dateFrom === dateStr && dateTo === dateStr;

                return (
                  <button
                    key={day}
                    onClick={() => handleCalendarDayClick(day)}
                    className={`relative h-16 rounded-lg border p-0.5 transition ${
                      isSelected
                        ? 'border-[var(--accent-1)]/50 bg-[var(--accent-1)]/20'
                        : 'border-white/5 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className={`text-xs font-medium ${isToday ? 'text-[var(--accent-1)]' : 'text-zinc-400'}`}>
                      {day}
                    </div>
                    <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                      {dayEntries.slice(0, 3).map((entry, i) => (
                        <div
                          key={i}
                          className={`h-1 w-1 rounded-full ${
                            entry.isFavorite ? 'bg-amber-400' :
                            (entry.pnl ?? 0) >= 0 ? 'bg-emerald-400' : 'bg-rose-400'
                          }`}
                        />
                      ))}
                      {dayEntries.length > 3 && (
                        <div className="text-[10px] text-zinc-500">+{dayEntries.length - 3}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {lightboxIndex !== null && activeLightboxEntry && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-bg)]/95 "
            onClick={() => setLightboxIndex(null)}
          >
            <button
              onClick={() => setLightboxIndex(null)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <X size={16} />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); handleLightboxNavigate('prev'); }}
              className="absolute left-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); handleLightboxNavigate('next'); }}
              className="absolute right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 lg:left-auto lg:right-[84px]"
            >
              <ChevronRight size={16} />
            </button>

            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--app-bg)]/60 px-3 py-1.5 ">
              <button
                onClick={(e) => { e.stopPropagation(); toggleSlideshow(); }}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
                  slideshowInterval !== null
                    ? 'bg-[var(--accent-1)] text-[var(--accent-contrast)]'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                title={slideshowInterval !== null ? 'Pause slideshow' : 'Play slideshow'}
              >
                {slideshowInterval !== null ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <div className="flex items-center gap-1">
                {[3, 5, 10].map(speed => (
                  <button
                    key={speed}
                    onClick={(e) => { e.stopPropagation(); setSlideshowSpeed(speed); if (slideshowInterval !== null) setSlideshowInterval(speed); }}
                    className={`rounded px-1.5 py-0.5 text-xs font-medium transition ${
                      slideshowSpeed === speed
                        ? 'bg-white/20 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {speed}s
                  </button>
                ))}
              </div>
            </div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-h-[90vh] max-w-[90vw]"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={activeLightboxEntry.imageDataUrl}
                alt={activeLightboxEntry.title}
                className="max-h-[80vh] w-auto rounded-md object-contain"
              />
              <div className="mt-2 text-center text-white">
                <div className="text-sm font-semibold">{activeLightboxEntry.title}</div>
                <div className="text-[11px] text-zinc-400">
                  {lightboxEntries.findIndex(e => e.id === activeLightboxEntry.id) + 1} of {lightboxEntries.length}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editEntry && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-bg)]/80 "
            onClick={() => setEditEntry(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[#18181b] p-5 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Edit Entry</h2>
                <button
                  onClick={() => setEditEntry(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-zinc-500">Title</label>
                  <input
                    type="text"
                    value={editEntry.title}
                    onChange={(e) => setEditEntry({ ...editEntry, title: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-3 py-2 text-sm text-white focus:border-[var(--accent-1)] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-zinc-500">Notes</label>
                  <textarea
                    value={editEntry.note || ''}
                    onChange={(e) => setEditEntry({ ...editEntry, note: e.target.value })}
                    rows={4}
                    className="w-full resize-none rounded-lg border border-white/10 bg-[var(--app-bg)]/20 px-3 py-2 text-sm text-white focus:border-[var(--accent-1)] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-zinc-500">Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {(editEntry.tags ?? []).map((tag, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TAG_COLORS[i % TAG_COLORS.length]}`}
                      >
                        <Tag size={10} />
                        {tag}
                        <button
                          onClick={() => setEditEntry({ 
                            ...editEntry, 
                            tags: (editEntry.tags ?? []).filter(t => t !== tag) 
                          })}
                          className="ml-1 hover:text-white"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setEditEntry(null)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-400 transition hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="rounded-xl bg-[var(--accent-1)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] transition hover:opacity-90"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {replayTarget && (
        <TradeReplayModal
          trade={replayTarget}
          sessions={sessions}
          onClose={() => setReplayTarget(null)}
        />
      )}
    </div>
  );
};

export default JournalView;




