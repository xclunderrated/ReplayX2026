import React, { useMemo, useState, useRef, useEffect } from 'react';
import { BarChart3, CalendarClock, Copy, MoreHorizontal, Play, Plus, Target, Trash2, TrendingUp, WalletCards } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { CreateSessionModal } from './CreateSessionModal';
import { motion, AnimatePresence } from 'motion/react';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function getTimeframeMinutes(tf: string) {
  switch (tf) {
    case 'tick': return 0.016;
    case 's5': return 0.083;
    case 's15': return 0.25;
    case 's30': return 0.5;
    case 'm1': return 1;
    case 'm5': return 5;
    case 'm15': return 15;
    case 'm30': return 30;
    case 'h1': return 60;
    case 'h4': return 240;
    case 'd1': return 1440;
    default: return 15;
  }
}

function formatReplayTime(totalMinutes: number) {
  if (totalMinutes <= 0) return '0m';
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = Math.floor(totalMinutes % 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'neutral', delay = 0 }: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ size?: number }>;
  tone?: 'neutral' | 'positive' | 'warning';
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.36 }}
      className="glass-panel group relative overflow-hidden rounded-3xl p-5"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.35)] to-transparent opacity-70" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">{label}</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)]">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${
          tone === 'positive'
            ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-300'
            : tone === 'warning'
            ? 'border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-primary)]'
            : 'border-white/10 bg-white/[0.055] text-[var(--accent-1)]'
        }`}>
          <Icon size={19} />
        </div>
      </div>
      <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">{detail}</p>
    </motion.div>
  );
}

function SessionActionMenu({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { deleteSession, createSession, sessions } = useSimulatorStore();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleDuplicate = () => {
    const source = sessions.find(s => s.id === sessionId);
    if (!source) return;
    createSession({
      name: `${source.name} (Copy)`,
      initialBalance: source.initialBalance,
      instrument: source.instrument,
      timeframe: source.timeframe,
      startDate: source.startDate,
      endDate: source.endDate,
      timeframePanes: [],
      mtfLayout: 'horizontal',
    });
    onClose();
  };

  const handleDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    deleteSession(sessionId);
    onClose();
  };

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      className="glass-panel absolute right-0 top-full z-50 mt-2 min-w-[178px] rounded-2xl p-1.5"
    >
      <button
        onClick={handleDuplicate}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
      >
        <Copy size={14} />
        Duplicate
      </button>
      <button
        onClick={handleDelete}
        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] font-medium transition ${confirmingDelete ? 'text-rose-300 hover:bg-rose-500/10' : 'text-[var(--text-secondary)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]'}`}
      >
        <Trash2 size={14} />
        {confirmingDelete ? 'Click to confirm' : 'Delete'}
      </button>
    </motion.div>
  );
}

