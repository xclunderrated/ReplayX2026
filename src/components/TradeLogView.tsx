import React, { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { useSimulatorStore } from '../store/useSimulatorStore';
import {
  getAllEnrichedTrades,
  filterTrades,
  calculateTradeMetrics,
  TradeFilterOptions,
  EnrichedTrade,
} from '../services/math/tradeMetrics';
import {
  generateSingleTradePdf,
  generateMultiTradeAuditPdf,
} from '../services/pdfExportService';
import TradeKpiBar from './trade-log/TradeKpiBar';
import TradeFilterBar from './trade-log/TradeFilterBar';
import TradeTable from './trade-log/TradeTable';
import TradeCardGrid from './trade-log/TradeCardGrid';
import TradeDetailDrawer from './trade-log/TradeDetailDrawer';
import TradeReplayStudio from './trade-replay/TradeReplayStudio';
import {
  ListFilter,
  LayoutGrid,
  List,
  RotateCcw,
  Sparkles,
  Layers,
  Play,
  Download,
} from 'lucide-react';

interface TradeLogViewProps {
  initialTradeToReplay?: EnrichedTrade | null;
}

export default function TradeLogView({ initialTradeToReplay }: TradeLogViewProps) {
  const sessions = useSimulatorStore((s) => s.sessions);
  const archivedSessions = useSimulatorStore((s) => s.archivedSessions);
  const strategies = useSimulatorStore((s) => s.strategies);
  const storeActiveTab = useSimulatorStore((s) => s.tradeLogActiveTab);
  const setStoreActiveTab = useSimulatorStore((s) => s.setTradeLogActiveTab);
  const viewMode = useSimulatorStore((s) => s.tradeLogViewMode);
  const setViewMode = useSimulatorStore((s) => s.setTradeLogViewMode);

  // Active view tab: 'log' | 'replay'
  const activeTab = initialTradeToReplay ? 'replay' : storeActiveTab;
  const setActiveTab = (tab: 'log' | 'replay') => setStoreActiveTab(tab);
  const [activeReplayTrade, setActiveReplayTrade] = useState<EnrichedTrade | null>(initialTradeToReplay || null);
  const [inspectedTrade, setInspectedTrade] = useState<EnrichedTrade | null>(null);

  // Selected trade IDs for batch export
  const [selectedTradeIds, setSelectedTradeIds] = useState<Set<string>>(new Set());

  // Filter options
  const [filters, setFilters] = useState<TradeFilterOptions>({
    search: '',
    outcome: 'all',
    direction: 'all',
    sessionId: 'all',
    instrument: 'all',
    strategyId: 'all',
    grade: 'all',
    mistakeTag: 'all',
  });

  // Extract all enriched trades from all sessions with 100% verified math
  const allTrades = useMemo(() => {
    return getAllEnrichedTrades(sessions, archivedSessions);
  }, [sessions, archivedSessions]);

  // Extract unique sessions and instruments lists for filter dropdowns
  const sessionsList = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    const seen = new Set<string>();

    sessions.forEach((s) => {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        list.push({ id: s.id, name: s.name || `Session ${s.id.slice(0, 5)}` });
      }
    });

    (archivedSessions || []).forEach((a) => {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        list.push({ id: a.id, name: `${a.name} (Archived)` });
      }
    });

    return list;
  }, [sessions, archivedSessions]);

  const instrumentsList = useMemo(() => {
    const set = new Set<string>();
    allTrades.forEach((t) => set.add(t.instrument.toUpperCase()));
    return Array.from(set).sort();
  }, [allTrades]);

  // Filtered trades
  const filteredTrades = useMemo(() => {
    return filterTrades(allTrades, filters);
  }, [allTrades, filters]);

  // Exact KPI Summary Metrics
  const metrics = useMemo(() => {
    return calculateTradeMetrics(filteredTrades);
  }, [filteredTrades]);

  // Checkbox selection handlers
  const handleToggleSelectTrade = (id: string) => {
    setSelectedTradeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedTradeIds.size === filteredTrades.length) {
      setSelectedTradeIds(new Set());
    } else {
      setSelectedTradeIds(new Set(filteredTrades.map((t) => t.id)));
    }
  };

  // Replay handlers
  const handleReplayTrade = (trade: EnrichedTrade) => {
    setActiveReplayTrade(trade);
    setActiveTab('replay');
  };

  const handleBackToLog = () => {
    setActiveTab('log');
  };

  // Export handlers
  const handleExportAuditPdf = () => {
    const sessionName = filters.sessionId !== 'all'
      ? sessionsList.find((s) => s.id === filters.sessionId)?.name || 'Filtered Session'
      : 'All Sessions Backtest Dossier';
    generateMultiTradeAuditPdf({
      trades: filteredTrades,
      metrics,
      sessionTitle: sessionName,
    });
  };

  const handleExportSelectedPdf = () => {
    const selectedList = filteredTrades.filter((t) => selectedTradeIds.has(t.id));
    if (selectedList.length === 0) return;
    const subMetrics = calculateTradeMetrics(selectedList);
    generateMultiTradeAuditPdf({
      trades: selectedList,
      metrics: subMetrics,
      sessionTitle: `Selected Portfolio Batch (${selectedList.length} Trades)`,
    });
  };

  const handleExportSinglePdf = (trade: EnrichedTrade, chartBase64?: string | null) => {
    const strat = strategies.find((s) => s.id === trade.strategyId) || strategies[0];
    const checklistItems = strat
      ? strat.checklists.map((c) => ({
          text: c.text,
          hit: (trade.checklistHits || []).includes(c.id),
        }))
      : [];

    generateSingleTradePdf({
      trade,
      chartImageBase64: chartBase64,
      strategyName: strat?.name || 'Default Strategy Model',
      checklistItems,
    });
  };

  const handleExportCsv = () => {
    const headers = [
      'Trade ID',
      'Session',
      'Instrument',
      'Direction',
      'Timeframe',
      'Entry Time',
      'Exit Time',
      'Entry Price',
      'Exit Price',
      'Stop Loss',
      'Take Profit',
      'Lots',
      'Pip Gain',
      'Risk Dollar',
      'Realized PnL',
      'Return R',
      'MAE Dollar',
      'MFE Dollar',
      'Grade',
      'Mistake Tag',
      'Notes',
    ];

    const rows = filteredTrades.map((t) => [
      `"${t.id}"`,
      `"${t.sessionName}"`,
      `"${t.instrument}"`,
      `"${t.type.toUpperCase()}"`,
      `"${t.timeframe.toUpperCase()}"`,
      `"${t.entryTime ? new Date(t.entryTime).toISOString() : ''}"`,
      `"${t.exitTime ? new Date(t.exitTime).toISOString() : ''}"`,
      t.entryPrice || 0,
      t.exitPrice || 0,
      t.sl || '',
      t.tp || '',
      t.size,
      t.pipGain,
      t.riskAmountDollar.toFixed(2),
      Number(t.pnl || 0).toFixed(2),
      t.calculatedRMultiple,
      t.maeDollar.toFixed(2),
      t.mfeDollar.toFixed(2),
      `"${t.grade || ''}"`,
      `"${t.mistakeTag || ''}"`,
      `"${(t.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ReplayX_Trade_Log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // If in Replay Studio View
  if (activeTab === 'replay' && activeReplayTrade) {
    const liveTrade = allTrades.find((t) => t.id === activeReplayTrade.id) || activeReplayTrade;
    return (
      <TradeReplayStudio
        trade={liveTrade}
        onBackToLog={handleBackToLog}
        onExportPdf={handleExportSinglePdf}
        strategies={strategies}
      />
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[var(--app-bg)] overflow-hidden select-none">
      {/* Top Header Bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-soft)] bg-[var(--surface-ghost)] px-6">
        {/* Title & Count */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-1)]/10 text-[var(--accent-1)] border border-[var(--accent-1)]/20 shadow-xs">
            <ListFilter size={17} />
          </div>
          <div>
            <h1 className="text-base font-bold text-[var(--text-primary)]">Trade Log & Replay Hub</h1>
            <div className="text-[11px] text-[var(--text-muted)] font-medium">
              {allTrades.length} total closed trades across active & archived sessions
            </div>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-[var(--app-bg)] p-1 rounded-xl border border-[var(--border-soft)]">
          <button
            onClick={() => setViewMode('table')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
              viewMode === 'table'
                ? 'bg-[var(--surface-2)] text-[var(--text-primary)] shadow-2xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
            title="Dense Table View"
          >
            <List size={14} />
            <span>Table</span>
          </button>

          <button
            onClick={() => setViewMode('grid')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
              viewMode === 'grid'
                ? 'bg-[var(--surface-2)] text-[var(--text-primary)] shadow-2xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
            title="Visual Card Grid View"
          >
            <LayoutGrid size={14} />
            <span>Cards</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
        {/* 1. Live Mathematical KPI Summary Strip */}
        <TradeKpiBar metrics={metrics} />

        {/* 2. Search, Preset Pills & Dropdown Filters */}
        <TradeFilterBar
          filters={filters}
          setFilters={setFilters}
          sessionsList={sessionsList}
          instrumentsList={instrumentsList}
          strategies={strategies}
          onExportPdf={handleExportAuditPdf}
          onExportCsv={handleExportCsv}
          totalFilteredCount={filteredTrades.length}
          selectedTradesCount={selectedTradeIds.size}
          onExportSelectedPdf={handleExportSelectedPdf}
        />

        {/* 3. The Trade Ledger (Table or Card Grid) */}
        {viewMode === 'table' ? (
          <TradeTable
            trades={filteredTrades}
            selectedTradeIds={selectedTradeIds}
            onToggleSelectTrade={handleToggleSelectTrade}
            onToggleSelectAll={handleToggleSelectAll}
            onReplayTrade={handleReplayTrade}
            onInspectTrade={(t) => setInspectedTrade(t)}
            onExportSinglePdf={(t) => handleExportSinglePdf(t)}
          />
        ) : (
          <TradeCardGrid
            trades={filteredTrades}
            selectedTradeIds={selectedTradeIds}
            onToggleSelectTrade={handleToggleSelectTrade}
            onReplayTrade={handleReplayTrade}
            onInspectTrade={(t) => setInspectedTrade(t)}
            onExportSinglePdf={(t) => handleExportSinglePdf(t)}
          />
        )}
      </div>

      {/* Slide-out Trade Inspector Drawer */}
      <TradeDetailDrawer
        trade={inspectedTrade}
        onClose={() => setInspectedTrade(null)}
        onReplay={handleReplayTrade}
        onExportPdf={(t) => handleExportSinglePdf(t)}
        strategies={strategies}
      />
    </div>
  );
}
