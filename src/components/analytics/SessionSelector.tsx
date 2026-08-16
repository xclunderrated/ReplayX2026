import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Check,
  ChevronDown,
  Layers,
  Search,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Session } from '../../store/useSimulatorStore';
import type { ScopeValue } from './analyticsEngine';
import { formatCompactCurrency, formatCurrency } from './formatters';

interface SessionSelectorProps {
  sessions: Session[];
  currentSessionId: string | null;
  scope: ScopeValue;
  onScopeChange: (scope: ScopeValue) => void;
}

export const SessionSelector: React.FC<SessionSelectorProps> = ({
  sessions,
  currentSessionId,
  scope,
  onScopeChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) ?? null,
    [sessions, currentSessionId]
  );

  const totalTradesAll = useMemo(
    () => sessions.reduce((acc, s) => acc + (s.trades?.filter((t) => t.status === 'closed').length ?? 0), 0),
    [sessions]
  );

  const totalPnlAll = useMemo(
    () => sessions.reduce((acc, s) => {
      const closed = s.trades?.filter((t) => t.status === 'closed') ?? [];
      const sessionPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
      return acc + sessionPnl;
    }, 0),
    [sessions]
  );

  // Close on outside click or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.instrument && s.instrument.toLowerCase().includes(q)) ||
        (s.timeframe && s.timeframe.toLowerCase().includes(q))
    );
  }, [sessions, searchQuery]);

  // Selected session meta
  const selectedMeta = useMemo(() => {
    if (scope === 'all') {
      return {
        title: 'All Sessions',
        subtitle: `${sessions.length} sessions · ${totalTradesAll} trades`,
        badge: 'Aggregate',
        isAll: true,
      };
    }
    if (scope === 'current') {
      return {
        title: currentSession ? currentSession.name : 'Current Session',
        subtitle: currentSession ? `${currentSession.instrument} · ${currentSession.timeframe}` : 'No active session',
        badge: 'Active Now',
        isCurrent: true,
      };
    }
    const found = sessions.find((s) => s.id === scope);
    if (!found) return { title: 'Unknown Session', subtitle: '', badge: '' };
    const closedCount = found.trades?.filter((t) => t.status === 'closed').length ?? 0;
    return {
      title: found.name,
      subtitle: `${found.instrument} · ${found.timeframe} · ${closedCount} trades`,
      badge: found.id === currentSessionId ? 'Active' : undefined,
    };
  }, [scope, sessions, currentSession, currentSessionId, totalTradesAll]);

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition-all hover:border-[var(--border-strong)] hover:bg-[var(--surface-ghost)] focus:outline-none"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--surface-ghost)] text-[var(--accent-1)]">
          {scope === 'all' ? (
            <Layers size={13} strokeWidth={2} />
          ) : scope === 'current' ? (
            <Zap size={13} strokeWidth={2} className="text-[#089981]" />
          ) : (
            <span className="text-[11px] font-mono font-bold">#</span>
          )}
        </div>

        <div className="flex flex-col text-left">
          <span className="text-xs font-bold leading-none text-[var(--text-primary)]">
            {selectedMeta.title}
          </span>
          <span className="mt-1 text-[10px] text-[var(--text-muted)] leading-none">
            {selectedMeta.subtitle}
          </span>
        </div>

        {selectedMeta.badge && (
          <span className="ml-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[var(--surface-ghost)] text-[var(--text-secondary)] border border-[var(--border-soft)]">
            {selectedMeta.badge}
          </span>
        )}

        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`ml-1 text-[var(--text-muted)] transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[var(--text-primary)]' : ''
          }`}
        />
      </button>

      {/* Popover Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 rounded-2xl border border-[var(--border-panel-strong)] bg-[#18191d] p-3 text-[var(--text-primary)] shadow-2xl backdrop-blur-xl"
          >
            {/* Search (if > 3 sessions) */}
            {sessions.length > 3 && (
              <div className="relative mb-2 px-1">
                <Search
                  size={13}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <input
                  type="text"
                  placeholder="Filter sessions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--border-strong)]"
                />
              </div>
            )}

            {/* Quick Aggregates */}
            <div className="space-y-1 pb-2 border-b border-[var(--border-soft)]">
              {/* All Sessions Option */}
              <button
                type="button"
                onClick={() => {
                  onScopeChange('all');
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl p-2.5 text-left transition-all ${
                  scope === 'all'
                    ? 'bg-[var(--surface-ghost)] text-[var(--text-primary)] border border-[var(--border-strong)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-ghost)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-ghost)] text-[var(--accent-1)]">
                    <Layers size={15} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <span>All Sessions</span>
                      <span className="rounded bg-[var(--surface-ghost)] px-1.5 py-0.2 text-[10px] font-mono text-[var(--text-muted)]">
                        {sessions.length}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {totalTradesAll} total closed trades
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-right">
                  <div>
                    <div className={`text-xs font-bold font-mono ${totalPnlAll >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                      {formatCurrency(totalPnlAll)}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">Net P&L</div>
                  </div>
                  {scope === 'all' && <Check size={14} className="text-[var(--accent-1)] ml-1" />}
                </div>
              </button>

              {/* Current Active Session Option */}
              {currentSession && (
                <button
                  type="button"
                  onClick={() => {
                    onScopeChange('current');
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl p-2.5 text-left transition-all ${
                    scope === 'current'
                      ? 'bg-[var(--surface-ghost)] text-[var(--text-primary)] border border-[var(--border-strong)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-ghost)] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#089981]/15 text-[#089981]">
                      <Zap size={15} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <span>Current Session</span>
                        <span className="inline-flex items-center gap-1 rounded bg-[#089981]/15 px-1.5 py-0.2 text-[9px] font-bold text-[#089981]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#089981] animate-pulse" />
                          Live
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate max-w-[140px]">
                        {currentSession.name}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    <div>
                      <div className="text-xs font-bold font-mono text-[var(--text-primary)]">
                        {currentSession.trades?.filter((t) => t.status === 'closed').length ?? 0} trades
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">{currentSession.instrument} · {currentSession.timeframe}</div>
                    </div>
                    {scope === 'current' && <Check size={14} className="text-[var(--accent-1)] ml-1" />}
                  </div>
                </button>
              )}
            </div>

            {/* Individual Sessions List */}
            <div className="pt-2">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center justify-between">
                <span>Specific Sessions ({filteredSessions.length})</span>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5">
                {filteredSessions.map((session) => {
                  const isSelected = scope === session.id;
                  const closed = session.trades?.filter((t) => t.status === 'closed') ?? [];
                  const sessionPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
                  const isCurrent = session.id === currentSessionId;

                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => {
                        onScopeChange(session.id);
                        setIsOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl p-2.5 text-left transition-all ${
                        isSelected
                          ? 'bg-[var(--surface-ghost)] text-[var(--text-primary)] border border-[var(--border-strong)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-ghost)] hover:text-[var(--text-primary)] border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex flex-col min-w-0">
                          <div className="text-xs font-semibold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                            <span className="truncate">{session.name}</span>
                            {isCurrent && (
                              <span className="h-1.5 w-1.5 rounded-full bg-[#089981]" title="Active Session" />
                            )}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {session.instrument} · {session.timeframe} · {closed.length} trades
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-right shrink-0">
                        <div>
                          <div className={`text-xs font-bold font-mono ${sessionPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                            {formatCompactCurrency(sessionPnl)}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono">
                            Bal: {formatCompactCurrency(session.balance ?? session.initialBalance)}
                          </div>
                        </div>
                        {isSelected && <Check size={14} className="text-[var(--accent-1)] ml-1" />}
                      </div>
                    </button>
                  );
                })}

                {filteredSessions.length === 0 && (
                  <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                    No sessions matching &quot;{searchQuery}&quot;
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
