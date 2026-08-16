import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Newspaper, X, ChevronsLeft, AlertTriangle, Inbox, Filter } from 'lucide-react';
import type { NewsEvent, NewsImpactFilter, NewsView } from '../lib/news';
import { formatTimestampInTimeZone, getTimeZoneLabel, type ChartTimezone } from '../lib/timezone';
import { getImpactColor, matchesNewsImpactFilter } from '../lib/news';
import { useSimulatorStore } from '../store/useSimulatorStore';

interface ChartNewsPanelProps {
  news: NewsEvent[];
  newsView: NewsView;
  chartTimezone: ChartTimezone;
  isLoading: boolean;
  error: string | null;
  onChangeView: (view: NewsView) => void;
  onClose: () => void;
}

const PANEL_WIDTH = 300;

const IMPACT_FILTERS: Array<{ value: NewsImpactFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Med' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'Other' },
];

function ImpactDot({ impact }: { impact: string }) {
  const color = getImpactColor(impact);
  const label = impact.toLowerCase().includes('high') ? 'High impact'
    : impact.toLowerCase().includes('medium') ? 'Medium impact'
    : impact.toLowerCase().includes('low') ? 'Low impact'
    : 'Non-economic';
  return (
    <span
      className="size-1.5 shrink-0 rounded-full"
      style={{ background: color, boxShadow: `0 0 6px ${color}66` }}
      title={label}
    />
  );
}

function StatValue({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <span>
      <span className="font-semibold text-[var(--text-muted)]/70">{label}</span>
      <span className="ml-0.5 text-[var(--text-primary)]">{value}</span>
    </span>
  );
}

