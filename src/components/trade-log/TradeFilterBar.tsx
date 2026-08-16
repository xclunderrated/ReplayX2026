import React from 'react';
import { clsx } from 'clsx';
import { TradeFilterOptions } from '../../services/math/tradeMetrics';
import { Strategy } from '../../store/useSimulatorStore';
import {
  Search,
  Filter,
  Layers,
  Sparkles,
  Award,
  AlertTriangle,
  RotateCcw,
  FileSpreadsheet,
  Download,
  Calendar,
  X,
} from 'lucide-react';

interface TradeFilterBarProps {
  filters: TradeFilterOptions;
  setFilters: React.Dispatch<React.SetStateAction<TradeFilterOptions>>;
  sessionsList: { id: string; name: string }[];
  instrumentsList: string[];
  strategies: Strategy[];
  onExportPdf: () => void;
  onExportCsv: () => void;
  totalFilteredCount: number;
  selectedTradesCount: number;
  onExportSelectedPdf?: () => void;
}

const COMMON_MISTAKE_TAGS = [
  'FOMO Entry',
  'Chased Price',
  'Moved Stop Loss',
  'Oversized Position',
  'Early Exit',
  'Counter-Trend',
  'Revenge Trade',
  'Ignored Red News',
];

export default function TradeFilterBar({
  filters,
  setFilters,
  sessionsList,
  instrumentsList,
  strategies,
  onExportPdf,
  onExportCsv,
  totalFilteredCount,
  selectedTradesCount,
  onExportSelectedPdf,
}: TradeFilterBarProps) {
  const handleResetFilters = () => {
    setFilters({
      search: '',
      outcome: 'all',
      direction: 'all',
      sessionId: 'all',
      instrument: 'all',
      strategyId: 'all',
      grade: 'all',
      mistakeTag: 'all',
      startDate: undefined,
      endDate: undefined,
    });
  };

  const hasActiveFilters =
    filters.search !== '' ||
    filters.outcome !== 'all' ||
    filters.direction !== 'all' ||
    filters.sessionId !== 'all' ||
    filters.instrument !== 'all' ||
    filters.strategyId !== 'all' ||
    filters.grade !== 'all' ||
    filters.mistakeTag !== 'all' ||
    Boolean(filters.startDate) ||
    Boolean(filters.endDate);

  return (
    <div className="space-y-3.5 p-4 rounded-2xl bg-[var(--surface-ghost)] border border-[var(--border-soft)] shadow-xs">
      {/* Top Filter Row: Search + Quick Outcome Pills + Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Search Field */}
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search pair, tags, notes..."
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-[var(--app-bg)] border border-[var(--border-soft)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] transition-colors"
          />
          {filters.search && (
            <button
              onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Quick Outcome Pills */}
        <div className="flex items-center gap-1 bg-[var(--app-bg)] p-1 rounded-xl border border-[var(--border-soft)] text-xs">
          {[
            { id: 'all', label: 'All Outcomes' },
            { id: 'win', label: 'Wins Only' },
            { id: 'loss', label: 'Losses Only' },
            { id: 'breakeven', label: 'Break-Even' },
          ].map((item) => {
            const isActive = filters.outcome === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setFilters((prev) => ({ ...prev, outcome: item.id as any }))}
                className={clsx(
                  'px-3 py-1.5 rounded-lg font-medium transition-all text-xs cursor-pointer',
                  isActive
                    ? 'bg-[var(--surface-3)] text-[var(--text-primary)] font-bold shadow-2xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-ghost)]'
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Direction Filter Pills */}
        <div className="flex items-center gap-1 bg-[var(--app-bg)] p-1 rounded-xl border border-[var(--border-soft)] text-xs">
          {[
            { id: 'all', label: 'All Sides' },
            { id: 'buy', label: 'Longs' },
            { id: 'sell', label: 'Shorts' },
          ].map((item) => {
            const isActive = filters.direction === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setFilters((prev) => ({ ...prev, direction: item.id as any }))}
                className={clsx(
                  'px-3 py-1.5 rounded-lg font-medium transition-all text-xs cursor-pointer',
                  isActive
                    ? 'bg-[var(--surface-3)] text-[var(--text-primary)] font-bold shadow-2xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-ghost)]'
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Export & Action Buttons */}
        <div className="flex items-center gap-2 ml-auto">
          {selectedTradesCount > 0 && onExportSelectedPdf && (
            <button
              onClick={onExportSelectedPdf}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors cursor-pointer"
              title="Export Selected Trades to PDF"
            >
              <Download size={14} />
              <span>Export Selected ({selectedTradesCount})</span>
            </button>
          )}

          <button
            onClick={onExportPdf}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--accent-1)] hover:opacity-90 text-white shadow-xs transition-opacity cursor-pointer"
            title="Export full session dossier as PDF"
          >
            <Download size={14} />
            <span>Export Audit PDF</span>
          </button>

          <button
            onClick={onExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[var(--app-bg)] hover:bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border-soft)] transition-colors cursor-pointer"
            title="Export CSV spreadsheet"
          >
            <FileSpreadsheet size={14} />
            <span>CSV</span>
          </button>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Reset all filters"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Secondary Filter Dropdowns */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 text-xs pt-1 border-t border-[var(--border-soft)]">
        {/* Session Dropdown */}
        <div className="relative">
          <select
            value={filters.sessionId}
            onChange={(e) => setFilters((prev) => ({ ...prev, sessionId: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] text-[var(--text-primary)] text-xs font-medium focus:outline-none focus:border-[var(--accent-1)] cursor-pointer"
          >
            <option value="all">All Sessions ({sessionsList.length})</option>
            {sessionsList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Instrument Dropdown */}
        <div className="relative">
          <select
            value={filters.instrument}
            onChange={(e) => setFilters((prev) => ({ ...prev, instrument: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] text-[var(--text-primary)] text-xs font-medium focus:outline-none focus:border-[var(--accent-1)] cursor-pointer"
          >
            <option value="all">All Pairs ({instrumentsList.length})</option>
            {instrumentsList.map((inst) => (
              <option key={inst} value={inst}>
                {inst}
              </option>
            ))}
          </select>
        </div>

        {/* Strategy Dropdown */}
        <div className="relative">
          <select
            value={filters.strategyId}
            onChange={(e) => setFilters((prev) => ({ ...prev, strategyId: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] text-[var(--text-primary)] text-xs font-medium focus:outline-none focus:border-[var(--accent-1)] cursor-pointer"
          >
            <option value="all">All Strategies</option>
            {strategies.map((strat) => (
              <option key={strat.id} value={strat.id}>
                {strat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Execution Grade Dropdown */}
        <div className="relative">
          <select
            value={filters.grade}
            onChange={(e) => setFilters((prev) => ({ ...prev, grade: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] text-[var(--text-primary)] text-xs font-medium focus:outline-none focus:border-[var(--accent-1)] cursor-pointer"
          >
            <option value="all">All Grades</option>
            <option value="A+">Grade A+ (Flawless)</option>
            <option value="A">Grade A (Good)</option>
            <option value="B">Grade B (Average)</option>
            <option value="C">Grade C (Suboptimal)</option>
            <option value="D">Grade D (Poor)</option>
            <option value="F">Grade F (Violated Rules)</option>
            <option value="Ungraded">Ungraded</option>
          </select>
        </div>

        {/* Mistake Tag Dropdown */}
        <div className="relative">
          <select
            value={filters.mistakeTag}
            onChange={(e) => setFilters((prev) => ({ ...prev, mistakeTag: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] text-[var(--text-primary)] text-xs font-medium focus:outline-none focus:border-[var(--accent-1)] cursor-pointer"
          >
            <option value="all">All Mistake Tags</option>
            {COMMON_MISTAKE_TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>

        {/* Filter Count Indicator */}
        <div className="flex items-center justify-end px-2 text-[11px] text-[var(--text-muted)] font-medium">
          Showing <span className="font-bold text-[var(--text-primary)] mx-1">{totalFilteredCount}</span> trades
        </div>
      </div>
    </div>
  );
}
