import React, { useState, useRef, useEffect } from 'react';
import {
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Link,
  Unlink,
  ChevronDown,
  Search,
} from 'lucide-react';
import { useSimulatorStore, type Timeframe } from '../../store/useSimulatorStore';
import type { ChartPaneConfig } from '../../types/multichart';
import { canDeriveTimeframe } from '../../lib/timeframe';

interface ChartPaneHeaderProps {
  pane: ChartPaneConfig;
  isPrimary: boolean;
  isActive: boolean;
  isMaximized: boolean;
  sessionTimeframe: string;
  sessionInstrument: string;
  onSelectTimeframe: (tf: Timeframe) => void;
  onSelectInstrument?: (instrument: string) => void;
  onToggleMaximize: () => void;
  onToggleIndicators: () => void;
  onToggleLink: () => void;
}

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: 'Tick', value: 'tick' },
  { label: '5s', value: 's5' },
  { label: '15s', value: 's15' },
  { label: '30s', value: 's30' },
  { label: '1m', value: 'm1' },
  { label: '5m', value: 'm5' },
  { label: '15m', value: 'm15' },
  { label: '30m', value: 'm30' },
  { label: '1H', value: 'h1' },
  { label: '4H', value: 'h4' },
  { label: '1D', value: 'd1' },
  { label: '1M', value: 'mn1' },
];

const POPULAR_INSTRUMENTS = [
  { id: 'eurusd', symbol: 'EUR/USD', category: 'Forex' },
  { id: 'gbpusd', symbol: 'GBP/USD', category: 'Forex' },
  { id: 'usdjpy', symbol: 'USD/JPY', category: 'Forex' },
  { id: 'audusd', symbol: 'AUD/USD', category: 'Forex' },
  { id: 'usdcad', symbol: 'USD/CAD', category: 'Forex' },
  { id: 'usdchf', symbol: 'USD/CHF', category: 'Forex' },
  { id: 'nzdusd', symbol: 'NZD/USD', category: 'Forex' },
  { id: 'eurgbp', symbol: 'EUR/GBP', category: 'Forex' },
  { id: 'eurjpy', symbol: 'EUR/JPY', category: 'Forex' },
  { id: 'gbpjpy', symbol: 'GBP/JPY', category: 'Forex' },
  { id: 'xauusd', symbol: 'XAU/USD (Gold)', category: 'Commodities' },
  { id: 'xagusd', symbol: 'XAG/USD (Silver)', category: 'Commodities' },
  { id: 'btcusd', symbol: 'BTC/USD', category: 'Crypto' },
  { id: 'ethusd', symbol: 'ETH/USD', category: 'Crypto' },
  { id: 'solusd', symbol: 'SOL/USD', category: 'Crypto' },
  { id: 'usa30idxusd', symbol: 'US30 (Dow)', category: 'Indices' },
  { id: 'usa500idxusd', symbol: 'US500 (S&P)', category: 'Indices' },
  { id: 'usatechidxusd', symbol: 'NAS100 (Nasdaq)', category: 'Indices' },
  { id: 'deuidxeur', symbol: 'GER40 (DAX)', category: 'Indices' },
];

