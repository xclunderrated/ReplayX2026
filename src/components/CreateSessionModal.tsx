import React, { useState, useEffect, useMemo } from 'react';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { X, Search, Check, AlertTriangle } from 'lucide-react';
import { fetchInstruments } from '../services/marketdata';
import { getMaxRangeDaysForTimeframe } from '../lib/timeframe';

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface InstrumentOption {
  value: string;
  label: string;
  category: string;
  description: string;
}

const DUKASCOPY_SYMBOLS_FALLBACK: InstrumentOption[] = [
  { value: 'eurusd', label: 'EUR/USD', category: 'Forex', description: 'Euro vs US Dollar' },
  { value: 'gbpusd', label: 'GBP/USD', category: 'Forex', description: 'Great Britain Pound vs US Dollar' },
  { value: 'usdjpy', label: 'USD/JPY', category: 'Forex', description: 'US Dollar vs Japanese Yen' },
  { value: 'audusd', label: 'AUD/USD', category: 'Forex', description: 'Australian Dollar vs US Dollar' },
  { value: 'usdcad', label: 'USD/CAD', category: 'Forex', description: 'US Dollar vs Canadian Dollar' },
  { value: 'usdchf', label: 'USD/CHF', category: 'Forex', description: 'US Dollar vs Swiss Franc' },
  { value: 'nzdusd', label: 'NZD/USD', category: 'Forex', description: 'New Zealand Dollar vs US Dollar' },
  { value: 'eurgbp', label: 'EUR/GBP', category: 'Forex', description: 'Euro vs Great Britain Pound' },
  { value: 'eurjpy', label: 'EUR/JPY', category: 'Forex', description: 'Euro vs Japanese Yen' },
  { value: 'gbpjpy', label: 'GBP/JPY', category: 'Forex', description: 'Great Britain Pound vs Japanese Yen' },
  { value: 'audjpy', label: 'AUD/JPY', category: 'Forex', description: 'Australian Dollar vs Japanese Yen' },
  { value: 'euraud', label: 'EUR/AUD', category: 'Forex', description: 'Euro vs Australian Dollar' },
  { value: 'xauusd', label: 'XAU/USD', category: 'Commodities', description: 'Spot Gold vs US Dollar' },
  { value: 'xagusd', label: 'XAG/USD', category: 'Commodities', description: 'Spot Silver vs US Dollar' },
  { value: 'btcusd', label: 'BTC/USD', category: 'Crypto', description: 'Bitcoin vs US Dollar' },
  { value: 'ethusd', label: 'ETH/USD', category: 'Crypto', description: 'Ethereum vs US Dollar' },
  { value: 'usa30idxusd', label: 'USA30.IDX/USD', category: 'Indices', description: 'Dow Jones Index' },
  { value: 'usatechidxusd', label: 'USATECH.IDX/USD', category: 'Indices', description: 'Nasdaq 100 Index' },
  { value: 'usa500idxusd', label: 'USA500.IDX/USD', category: 'Indices', description: 'S&P 500 Index' },
];

/** Timeframes a new session can start on, mirroring the in-session switcher. */
const SESSION_TIMEFRAMES: { value: string; label: string }[] = [
  { value: 'tick', label: 'Tick' },
  { value: 's5', label: '5s' },
  { value: 's15', label: '15s' },
  { value: 's30', label: '30s' },
  { value: 'm1', label: '1m' },
  { value: 'm5', label: '5m' },
  { value: 'm15', label: '15m' },
  { value: 'm30', label: '30m' },
  { value: 'h1', label: '1H' },
  { value: 'h4', label: '4H' },
  { value: 'd1', label: '1D' },
  { value: 'mn1', label: '1M' },
];

/**
 * Formats a Date as `YYYY-MM-DD` from its *local* calendar fields.
 *
 * `toISOString()` converts to UTC first, which rolls the date backwards for
 * anyone east of Greenwich — local midnight on the 27th is 22:00 on the 26th in
 * London, so the "ends yesterday" default was really ending the day before
 * yesterday. Reading local fields keeps the label meaning what it says.
 */
function formatLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses a `YYYY-MM-DD` field value as local midnight (avoids the UTC shift). */
function parseLocalISODate(text: string): Date | null {
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Whole days between two `YYYY-MM-DD` values, inclusive of the end day. */
function countDaysInclusive(startText: string, endText: string): number | null {
  const start = parseLocalISODate(startText);
  const end = parseLocalISODate(endText);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}


export const CreateSessionModal: React.FC<CreateSessionModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { createSession } = useSimulatorStore();
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('10000');
  const [instrument, setInstrument] = useState('eurusd');
  const [timeframe, setTimeframe] = useState('m15');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [instrumentsList, setInstrumentsList] = useState<InstrumentOption[]>(DUKASCOPY_SYMBOLS_FALLBACK);
  const [isLoadingInstruments, setIsLoadingInstruments] = useState(false);
  const [showSymbolSearch, setShowSymbolSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'All' | 'Forex' | 'Indices' | 'Crypto' | 'Commodities' | 'Stocks'>('All');

  useEffect(() => {
    if (!isOpen) return;

    // Default date window: 30 days ago until yesterday, in the user's local
    // calendar. Both are built from calendar fields rather than by subtracting
    // milliseconds, so a DST transition inside the window cannot shift the
    // resulting day.
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 30);

    if (!startDate) setStartDate(formatLocalISODate(start));
    if (!endDate) setEndDate(formatLocalISODate(end));

    let isMounted = true;
    setIsLoadingInstruments(true);
    fetchInstruments()
      .then((rawList) => {
        if (!isMounted) return;
        if (rawList && rawList.length > 0) {
          const categoryMap: Record<string, string> = {
            forex_major: 'Forex',
            forex_cross: 'Forex',
            forex_exotic: 'Forex',
            commodities: 'Commodities',
            crypto: 'Crypto',
            indices: 'Indices',
            stocks: 'Stocks',
          };
          const mapped: InstrumentOption[] = rawList.map((item) => ({
            value: item.id,
            label: item.symbol,
            category: categoryMap[item.category] || 'Forex',
            description: item.name,
          }));
          setInstrumentsList(mapped);
        }
      })
      .catch((err) => {
        console.warn('Failed to load dynamic Dukascopy instruments list, using fallback', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingInstruments(false);
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const selectedInstrumentObj = useMemo(() => {
    const list = instrumentsList.length > 0 ? instrumentsList : DUKASCOPY_SYMBOLS_FALLBACK;
    return list.find(inst => inst.value === instrument) || { value: instrument, label: instrument.toUpperCase(), category: 'Forex', description: '' };
  }, [instrumentsList, instrument]);

  const filteredInstruments = useMemo(() => {
    const list = instrumentsList.length > 0 ? instrumentsList : DUKASCOPY_SYMBOLS_FALLBACK;
    return list.filter(inst => {
      const matchesTab = selectedTab === 'All' || inst.category === selectedTab;
      const matchesSearch = 
        inst.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inst.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inst.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [instrumentsList, searchQuery, selectedTab]);

  if (!isOpen) return null;

  const resetForm = () => {
    setName('');
    setBalance('10000');
    setInstrument('eurusd');
    setTimeframe('m15');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setSelectedTab('All');
    setShowSymbolSearch(false);
  };

  const parsedBalance = Number.parseFloat(balance);
  let validationError: string | null = null;

  const startTs = parseLocalISODate(startDate)?.getTime();
  const endTs = parseLocalISODate(endDate)?.getTime();

  if (!Number.isFinite(parsedBalance) || parsedBalance <= 0) {
    validationError = 'Enter a valid starting balance greater than zero.';
  } else if (startTs !== undefined && endTs !== undefined && endTs < startTs) {
    validationError = 'End date must be the same day or later than the start date.';
  }

  // Sub-minute timeframes are backed by real tick data, which the server caps
  // per request. The loader narrows the range to the cap rather than failing, so
  // without this the user would get a 30-day session that silently holds 3 days
  // of data. Warn here, at the point where it can still be fixed.
  const maxRangeDays = getMaxRangeDaysForTimeframe(timeframe);
  const selectedDays = countDaysInclusive(startDate, endDate);
  const rangeWarning = (
    Number.isFinite(maxRangeDays) &&
    selectedDays !== null &&
    selectedDays > maxRangeDays
  )
    ? `${timeframe.toUpperCase()} data is limited to ${maxRangeDays} days per request. ` +
      `This ${selectedDays}-day session will load only the most recent ${maxRangeDays} days — ` +
      `shorten the range to match.`
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) return;

    createSession({
      name: name.trim() || 'New Session',
      initialBalance: parsedBalance,
      instrument,
      timeframe,
      startDate,
      endDate,
      timeframePanes: [],
      mtfLayout: 'horizontal'
    });

    resetForm();
    onSuccess();
  };

  const addTime = (type: 'day' | 'week' | 'month') => {
    const start = parseLocalISODate(startDate);
    if (!start) return;

    // Extend the existing end date rather than restarting from the start date,
    // so "+1W" on the default 30-day window grows it to 37 days instead of
    // silently shrinking it back to 7.
    const currentEnd = parseLocalISODate(endDate);
    const base = currentEnd && currentEnd.getTime() >= start.getTime() ? currentEnd : start;
    const date = new Date(base.getTime());

    if (type === 'day') date.setDate(date.getDate() + 1);
    if (type === 'week') date.setDate(date.getDate() + 7);
    if (type === 'month') {
      // setMonth() overflows on short months (Jan 31 + 1 month lands on Mar 3),
      // so clamp the day to the last day of the target month first.
      const targetMonth = date.getMonth() + 1;
      const lastDayOfTargetMonth = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
      date.setDate(Math.min(date.getDate(), lastDayOfTargetMonth));
      date.setMonth(targetMonth);
    }

    setEndDate(formatLocalISODate(date));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-bg)]/80 ">
      <div className="w-full max-w-lg border border-[var(--border-soft)] rounded-2xl bg-[var(--surface-1)] shadow-lg overflow-hidden relative">
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Create Session</h2>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Configure your backtesting session</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">Session Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. EU Scalping Practice"
              className="w-full border border-[var(--border-soft)] rounded-lg bg-[var(--app-bg)] p-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-1)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">Starting Balance</label>
            <div className="relative border border-[var(--border-soft)] rounded-lg bg-[var(--app-bg)] focus-within:border-[var(--accent-1)] transition-colors">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm font-medium">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={balance}
                onChange={e => setBalance(e.target.value)}
                className="w-full bg-transparent p-2.5 pl-7 text-sm text-[var(--text-primary)] outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">Instrument</label>
            <button
              type="button"
              onClick={() => setShowSymbolSearch(true)}
              className="w-full text-left border border-[var(--border-soft)] rounded-lg bg-[var(--app-bg)] p-2.5 text-sm text-[var(--text-primary)] outline-none hover:border-[var(--accent-1)] transition-colors flex items-center justify-between"
            >
              <div className="truncate pr-1">
                <span className="font-semibold uppercase">{selectedInstrumentObj.label}</span>
                {selectedInstrumentObj.description && (
                  <span className="text-[10px] text-[var(--text-muted)] ml-2 truncate hidden sm:inline">
                    ({selectedInstrumentObj.description})
                  </span>
                )}
              </div>
              <span className="text-[var(--accent-1)] text-[10px] font-medium shrink-0">Search</span>
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">Timeframe</label>
            <div className="flex flex-wrap gap-1.5">
              {SESSION_TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  type="button"
                  onClick={() => setTimeframe(tf.value)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    timeframe === tf.value
                      ? 'border-[var(--accent-1)]/40 bg-[var(--accent-1)]/10 text-[var(--accent-1)]'
                      : 'border-[var(--border-soft)] bg-[var(--app-bg)] text-[var(--text-secondary)] hover:border-[var(--accent-1)]/40 hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full appearance-none border border-[var(--border-soft)] rounded-lg bg-[var(--app-bg)] p-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-1)] [color-scheme:dark]"
                required
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">End Date</label>
                <div className="flex gap-1">
                  {(['day', 'week', 'month'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addTime(t)}
                      className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--accent-1)] transition-colors px-1.5 py-0.5 rounded hover:bg-[var(--surface-2)]"
                    >
                      +1{t[0].toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full appearance-none border border-[var(--border-soft)] rounded-lg bg-[var(--app-bg)] p-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-1)] [color-scheme:dark]"
                required
              />
            </div>
          </div>

          {rangeWarning && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
              <p className="text-[11px] font-medium leading-relaxed text-amber-100">{rangeWarning}</p>
            </div>
          )}

          {validationError && (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-[11px] font-medium text-rose-200">
              {validationError}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-[var(--border-soft)] pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={Boolean(validationError)}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] text-[#10b981] hover:bg-[rgba(16,185,129,0.2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Create Session
            </button>
          </div>
        </form>

        {/* Symbol Search Overlay */}
        {showSymbolSearch && (
          <div className="absolute inset-0 z-30 flex flex-col bg-[var(--surface-1)]">
            <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">Select Instrument</h2>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                   {isLoadingInstruments ? 'Loading assets list...' : 'Search assets'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSymbolSearch(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            <div className="px-5 pt-4">
              <div className="relative border border-[var(--border-soft)] rounded-lg bg-[var(--app-bg)] focus-within:border-[var(--accent-1)] transition-colors flex items-center">
                <Search size={16} className="absolute left-3 text-[var(--text-muted)]" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type symbol or name (e.g. eurusd, apple)..."
                  className="w-full bg-transparent p-2.5 pl-10 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="px-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="px-5 py-3 flex gap-1 overflow-x-auto scrollbar-none border-b border-[var(--border-soft)] mt-1.5">
              {(['All', 'Forex', 'Indices', 'Crypto', 'Commodities', 'Stocks'] as const).map((tab) => {
                const count = instrumentsList.length > 0
                  ? (tab === 'All' ? instrumentsList.length : instrumentsList.filter(i => i.category === tab).length)
                  : (tab === 'All' ? DUKASCOPY_SYMBOLS_FALLBACK.length : DUKASCOPY_SYMBOLS_FALLBACK.filter(i => i.category === tab).length);
                
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSelectedTab(tab)}
                    className={`px-3 py-1 rounded-full text-[10px] font-medium transition-all whitespace-nowrap border ${
                      selectedTab === tab
                        ? 'bg-[var(--accent-1)]/10 border-[var(--accent-1)]/30 text-[var(--accent-1)]'
                        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {tab} <span className="opacity-60 ml-0.5">({count})</span>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin">
              {filteredInstruments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                  <span className="text-lg">🔍</span>
                  <p className="text-xs mt-2">No matching symbols found</p>
                </div>
              ) : (
                filteredInstruments.slice(0, 100).map((inst) => (
                  <button
                    key={inst.value}
                    type="button"
                    onClick={() => {
                      setInstrument(inst.value);
                      setShowSymbolSearch(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 px-3.5 rounded-xl border text-left transition-all ${
                      instrument === inst.value
                        ? 'bg-[rgba(16,185,129,0.06)] border-[rgba(16,185,129,0.2)] hover:bg-[rgba(16,185,129,0.09)]'
                        : 'bg-[var(--surface-1)] border-transparent hover:border-[var(--border-soft)] hover:bg-[var(--surface-2)]/60'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)] tracking-wide uppercase">{inst.label}</span>
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-medium uppercase tracking-wider bg-[var(--surface-3)] text-[var(--text-secondary)] shrink-0">
                          {inst.category}
                        </span>
                      </div>
                      {inst.description && (
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate max-w-[95%]">
                          {inst.description}
                        </p>
                      )}
                    </div>
                    {instrument === inst.value && (
                      <Check size={14} className="text-[#10b981] flex-shrink-0 ml-2" />
                    )}
                  </button>
                ))
              )}
              {filteredInstruments.length > 100 && (
                <p className="text-[10px] text-[var(--text-muted)] text-center py-2">
                  Showing top 100 results. Refine search for more.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
