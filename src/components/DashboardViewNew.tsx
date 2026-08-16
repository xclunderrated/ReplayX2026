import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Plus, Play, Copy, MoreHorizontal, Trash2, CalendarClock } from 'lucide-react';
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border border-[var(--border-soft)] bg-[var(--surface-overlay)] rounded-2xl p-5"
    >
      <p className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{value}</p>
      <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
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
      className="border border-[var(--border-soft)] bg-[var(--surface-overlay)] absolute right-0 top-full z-50 mt-2 min-w-[170px] rounded-xl p-1.5"
    >
      <button
        onClick={handleDuplicate}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
      >
        <Copy size={14} />
        Duplicate
      </button>
      <button
        onClick={handleDelete}
        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] font-medium transition ${confirmingDelete ? 'text-rose-300 hover:bg-rose-500/10' : 'text-[var(--text-secondary)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]'}`}
      >
        <Trash2 size={14} />
        {confirmingDelete ? 'Click to confirm' : 'Delete'}
      </button>
    </motion.div>
  );
}

export const DashboardViewNew: React.FC<{ onSessionSelect: () => void }> = ({ onSessionSelect }) => {
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

  return (
    <div className="relative flex-1 overflow-y-auto px-5 py-5 md:px-8 md:py-7">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Dashboard</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Overview of your backtesting workspace</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="accent-button shadow-none flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition shrink-0"
          >
            <Plus size={18} />
            New Session
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Account Value" value={currency.format(dashboard.totalBalance || 0)} />
          <MetricCard label="Net Result" value={`${dashboard.totalPnl >= 0 ? '+' : ''}${currency.format(dashboard.totalPnl)}`} />
          <MetricCard label="Win Rate" value={`${percent.format(dashboard.winRate)}%`} />
          <MetricCard label="Trade Volume" value={`${dashboard.totalTrades}`} />
        </div>

        <div>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">Sessions</h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {sessions.length === 0
                  ? 'No sessions yet'
                  : `${sessions.length} session${sessions.length !== 1 ? 's' : ''} in workspace`
                }
              </p>
            </div>
            {sessions.length > 0 && (
              <button
                onClick={() => handleSessionClick(sessions[0].id)}
                className="border border-[var(--border-soft)] bg-[var(--surface-overlay)] flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] hover:bg-white/[0.06]"
              >
                <Play size={14} />
                Resume Latest
              </button>
            )}
          </div>

          {sessions.length === 0 ? (
            <div className="border border-[var(--border-soft)] bg-[var(--surface-overlay)] flex min-h-[200px] flex-col items-center justify-center rounded-2xl px-6 py-10 text-center">
              <CalendarClock className="mb-4 text-[var(--text-muted)]" size={30} />
              <h3 className="text-base font-semibold text-[var(--text-primary)]">No sessions yet</h3>
              <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
                Create your first backtest session to get started.
              </p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="accent-button shadow-none mt-5 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition"
              >
                <Plus size={17} />
                New Session
              </button>
            </div>
          ) : (
            <div className="border border-[var(--border-soft)] bg-[var(--surface-overlay)] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="border-b border-[var(--border-soft)] text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                      <th className="px-5 py-3.5 font-medium">Session</th>
                      <th className="px-4 py-3.5 font-medium">Market</th>
                      <th className="px-4 py-3.5 text-right font-medium">Balance</th>
                      <th className="px-4 py-3.5 text-right font-medium">Net P&amp;L</th>
                      <th className="px-4 py-3.5 text-right font-medium">Win Rate</th>
                      <th className="px-4 py-3.5 font-medium">Status</th>
                      <th className="px-4 py-3.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.sessionSummaries.map((session) => (
                      <tr
                        key={session.id}
                        className="group border-b border-[var(--border-soft)]/40 transition hover:bg-white/[0.025] last:border-b-0"
                      >
                        <td
                          onClick={() => handleSessionClick(session.id)}
                          className="cursor-pointer px-5 py-3.5"
                        >
                          <p className="font-semibold text-[var(--text-primary)] transition group-hover:text-[var(--accent-1)]">
                            {session.name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                            {session.trades} trade{session.trades !== 1 ? 's' : ''}
                          </p>
                        </td>
                        <td
                          onClick={() => handleSessionClick(session.id)}
                          className="cursor-pointer px-4 py-3.5"
                        >
                          <span className="text-xs font-medium text-[var(--text-secondary)]">
                            {session.instrument.toUpperCase()} / {session.timeframe.toUpperCase()}
                          </span>
                        </td>
                        <td
                          onClick={() => handleSessionClick(session.id)}
                          className="cursor-pointer px-4 py-3.5 text-right font-mono text-xs text-[var(--text-primary)]"
                        >
                          {currency.format(session.balance)}
                        </td>
                        <td
                          onClick={() => handleSessionClick(session.id)}
                          className={`cursor-pointer px-4 py-3.5 text-right font-mono text-xs font-semibold ${session.netPnl >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}
                        >
                          {session.netPnl >= 0 ? '+' : ''}{currency.format(session.netPnl)}
                        </td>
                        <td
                          onClick={() => handleSessionClick(session.id)}
                          className="cursor-pointer px-4 py-3.5 text-right font-mono text-xs text-[var(--text-secondary)]"
                        >
                          {percent.format(session.winRate)}%
                        </td>
                        <td
                          onClick={() => handleSessionClick(session.id)}
                          className="cursor-pointer px-4 py-3.5"
                        >
                          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                session.activity === 'Live replay'
                                  ? 'bg-[var(--accent-1)]'
                                  : session.activity === 'Loading'
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400'
                              }`}
                            />
                            {session.activity}
                          </span>
                        </td>
                        <td className="relative px-4 py-3.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === session.id ? null : session.id);
                            }}
                            className="opacity-0 group-hover:opacity-40 hover:opacity-100 transition inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.06]"
                            title="Session actions"
                          >
                            <MoreHorizontal size={14} />
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
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

export default DashboardViewNew;