export const ChartPaneHeader: React.FC<ChartPaneHeaderProps> = ({
  pane,
  isPrimary,
  isActive,
  isMaximized,
  sessionTimeframe,
  sessionInstrument,
  onSelectTimeframe,
  onSelectInstrument,
  onToggleMaximize,
  onToggleIndicators,
  onToggleLink,
}) => {
  const [isTfOpen, setIsTfOpen] = useState(false);
  const [isSymbolOpen, setIsSymbolOpen] = useState(false);
  const [searchSymbol, setSearchSymbol] = useState('');

  const tfDropdownRef = useRef<HTMLDivElement>(null);
  const symbolDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tfDropdownRef.current && !tfDropdownRef.current.contains(e.target as Node)) {
        setIsTfOpen(false);
      }
      if (symbolDropdownRef.current && !symbolDropdownRef.current.contains(e.target as Node)) {
        setIsSymbolOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentInstrument = (pane.isLinkedToSessionSymbol ? sessionInstrument : (pane.instrument || sessionInstrument)).toUpperCase();
  const currentTimeframe = pane.timeframe;

  const filteredSymbols = POPULAR_INSTRUMENTS.filter(
    (item) =>
      item.symbol.toLowerCase().includes(searchSymbol.toLowerCase()) ||
      item.id.toLowerCase().includes(searchSymbol.toLowerCase())
  );

  return (
    <div
      className={`absolute top-2 left-2 z-20 flex items-center gap-1 px-1.5 py-1 rounded-md text-[12px] font-medium backdrop-blur-md transition-all select-none ${
        isActive
          ? 'bg-[#131722]/90 text-[#d1d4dc] border border-[#2962ff]/60 shadow-md'
          : 'bg-[#131722]/75 text-[#868993] border border-[#1e222d] hover:bg-[#131722]/90 hover:text-[#d1d4dc]'
      }`}
    >
      {/* Symbol Selector */}
      <div className="relative" ref={symbolDropdownRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!isPrimary) {
              setIsSymbolOpen(!isSymbolOpen);
            }
          }}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
            !isPrimary ? 'hover:bg-[#2a2e39] cursor-pointer' : 'cursor-default'
          }`}
          title={isPrimary ? 'Primary session symbol' : 'Change instrument for this chart'}
        >
          <span className="font-bold text-[#d1d4dc] text-[11px] tracking-tight">
            {currentInstrument}
          </span>
          {!isPrimary && <ChevronDown size={10} className="text-[#868993]" />}
        </button>

        {/* Symbol Selection Popover */}
        {isSymbolOpen && (
          <div className="absolute top-full left-0 mt-1 w-52 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1 z-50 text-[12px]">
            <div className="p-1.5 border-b border-[#2a2e39]">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-[#131722] rounded border border-[#2a2e39]">
                <Search size={11} className="text-[#868993]" />
                <input
                  type="text"
                  placeholder="Search symbol..."
                  value={searchSymbol}
                  onChange={(e) => setSearchSymbol(e.target.value)}
                  className="bg-transparent text-xs text-[#d1d4dc] focus:outline-none w-full"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto p-1 space-y-0.5 custom-scrollbar">
              {filteredSymbols.map((item) => (
                <button
                  key={item.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectInstrument?.(item.id);
                    setIsSymbolOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2 py-1 rounded text-left text-xs transition-colors ${
                    currentInstrument.toLowerCase() === item.id.toLowerCase()
                      ? 'bg-[#2962ff20] text-[#2962ff] font-bold'
                      : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
                  }`}
                >
                  <span>{item.symbol}</span>
                  <span className="text-[10px] text-[#868993]">{item.category}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Symbol Link Toggle */}
      {!isPrimary && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleLink();
          }}
          title={pane.isLinkedToSessionSymbol ? 'Linked to session symbol (Click to unlink)' : 'Independent symbol (Click to link)'}
          className={`p-1 rounded hover:bg-[#2a2e39] transition-colors ${
            pane.isLinkedToSessionSymbol ? 'text-[#2962ff]' : 'text-[#868993]'
          }`}
        >
          {pane.isLinkedToSessionSymbol ? <Link size={12} /> : <Unlink size={12} />}
        </button>
      )}

      <div className="h-3 w-px bg-[#2a2e39] mx-0.5" />

      {/* Timeframe Dropdown */}
      <div className="relative" ref={tfDropdownRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsTfOpen(!isTfOpen);
          }}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#2a2e39] text-[#d1d4dc] font-bold text-[11px] transition-colors"
          title="Change timeframe"
        >
          {currentTimeframe.toUpperCase()}
          <ChevronDown size={10} className="text-[#868993]" />
        </button>

        {isTfOpen && (
          <div className="absolute top-full left-0 mt-1 w-32 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl p-1 z-50 grid grid-cols-2 gap-0.5">
            {TIMEFRAMES.map((tf) => {
              const isSelected = tf.value === currentTimeframe;

              return (
                <button
                  key={tf.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTimeframe(tf.value);
                    setIsTfOpen(false);
                  }}
                  className={`px-2 py-1 text-center rounded text-[11px] font-medium transition-all ${
                    isSelected
                      ? 'bg-[#2962ff] text-white font-bold'
                      : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-3 w-px bg-[#2a2e39] mx-0.5" />

      {/* Indicators toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleIndicators();
        }}
        title={pane.indicatorsEnabled ? 'Hide Indicators' : 'Show Indicators'}
        className={`p-1 rounded hover:bg-[#2a2e39] transition-colors ${
          pane.indicatorsEnabled ? 'text-[#d1d4dc]' : 'text-[#868993] opacity-50'
        }`}
      >
        {pane.indicatorsEnabled ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>

      {/* Solo/Maximize toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleMaximize();
        }}
        title={isMaximized ? 'Restore Grid' : 'Maximize Chart'}
        className={`p-1 rounded hover:bg-[#2a2e39] transition-colors ${
          isMaximized ? 'text-[#2962ff]' : 'text-[#868993]'
        }`}
      >
        {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
      </button>
    </div>
  );
};