function formatEventTime(timestamp: number, timezone: ChartTimezone, showWeekday: boolean) {
  return formatTimestampInTimeZone(timestamp, timezone, {
    weekday: showWeekday ? 'short' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export const ChartNewsPanel: React.FC<ChartNewsPanelProps> = ({
  news,
  newsView,
  chartTimezone,
  isLoading,
  error,
  onChangeView,
  onClose,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const newsImpactFilter = useSimulatorStore((state) => state.newsImpactFilter);
  const setNewsImpactFilter = useSimulatorStore((state) => state.setNewsImpactFilter);

  const visibleNews = useMemo(
    () => news.filter((item) => matchesNewsImpactFilter(item.impact, newsImpactFilter)),
    [news, newsImpactFilter]
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !collapsed) {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [collapsed, onClose]);

  return createPortal(
    collapsed ? (
      <motion.button
        key="news-tab"
        initial={{ x: -16, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'tween', duration: 0.18 }}
        onClick={() => setCollapsed(false)}
        title="Show economic calendar"
        className="fixed top-[64px] right-[52px] z-[100] flex w-9 flex-col items-center gap-1.5 rounded-l-xl border border-r-0 border-[var(--border-soft)] bg-[var(--surface-overlay)] py-3 text-[var(--text-secondary)] shadow-[-6px_0_18px_rgba(0,0,0,0.3)] transition-colors hover:text-[var(--accent-1)] cursor-pointer"
      >
        <Newspaper size={16} strokeWidth={2} />
        <span className="rounded-full bg-[var(--accent-1)] px-1.5 text-[9px] font-bold leading-4 text-[var(--accent-contrast)]">
          {visibleNews.length}
        </span>
      </motion.button>
    ) : (
      <motion.aside
        key="news-drawer"
        initial={{ x: PANEL_WIDTH + 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'tween', duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
        className="fixed top-[52px] right-[124px] bottom-0 z-[100] flex w-[300px] flex-col rounded-l-2xl border border-[var(--border-soft)] bg-[var(--surface-overlay)] shadow-[-12px_0_32px_rgba(0,0,0,0.4)] backdrop-blur-md"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-soft)] px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]">
              <Newspaper size={14} className="text-[var(--accent-1)]" />
              <span className="truncate">Economic Calendar</span>
            </div>
            <div className="mt-0.5 text-[9px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              TZ {getTimeZoneLabel(chartTimezone)}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex rounded-lg border border-[var(--border-soft)] bg-[var(--surface-inset)] p-0.5">
              {(['day', 'week'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => onChangeView(option)}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors cursor-pointer ${
                    newsView === option
                      ? 'bg-[var(--surface-chip)] text-[var(--accent-1)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCollapsed(true)}
              title="Minimize"
              className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              onClick={onClose}
              title="Close"
              className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[#ef4444] cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Impact filter */}
        <div className="flex items-center gap-1.5 border-b border-[var(--border-soft)] px-3 py-1.5">
          <Filter size={11} className="shrink-0 text-[var(--text-muted)]" />
          {IMPACT_FILTERS.map(({ value, label }) => {
            const active = newsImpactFilter === value;
            return (
              <button
                key={value}
                onClick={() => setNewsImpactFilter(value)}
                className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--surface-chip)] text-[var(--accent-1)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span
                  className="size-1 rounded-full"
                  style={{ background: value === 'all' ? 'var(--text-muted)' : getImpactColor(value) }}
                />
                {label}
              </button>
            );
          })}
        </div>

        {/* Column header */}
        <div className="grid grid-cols-[48px_34px_1fr] gap-2 border-b border-[var(--border-soft)] bg-[var(--surface-inset)]/60 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          <span>TIME</span>
          <span>CCY</span>
          <span>EVENT</span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--surface-chip)] [&::-webkit-scrollbar-track]:bg-transparent">
          {isLoading && (
            <div className="flex flex-col items-center gap-2 px-3 py-8">
              <span className="size-4 animate-spin rounded-full border-2 border-[var(--surface-chip)] border-t-[var(--accent-1)]" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Loading calendar…
              </span>
            </div>
          )}

          {!isLoading && error && (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <AlertTriangle size={18} className="text-[#ef4444]" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-[#ef4444]">
                Failed to load news
              </span>
              <span className="px-2 text-[10px] leading-relaxed text-[var(--text-muted)]">{error}</span>
            </div>
          )}

          {!isLoading && !error && visibleNews.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <Inbox size={18} className="text-[var(--text-muted)]" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                No matching events
              </span>
              {newsView === 'day' && (
                <span className="text-[10px] text-[var(--text-muted)]/70">
                  Try switching to the week view
                </span>
              )}
              {newsImpactFilter !== 'all' && (
                <span className="text-[10px] text-[var(--text-muted)]/70">
                  Try a broader impact filter
                </span>
              )}
            </div>
          )}

          {!isLoading && !error && visibleNews.map((item) => (
            <div
              key={item.id}
              className="group flex items-start gap-2 border-b border-[var(--border-soft)]/60 px-3 py-2 transition-colors hover:bg-[var(--surface-ghost)]"
            >
              <div className="grid grid-cols-[48px_34px_1fr] w-full gap-2">
                <div className="flex items-center gap-1.5">
                  <ImpactDot impact={item.impact} />
                  <span className="truncate text-[10px] font-mono text-[var(--text-muted)]">
                    {formatEventTime(item.timestamp, chartTimezone, newsView === 'week')}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-[var(--text-primary)]">{item.currency}</span>
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium leading-snug text-[var(--text-primary)]">
                    {item.event}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[9px] text-[var(--text-muted)]">
                    <StatValue label="A" value={item.actual} />
                    <StatValue label="F" value={item.forecast} />
                    <StatValue label="P" value={item.previous} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          <span>
            {newsImpactFilter === 'all' || visibleNews.length === news.length
              ? `${news.length} events`
              : `${visibleNews.length} of ${news.length} events`}
          </span>
          <span>{newsView === 'day' ? 'Replay day' : 'Replay week'}</span>
        </div>
      </motion.aside>
    ),
    document.body
  );
};

export default ChartNewsPanel;
