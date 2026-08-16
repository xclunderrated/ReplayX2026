import React, { useCallback, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Brain,
  Clock,
  LayoutDashboard,
  ListChecks,
  Shield,
  Users,
} from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { motion } from 'motion/react';
import { TabBar, type TabItem } from './analytics/AnalyticsPrimitives';
import { SessionSelector } from './analytics/SessionSelector';
import {
  buildSessionComparison,
  computeAnalytics,
  flattenClosedTrades,
  ScopeValue,
  type GradedTrade,
} from './analytics/analyticsEngine';
import { TradeReplayModal } from './analytics/TradeReplayModal';

import { OverviewTab } from './analytics/tabs/OverviewTab';
import { TimingTab } from './analytics/tabs/TimingTab';
import { RiskTab } from './analytics/tabs/RiskTab';
import { TradesTab } from './analytics/tabs/TradesTab';
import { SessionsTab } from './analytics/tabs/SessionsTab';
import { BehaviorTab } from './analytics/tabs/BehaviorTab';
import { SimulationTab } from './analytics/tabs/SimulationTab';

export const AnalyticsView: React.FC = () => {
  const {
    sessions,
    currentSessionId,
    analyticsScope: scope,
    setAnalyticsScope: setScope,
    analyticsActiveTab: activeTab,
    setAnalyticsActiveTab: setActiveTab,
    analyticsTimePreset: timePreset,
    setAnalyticsTimePreset: setTimePreset,
  } = useSimulatorStore();
  const [replayTarget, setReplayTarget] = useState<GradedTrade | null>(null);

  const handleReplayTrade = useCallback((trade: GradedTrade) => {
    setReplayTarget(trade);
  }, []);

  const currentSession = sessions.find((session) => session.id === currentSessionId) ?? null;

  const filteredSessions = useMemo(() => {
    if (scope === 'all') return sessions;
    if (scope === 'current') return currentSession ? [currentSession] : [];
    return sessions.filter((session) => session.id === scope);
  }, [scope, sessions, currentSession]);

  const closedTrades = useMemo(() => flattenClosedTrades(filteredSessions), [filteredSessions]);
  const windowedTrades = useMemo(() => {
    if (timePreset === 'all' || closedTrades.length === 0) {
      return closedTrades;
    }

    const latestClose = closedTrades[closedTrades.length - 1]?.closedAt ?? Date.now();
    const windowMs = timePreset === '7d'
      ? 7 * 24 * 60 * 60 * 1000
      : timePreset === '30d'
        ? 30 * 24 * 60 * 60 * 1000
        : 90 * 24 * 60 * 60 * 1000;
    const fromTs = latestClose - windowMs;
    return closedTrades.filter((trade) => trade.closedAt >= fromTs);
  }, [closedTrades, timePreset]);

  const sessionComparison = useMemo(() => buildSessionComparison(filteredSessions), [filteredSessions]);
  const analytics = useMemo(() => computeAnalytics(windowedTrades, filteredSessions), [windowedTrades, filteredSessions]);

  const tabs: TabItem[] = useMemo(() => [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'risk', label: 'Risk & Drawdown', icon: Shield },
    { id: 'timing', label: 'Timing & Edge', icon: Clock },
    { id: 'trades', label: 'Trade Log', icon: ListChecks, count: analytics.totalTrades },
    { id: 'sessions', label: 'Sessions', icon: Users, count: filteredSessions.length },
    { id: 'simulation', label: 'Simulation', icon: Activity },
    { id: 'behavior', label: 'Behavior & Habits', icon: Brain },
  ], [analytics.totalTrades, filteredSessions.length]);

  const selectedLabel =
    scope === 'all'
      ? 'all sessions'
      : scope === 'current'
        ? currentSession
          ? currentSession.name
          : 'current session'
        : filteredSessions[0]?.name ?? 'selected session';

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-transparent p-10 text-[var(--text-primary)]">
        <div className="border border-[var(--border-soft)] rounded-3xl bg-[var(--surface-1)] max-w-lg p-12 text-center shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] text-[var(--accent-1)]">
            <BarChart3 size={28} strokeWidth={2} />
          </div>
          <h1 className="mt-6 text-xl font-bold tracking-tight text-[var(--text-primary)]">Analytics Unavailable</h1>
          <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">Create simulation sessions and execute/close trades to unlock detailed performance intelligence and behavioral analytics.</p>
        </div>
      </div>
    );
  }

  if (analytics.totalTrades === 0) {
    return (
      <div className="flex-1 overflow-y-auto bg-transparent p-6 sm:p-8 lg:p-10 text-[var(--text-primary)]">
        <div className="mx-auto max-w-[1500px] space-y-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border-soft)] pb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Performance Analytics</h1>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">No closed trades found in the selected scope.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <SessionSelector
                sessions={sessions}
                currentSessionId={currentSessionId}
                scope={scope}
                onScopeChange={setScope}
              />
            </div>
          </div>
          
          <div className="flex min-h-[380px] items-center justify-center border border-dashed border-[var(--border-soft)] rounded-3xl bg-[var(--surface-1)] p-12 text-center">
            <div className="max-w-md">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] text-[var(--accent-1)]">
                <Activity size={28} strokeWidth={2} />
              </div>
              <h2 className="mt-6 text-xl font-bold tracking-tight text-[var(--text-primary)]">No Trade Data Available</h2>
              <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                Complete some trades in your selected session scope to see your win rate, drawdown timeline, and behavioral performance metrics.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.2 }}
      className="flex-1 overflow-y-auto bg-transparent p-6 sm:p-8 lg:p-10 text-[var(--text-primary)]"
    >
      <div className="mx-auto max-w-[1500px] space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border-soft)] pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Performance Analytics</h1>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
              Analyzed <span className="text-[var(--accent-1)] font-bold font-mono">{analytics.totalTrades}</span> closed trades in <span className="text-[var(--text-primary)] font-semibold">{selectedLabel}</span>
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Time Presets */}
            <div className="flex items-center gap-1 border border-[var(--border-soft)] rounded-xl bg-[var(--surface-1)] p-1">
              {(['7d', '30d', '90d', 'all'] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setTimePreset(preset)}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    timePreset === preset 
                      ? 'bg-[var(--surface-ghost)] text-[var(--accent-1)] border border-[var(--border-soft)] shadow-xs' 
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  {preset.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Overhauled Session Selector */}
            <SessionSelector
              sessions={sessions}
              currentSessionId={currentSessionId}
              scope={scope}
              onScopeChange={setScope}
            />
          </div>
        </div>

        {/* Tab Navigation */}
        <div>
          <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* Tab Views */}
        <div className="pt-2">
          {activeTab === 'overview' && <OverviewTab analytics={analytics} />}
          {activeTab === 'risk' && <RiskTab analytics={analytics} />}
          {activeTab === 'timing' && <TimingTab analytics={analytics} />}
          {activeTab === 'trades' && <TradesTab analytics={analytics} onReplayTrade={handleReplayTrade} />}
          {activeTab === 'sessions' && (
            <SessionsTab
              analytics={analytics}
              filteredSessions={filteredSessions}
              sessionComparison={sessionComparison}
            />
          )}
          {activeTab === 'simulation' && <SimulationTab analytics={analytics} />}
          {activeTab === 'behavior' && <BehaviorTab analytics={analytics} />}
        </div>
      </div>

      {replayTarget && (
        <TradeReplayModal
          trade={replayTarget}
          sessions={sessions}
          onClose={() => setReplayTarget(null)}
        />
      )}
    </motion.div>
  );
};
