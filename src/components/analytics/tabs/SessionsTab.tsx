import React, { useEffect, useState } from 'react';
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DataBlock, MiniStat, SectionHeader } from '../AnalyticsPrimitives';
import { formatCompactCurrency, formatCurrency, formatDuration, formatPercent } from '../formatters';
import type { computeAnalytics, buildSessionComparison } from '../analyticsEngine';
import type { Session } from '../../../store/useSimulatorStore';

type Analytics = ReturnType<typeof computeAnalytics>;
const sessionLineColors = ['#94a3b8', '#10b981', '#cbd5e1', '#6b7280', '#ec4899', '#eab308', '#e2e8f0', '#ef4444'];

export const SessionsTab: React.FC<{
  analytics: Analytics;
  filteredSessions: Session[];
  sessionComparison: ReturnType<typeof buildSessionComparison>;
}> = ({ analytics, filteredSessions, sessionComparison }) => {
  const [visibleSessions, setVisibleSessions] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<'netPnl' | 'returnPct' | 'trades' | 'winRate'>('netPnl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    setVisibleSessions(new Set(filteredSessions.map((s) => s.id)));
  }, [filteredSessions]);

  const stats = analytics.sessionDetailedStats;
  const sortedStats = [...stats].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortDir === 'desc' ? -diff : diff;
  });

  const toggleSort = (key: 'netPnl' | 'returnPct' | 'trades' | 'winRate') => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortHeader: React.FC<{ k: 'netPnl' | 'returnPct' | 'trades' | 'winRate'; label: string }> = ({ k, label }) => (
    <th
      className="px-6 py-4 font-semibold text-right cursor-pointer hover:text-[var(--text-primary)] transition-colors select-none"
      onClick={() => toggleSort(k)}
    >
      <div className="flex items-center gap-1 justify-end">
        <span>{label}</span>
        <span className="text-[10px] text-[var(--text-muted)] w-2.5">
          {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : ''}
        </span>
      </div>
    </th>
  );

  return (
    <div className="space-y-10">

      {/* ── Section 1: Session Leaderboard ── */}
      <div className="space-y-6">
        <SectionHeader title="Session Performance Standings" description="All sessions ranked by net P&L" />
        <DataBlock title="Session Leaderboard" subtitle="Click column headers to sort · all sessions ranked" noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px] text-[var(--text-secondary)]">
              <thead className="border-b border-[var(--border-soft)] bg-[var(--surface-ghost)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-6 py-4 font-semibold">Session</th>
                  <SortHeader k="trades" label="Trades" />
                  <SortHeader k="winRate" label="Win Rate" />
                  <th className="px-6 py-4 font-semibold text-right">PF</th>
                  <th className="px-6 py-4 font-semibold text-right">Expectancy</th>
                  <th className="px-6 py-4 font-semibold text-right">Sharpe</th>
                  <th className="px-6 py-4 font-semibold text-right">Max DD</th>
                  <th className="px-6 py-4 font-semibold text-right">Avg Hold</th>
                  <th className="px-6 py-4 font-semibold text-right">Best</th>
                  <th className="px-6 py-4 font-semibold text-right">Worst</th>
                  <SortHeader k="returnPct" label="Return" />
                  <SortHeader k="netPnl" label="Net P&L" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-soft)]">
                {sortedStats.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--surface-ghost)] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-[var(--text-primary)]">{s.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.instrument} · {s.timeframe}</div>
                    </td>
                    <td className="px-6 py-4 text-right text-[var(--text-primary)] font-medium">{s.trades}</td>
                    <td className="px-6 py-4 text-right text-[var(--text-primary)]">{formatPercent(s.winRate)}</td>
                    <td className="px-6 py-4 text-right text-[var(--text-primary)]">{Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}</td>
                    <td className={`px-6 py-4 text-right font-medium ${s.expectancy >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{formatCurrency(s.expectancy)}</td>
                    <td className={`px-6 py-4 text-right ${s.sharpe >= 0 ? 'text-[var(--text-primary)]' : 'text-[#ef4444]'}`}>{s.sharpe.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right text-[#ef4444]">{formatCurrency(s.maxDrawdown)}</td>
                    <td className="px-6 py-4 text-right text-[var(--text-primary)]">{formatDuration(s.avgHoldMs)}</td>
                    <td className="px-6 py-4 text-right text-[#10b981]">{formatCurrency(s.bestTrade)}</td>
                    <td className="px-6 py-4 text-right text-[#ef4444]">{formatCurrency(s.worstTrade)}</td>
                    <td className={`px-6 py-4 text-right font-medium ${s.returnPct >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{formatPercent(s.returnPct)}</td>
                    <td className={`px-6 py-4 text-right font-bold ${s.netPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{formatCurrency(s.netPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataBlock>
      </div>

      {/* ── Section 2: Equity Comparison ── */}
      <div className="space-y-6">
        <SectionHeader title="Comparative Growth Trajectory" description="Toggle sessions to compare equity curves side by side" />
        <DataBlock title="Session Equity Comparison" subtitle="Toggle sessions on/off to compare growth curves">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              {filteredSessions.map((session, index) => {
                const isVisible = visibleSessions.has(session.id);
                const color = sessionLineColors[index % sessionLineColors.length];
                return (
                  <button
                    key={session.id}
                    onClick={() => {
                      setVisibleSessions((prev) => {
                        const next = new Set(prev);
                        if (next.has(session.id)) next.delete(session.id);
                        else next.add(session.id);
                        return next;
                      });
                    }}
                    className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12px] font-semibold transition-all duration-200 ${isVisible ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    style={{ border: `1px solid ${isVisible ? color : 'var(--border-soft)'}`, background: isVisible ? `${color}18` : 'transparent' }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    {session.name}
                  </button>
                );
              })}
            </div>
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sessionComparison} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border-soft)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="trade" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompactCurrency(v)} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--surface-overlay)', borderColor: 'var(--border-strong)', borderRadius: '12px', fontSize: '11px', color: 'var(--text-primary)' }} formatter={(v: number, k: string) => {
                    const session = filteredSessions.find((item) => item.id === k);
                    return [formatCurrency(v), session ? session.name : k];
                  }} labelFormatter={(label) => `Trade #${label}`} />
                  {filteredSessions.map((session, index) => {
                    const isVisible = visibleSessions.has(session.id);
                    const color = sessionLineColors[index % sessionLineColors.length];
                    return (
                      <Line key={session.id} type="monotone" dataKey={session.id} stroke={color} strokeWidth={isVisible ? 2.5 : 1} strokeOpacity={isVisible ? 1 : 0.12} dot={false} isAnimationActive={false} />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </DataBlock>
      </div>

      {/* ── Section 3: Session Stat Cards ── */}
      {stats.length > 0 && (
        <div className="space-y-6">
          <SectionHeader title="Detailed Session Intel" description="Deep-dive per-session performance breakdown" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stats.slice(0, 6).map((s, i) => {
              const color = sessionLineColors[filteredSessions.findIndex((f) => f.id === s.id) % sessionLineColors.length] ?? 'var(--accent-1)';
              return (
                <div key={s.id} className="rounded-2xl p-6 glass-panel transition-all duration-300 hover:shadow-lg hover:shadow-black/10">
                  <div className="flex items-center gap-3 mb-5 border-b border-[var(--border-soft)] pb-3">
                    <div className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
                    <h4 className="text-[14px] font-bold text-[var(--text-primary)]">{s.name}</h4>
                  </div>
                  <div className="space-y-0.5">
                    <MiniStat label="Net P&L" value={formatCurrency(s.netPnl)} colorClass={s.netPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'} />
                    <MiniStat label="Win Rate" value={formatPercent(s.winRate)} />
                    <MiniStat label="Profit Factor" value={Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'} />
                    <MiniStat label="Sharpe" value={s.sharpe.toFixed(2)} colorClass={s.sharpe >= 1 ? 'text-[#10b981]' : 'text-[var(--text-primary)]'} />
                    <MiniStat label="Max Drawdown" value={formatCurrency(s.maxDrawdown)} colorClass="text-[#ef4444]" />
                    <MiniStat label="Win/Loss Streaks" value={`${s.longestWinStreak}W / ${s.longestLossStreak}L`} />
                    <MiniStat label="Payoff Ratio" value={Number.isFinite(s.payoffRatio) ? s.payoffRatio.toFixed(2) : '∞'} />
                    <MiniStat label="Avg Hold" value={formatDuration(s.avgHoldMs)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