export const DashboardView: React.FC<{ onSessionSelect: () => void }> = ({ onSessionSelect }) => {
  const { sessions, setCurrentSession, setFullScreen } = useSimulatorStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const dashboard = useMemo(() => {
    const totalTrades = sessions.reduce((acc, session) => acc + session.trades.length, 0);
    const closedTrades = sessions.flatMap((session) =>
      session.trades.filter((trade) => trade.status === 'closed')
    );
    const winningTrades = closedTrades.filter((trade) => (trade.pnl ?? 0) > 0);
    const totalClosedTrades = closedTrades.length;
    const winRate = totalClosedTrades > 0 ? (winningTrades.length / totalClosedTrades) * 100 : 0;
    const replayedMinutes = sessions.reduce(
      (acc, session) => acc + session.currentIndex * getTimeframeMinutes(session.timeframe),
      0
    );
    const totalBalance = sessions.reduce((acc, session) => acc + session.balance, 0);
    const totalInitialBalance = sessions.reduce((acc, session) => acc + session.initialBalance, 0);
    const totalPnl = totalBalance - totalInitialBalance;

    const sessionSummaries = sessions.map((session) => {
      const sessionClosedTrades = session.trades.filter((trade) => trade.status === 'closed');
      const netPnl = sessionClosedTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
      const wins = sessionClosedTrades.filter((trade) => (trade.pnl ?? 0) > 0).length;
      return {
        id: session.id,
        name: session.name,
        instrument: session.instrument,
        timeframe: session.timeframe,
        balance: session.balance,
        trades: session.trades.length,
        closedTrades: sessionClosedTrades.length,
        replayedMinutes: session.currentIndex * getTimeframeMinutes(session.timeframe),
        netPnl,
        returnPct: session.initialBalance ? (netPnl / session.initialBalance) * 100 : 0,
        winRate: sessionClosedTrades.length ? (wins / sessionClosedTrades.length) * 100 : 0,
        activity: session.dataState?.isLoading
          ? 'Loading'
          : session.isPlaying
          ? 'Live replay'
          : 'Ready',
      };
    });

    return {
      totalTrades,
      totalClosedTrades,
      winRate,
      replayedMinutes,
      totalBalance,
      totalPnl,
      sessionSummaries,
    };
  }, [sessions]);

  const handleSessionClick = (id: string) => {
    setCurrentSession(id);
    setFullScreen(true);
    onSessionSelect();
  };

  const bestSession = dashboard.sessionSummaries
    .slice()
    .sort((a, b) => b.netPnl - a.netPnl)[0];

  return (
    <div className="relative flex-1 overflow-y-auto px-5 py-5 text-sm text-[var(--text-secondary)] md:px-8 md:py-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42 }}
          className="glass-panel-strong relative overflow-hidden rounded-[32px] p-6 md:p-8"
        >
          <div className="market-line" />
          <div className="relative grid gap-6 lg:grid-cols-[1.45fr_0.9fr] lg:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-1)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-1)]" />
                Backtesting control room
              </div>
              <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-[var(--text-primary)] md:text-5xl">
                Build better trading reps in a cleaner workspace.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                Track sessions, jump back into replay, and read your performance without fighting the interface.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="accent-button flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition"
                >
                  <Plus size={18} />
                  New Session
                </button>
                {sessions.length > 0 && (
                  <button
                    onClick={() => handleSessionClick(sessions[0].id)}
                    className="soft-button flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition"
                  >
                    <Play size={17} />
                    Resume Latest
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Focus</span>
                <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                  {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-white/[0.045] px-4 py-3">
                  <span className="text-[var(--text-muted)]">Best session</span>
                  <span className="max-w-[160px] truncate font-semibold text-[var(--text-primary)]">{bestSession?.name ?? 'No sessions yet'}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/[0.045] px-4 py-3">
                  <span className="text-[var(--text-muted)]">Closed trades</span>
                  <span className="font-semibold text-[var(--text-primary)]">{dashboard.totalClosedTrades}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/[0.045] px-4 py-3">
                  <span className="text-[var(--text-muted)]">Replay time</span>
                  <span className="font-semibold text-[var(--text-primary)]">{formatReplayTime(dashboard.replayedMinutes)}</span>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Account Value" value={currency.format(dashboard.totalBalance || 0)} detail={`${sessions.length} active session${sessions.length === 1 ? '' : 's'} in the workspace`} icon={WalletCards} delay={0.03} />
          <MetricCard label="Net Result" value={`${dashboard.totalPnl >= 0 ? '+' : ''}${currency.format(dashboard.totalPnl)}`} detail="Combined closed and running account movement" icon={TrendingUp} tone={dashboard.totalPnl >= 0 ? 'positive' : 'neutral'} delay={0.08} />
          <MetricCard label="Win Rate" value={`${percent.format(dashboard.winRate)}%`} detail={`${dashboard.totalClosedTrades} closed trade${dashboard.totalClosedTrades === 1 ? '' : 's'} measured`} icon={Target} delay={0.13} />
          <MetricCard label="Trade Volume" value={`${dashboard.totalTrades}`} detail={`${formatReplayTime(dashboard.replayedMinutes)} of historical replay`} icon={BarChart3} tone="warning" delay={0.18} />
        </section>

        <section className="glass-panel-strong overflow-hidden rounded-[28px]">
          <div className="flex flex-col gap-3 border-b border-[var(--border-soft)] px-5 py-5 md:flex-row md:items-center md:justify-between md:px-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Sessions</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Pick up a replay, duplicate a setup, or start fresh.</p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="soft-button flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition"
            >
              <Plus size={16} />
              Create
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-10 text-center">
              <CalendarClock className="mb-4 text-[var(--accent-1)]" size={34} />
              <h3 className="text-lg font-bold text-[var(--text-primary)]">No sessions yet</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">Create your first backtest session and AuraEngine will keep the chart, journal, and performance stats connected.</p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="accent-button mt-5 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition"
              >
                <Plus size={17} />
                New Session
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left">
                <thead>
                  <tr className="border-b border-[var(--border-soft)] text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    <th className="px-6 py-3 font-bold">Session</th>
                    <th className="px-4 py-3 font-bold">Market</th>
                    <th className="px-4 py-3 text-right font-bold">Balance</th>
                    <th className="px-4 py-3 text-right font-bold">Net P&amp;L</th>
                    <th className="px-4 py-3 text-right font-bold">Win Rate</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {dashboard.sessionSummaries.map((session, index) => (
                    <motion.tr
                      key={session.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.035, duration: 0.28 }}
                      className="group border-b border-[var(--border-soft)]/70 transition hover:bg-white/[0.045]"
                    >
                      <td onClick={() => handleSessionClick(session.id)} className="cursor-pointer px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--accent-1)]">
                            <ChartIconLabel value={index + 1} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-bold text-[var(--text-primary)] transition group-hover:text-[var(--accent-1)]">{session.name}</p>
                            <p className="mt-1 text-[11px] text-[var(--text-muted)]">{session.trades} trades</p>
                          </div>
                        </div>
                      </td>
                      <td onClick={() => handleSessionClick(session.id)} className="cursor-pointer px-4 py-4">
                        <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                          {session.instrument.toUpperCase()} / {session.timeframe.toUpperCase()}
                        </span>
                      </td>
                      <td onClick={() => handleSessionClick(session.id)} className="cursor-pointer px-4 py-4 text-right font-mono text-xs text-[var(--text-primary)]">{currency.format(session.balance)}</td>
                      <td onClick={() => handleSessionClick(session.id)} className={`cursor-pointer px-4 py-4 text-right font-mono text-xs font-bold ${session.netPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {session.netPnl >= 0 ? '+' : ''}{currency.format(session.netPnl)}
                      </td>
                      <td onClick={() => handleSessionClick(session.id)} className="cursor-pointer px-4 py-4 text-right font-mono text-xs text-[var(--text-secondary)]">{percent.format(session.winRate)}%</td>
                      <td onClick={() => handleSessionClick(session.id)} className="cursor-pointer px-4 py-4">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold ${
                          session.activity === 'Live replay'
                            ? 'bg-white/10 text-[var(--text-secondary)]'
                            : session.activity === 'Loading'
                            ? 'bg-amber-300/10 text-amber-200'
                            : 'bg-emerald-300/10 text-emerald-200'
                        }`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {session.activity}
                        </span>
                      </td>
                      <td className="relative px-4 py-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === session.id ? null : session.id);
                          }}
                          className="soft-button inline-flex h-9 w-9 items-center justify-center rounded-xl opacity-0 transition group-hover:opacity-100"
                          title="Session actions"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        <AnimatePresence>
                          {activeMenuId === session.id && (
                            <SessionActionMenu
                              sessionId={session.id}
                              onClose={() => setActiveMenuId(null)}
                            />
                          )}
                        </AnimatePresence>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {isModalOpen && (
        <CreateSessionModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            onSessionSelect();
          }}
        />
      )}
    </div>
  );
};

function ChartIconLabel({ value }: { value: number }) {
  return <span className="font-mono text-[11px] font-bold">{String(value).padStart(2, '0')}</span>;
}

export default DashboardView;
