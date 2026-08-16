import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  Award,
  BarChart3,
  DollarSign,
  ShieldAlert,
  Target,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { formatCurrency } from './analytics/formatters';
import { computeAnalytics, flattenClosedTrades, type GradedTrade } from './analytics/analyticsEngine';
import { TradesTab } from './analytics/tabs/TradesTab';
import { TradeReplayModal } from './analytics/TradeReplayModal';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ isOpen, onClose }) => {
  const { currentSessionId, sessions } = useSimulatorStore();
  const session = sessions.find((s) => s.id === currentSessionId);
  const [activeTab, setActiveTab] = useState<'overview' | 'trades'>('overview');
  const [selectedReplayTrade, setSelectedReplayTrade] = useState<GradedTrade | null>(null);

  const closedTrades = useMemo(() => {
    return session ? flattenClosedTrades([session]) : [];
  }, [session]);

  const analytics = useMemo(() => {
    return session ? computeAnalytics(closedTrades, [session]) : null;
  }, [closedTrades, session]);

  if (!isOpen || !session || !analytics) return null;

  const totalTrades = analytics.totalTrades;
  const winRate = analytics.winRate;
  const profitFactor = analytics.profitFactor;
  const totalPnL = analytics.netPnl;
  const grossProfit = analytics.grossProfit;
  const grossLoss = analytics.grossLoss;
  const averageWin = analytics.averageWin;
  const averageLoss = analytics.averageLoss;
  const winLossRatio = averageLoss > 0 ? averageWin / averageLoss : averageWin > 0 ? Infinity : 0;
  
  const longStat = analytics.directionStats.find((d) => d.direction === 'Long') || { winRate: 0, trades: 0, net: 0, avg: 0 };
  const shortStat = analytics.directionStats.find((d) => d.direction === 'Short') || { winRate: 0, trades: 0, net: 0, avg: 0 };
  
  const longWinRate = longStat.winRate;
  const shortWinRate = shortStat.winRate;
  const longTradesCount = longStat.trades;
  const shortTradesCount = shortStat.trades;
  const longWins = Math.round((longWinRate / 100) * longTradesCount);
  const shortWins = Math.round((shortWinRate / 100) * shortTradesCount);
  
  const maxDrawdown = analytics.maxDrawdown;
  const maxDrawdownPercent = analytics.maxDrawdownPct;
  const peakBalance = Math.max(session.initialBalance, ...analytics.equityCurve.map((e) => e.balance));
  const returnPercent = (totalPnL / session.initialBalance) * 100;

  const equityCurve = analytics.equityCurve.map((point, index) => ({
    trade: index,
    balance: point.balance,
    pnl: point.pnl,
    label: point.label || (index === 0 ? 'Start' : `Trade #${index}`),
  }));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 text-[12px]">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 "
          onClick={onClose}
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          className="relative w-full max-w-5xl bg-[var(--surface-1)] border border-[var(--border-strong)] rounded-2xl flex flex-col overflow-hidden max-h-[90vh] shadow-[0_24px_80px_rgba(0,0,0,0.6)] "
        >
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[var(--border-soft)] bg-[var(--surface-ghost)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-1)]/10 border border-[var(--accent-1)]/30 text-[var(--accent-1)]">
                <BarChart3 size={20} strokeWidth={2.5} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[var(--text-primary)]">Session Analytics</h2>
                  <span className="rounded-md border border-[var(--accent-1)]/30 bg-[var(--accent-1)]/10 px-2 py-0.5 text-[10px] font-extrabold text-[var(--accent-1)] uppercase tracking-wider">
                    {session.instrument.toUpperCase()} · {session.timeframe.toUpperCase()}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] font-medium mt-0.5">
                  {session.name} · Initial Balance: {formatCurrency(session.initialBalance)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Tab Selector */}
              <div className="flex items-center gap-1 bg-[var(--app-bg)] border border-[var(--border-soft)] rounded-xl p-1 shadow-inner">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-3.5 py-1.5 text-[11px] font-bold rounded-lg transition-all duration-200 ${
                    activeTab === 'overview'
                      ? 'bg-[var(--accent-1)] text-[var(--accent-contrast)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('trades')}
                  className={`px-3.5 py-1.5 text-[11px] font-bold rounded-lg transition-all duration-200 ${
                    activeTab === 'trades'
                      ? 'bg-[var(--accent-1)] text-[var(--accent-contrast)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Trade Log ({totalTrades})
                </button>
              </div>

              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] text-[var(--text-muted)] hover:text-white hover:bg-[var(--surface-2)] hover:border-[var(--border-strong)] transition-all"
                title="Close Modal (Esc)"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {totalTrades === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] text-[var(--accent-1)] mb-4">
                  <Activity size={24} strokeWidth={2} />
                </div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">No Closed Trades Yet</h3>
                <p className="mt-1 text-[12px] text-[var(--text-muted)] max-w-sm">
                  Execute and close trades in this session to view performance metrics, win rate, drawdown analysis, and interactive trade log.
                </p>
              </div>
            ) : (
              <>
                {activeTab === 'overview' ? (
                  <div className="space-y-6">
                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-3.5 ">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          <span>Net P&L</span>
                          <DollarSign size={14} className={totalPnL >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'} />
                        </div>
                        <div className={`mt-1.5 text-xl font-bold font-mono ${totalPnL >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                          {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
                        </div>
                        <div className="mt-1 text-[10px] text-[var(--text-muted)] font-medium">
                          Return: <span className={returnPercent >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}>{returnPercent >= 0 ? '+' : ''}{returnPercent.toFixed(2)}%</span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-3.5 ">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          <span>Win Rate</span>
                          <Target size={14} className="text-[var(--accent-1)]" />
                        </div>
                        <div className="mt-1.5 text-xl font-bold font-mono text-[var(--text-primary)]">
                          {winRate.toFixed(1)}%
                        </div>
                        <div className="mt-1 text-[10px] text-[var(--text-muted)] font-medium">
                          {analytics.winningTrades.length} W / {analytics.losingTrades.length} L
                        </div>
                      </div>

                      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-3.5 ">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          <span>Profit Factor</span>
                          <Award size={14} className="text-[var(--accent-1)]" />
                        </div>
                        <div className={`mt-1.5 text-xl font-bold font-mono ${profitFactor >= 1.2 ? 'text-[#10b981]' : profitFactor >= 1.0 ? 'text-[var(--text-primary)]' : 'text-[#ef4444]'}`}>
                          {profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}
                        </div>
                        <div className="mt-1 text-[10px] text-[var(--text-muted)] font-medium">
                          Gross Win/Loss Ratio
                        </div>
                      </div>

                      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-3.5 ">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          <span>Max Drawdown</span>
                          <ShieldAlert size={14} className="text-[#ef4444]" />
                        </div>
                        <div className="mt-1.5 text-xl font-bold font-mono text-[#ef4444]">
                          -{maxDrawdownPercent.toFixed(2)}%
                        </div>
                        <div className="mt-1 text-[10px] text-[var(--text-muted)] font-medium">
                          -{formatCurrency(maxDrawdown)} peak to trough
                        </div>
                      </div>
                    </div>

                    {/* Equity Curve Chart */}
                    <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-4 ">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-1)]">
                          Session Equity Growth Trajectory
                        </span>
                        <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                          Peak Equity: <strong className="text-[#10b981]">{formatCurrency(peakBalance)}</strong>
                        </span>
                      </div>

                      <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={equityCurve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="sessionEquityGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={totalPnL >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={totalPnL >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0.0} />
                              </linearGradient>
                            </defs>
                            <XAxis
                              dataKey="label"
                              stroke="var(--text-muted)"
                              fontSize={10}
                              tickLine={false}
                              axisLine={{ stroke: 'var(--border-soft)' }}
                            />
                            <YAxis
                              stroke="var(--text-muted)"
                              fontSize={10}
                              tickLine={false}
                              axisLine={false}
                              domain={['auto', 'auto']}
                              tickFormatter={(val) => `$${val.toLocaleString()}`}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'var(--surface-overlay)',
                                borderColor: 'var(--border-strong)',
                                borderRadius: '12px',
                                fontSize: '11px',
                                color: 'var(--text-primary)',
                              }}
                              formatter={(val: any) => [`$${Number(val).toFixed(2)}`, 'Balance']}
                            />
                            <Area
                              type="monotone"
                              dataKey="balance"
                              stroke={totalPnL >= 0 ? '#10b981' : '#ef4444'}
                              strokeWidth={2.5}
                              fillOpacity={1}
                              fill="url(#sessionEquityGrad)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Detailed Stats Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Financial Metrics */}
                      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-4 space-y-2.5 ">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-1)] border-b border-[var(--border-soft)] pb-2">
                          Gross Profits & Losses
                        </h4>
                        <div className="flex justify-between items-center py-1 border-b border-[var(--border-soft)]/50">
                          <span className="text-[var(--text-muted)]">Gross Profit</span>
                          <span className="font-mono font-bold text-[#10b981]">+{formatCurrency(grossProfit)}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-[var(--border-soft)]/50">
                          <span className="text-[var(--text-muted)]">Gross Loss</span>
                          <span className="font-mono font-bold text-[#ef4444]">-{formatCurrency(grossLoss)}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-[var(--border-soft)]/50">
                          <span className="text-[var(--text-muted)]">Average Win</span>
                          <span className="font-mono font-bold text-[#10b981]">+{formatCurrency(averageWin)}</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                          <span className="text-[var(--text-muted)]">Average Loss</span>
                          <span className="font-mono font-bold text-[#ef4444]">-{formatCurrency(averageLoss)}</span>
                        </div>
                      </div>

                      {/* Directional Performance */}
                      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-4 space-y-2.5 ">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-1)] border-b border-[var(--border-soft)] pb-2">
                          Directional Edge
                        </h4>
                        <div className="flex justify-between items-center py-1 border-b border-[var(--border-soft)]/50">
                          <span className="text-[var(--text-muted)]">Long Trades (Buy)</span>
                          <span className="font-mono font-bold text-[var(--text-primary)]">
                            {longWinRate.toFixed(1)}% ({longWins}/{longTradesCount})
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-[var(--border-soft)]/50">
                          <span className="text-[var(--text-muted)]">Short Trades (Sell)</span>
                          <span className="font-mono font-bold text-[var(--text-primary)]">
                            {shortWinRate.toFixed(1)}% ({shortWins}/{shortTradesCount})
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-[var(--border-soft)]/50">
                          <span className="text-[var(--text-muted)]">Win / Loss Ratio</span>
                          <span className="font-mono font-bold text-[var(--text-primary)]">
                            {winLossRatio === Infinity ? '∞' : winLossRatio.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                          <span className="text-[var(--text-muted)]">Peak Balance</span>
                          <span className="font-mono font-bold text-[#10b981]">{formatCurrency(peakBalance)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Trades Tab with Replay Button */
                  <div className="space-y-4">
                    <TradesTab
                      analytics={analytics}
                      onReplayTrade={(trade) => setSelectedReplayTrade(trade)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>

        {/* Trade Replay Modal Overlay (Doesn't affect Backtest session state) */}
        {selectedReplayTrade && (
          <TradeReplayModal
            trade={selectedReplayTrade}
            sessions={sessions}
            onClose={() => setSelectedReplayTrade(null)}
          />
        )}
      </div>
    </AnimatePresence>
  );
};
