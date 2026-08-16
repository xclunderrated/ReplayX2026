import React, { useState, useEffect, useMemo } from 'react';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { X, Search, Check } from 'lucide-react';
import { fetchInstruments } from '../services/marketdata';

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


export const CreateSessionModal: React.FC<CreateSessionModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { createSession } = useSimulatorStore();
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('10000');
  const [instrument, setInstrument] = useState('eurusd');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [instrumentsList, setInstrumentsList] = useState<InstrumentOption[]>(DUKASCOPY_SYMBOLS_FALLBACK);
  const [isLoadingInstruments, setIsLoadingInstruments] = useState(false);
  const [showSymbolSearch, setShowSymbolSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'All' | 'Forex' | 'Indices' | 'Crypto' | 'Commodities' | 'Stocks'>('All');

  useEffect(() => {
    if (!isOpen) return;

    // Default date window: 30 days ago until yesterday
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const defaultEndStr = end.toISOString().split('T')[0];
    const defaultStartStr = start.toISOString().split('T')[0];

    if (!startDate) setStartDate(defaultStartStr);
    if (!endDate) setEndDate(defaultEndStr);

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
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setSelectedTab('All');
    setShowSymbolSearch(false);
  };

  const parsedBalance = Number.parseFloat(balance);
  let validationError: string | null = null;

  if (!Number.isFinite(parsedBalance) || parsedBalance <= 0) {
    validationError = 'Enter a valid starting balance greater than zero.';
  } else if (startDate && endDate && new Date(endDate).getTime() < new Date(startDate).getTime()) {
    validationError = 'End date must be the same day or later than the start date.';
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) return;

    createSession({
      name: name.trim() || 'New Session',
      initialBalance: parsedBalance,
      instrument,
      timeframe: 'm15',
      startDate,
      endDate,
      timeframePanes: [],
      mtfLayout: 'horizontal'
    });

    resetForm();
    onSuccess();
  };

  const addTime = (type: 'day' | 'week' | 'month') => {
    if (!startDate) return;
    const date = new Date(startDate);
    if (type === 'day') date.setDate(date.getDate() + 1);
    if (type === 'week') date.setDate(date.getDate() + 7);
    if (type === 'month') date.setMonth(date.getMonth() + 1);
    setEndDate(date.toISOString().split('T')[0]);
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
