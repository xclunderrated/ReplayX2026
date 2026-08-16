import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DataBlock, HeatmapCell, MiniStat, SectionHeader } from '../AnalyticsPrimitives';
import { formatCompactCurrency, formatCurrency, formatPercent } from '../formatters';
import type { computeAnalytics } from '../analyticsEngine';

type Analytics = ReturnType<typeof computeAnalytics>;

export const TimingTab: React.FC<{ analytics: Analytics }> = ({ analytics }) => {
  const maxHourlyPnl = Math.max(1, ...analytics.hourlySlots.map((s) => Math.abs(s.netPnl)));

  return (
    <div className="space-y-10">

      {/* ── Section 1: Best & Worst Hours ── */}
      <div className="space-y-6">
        <SectionHeader title="Hourly Performance Highlights" description="Your strongest and weakest hours of the trading day" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DataBlock title="Best Trading Hours" subtitle="Top 3 hours by net P&L">
            <div className="space-y-3">
              {analytics.bestHours.map((h, i) => (
                <div key={h.hour} className="flex items-center gap-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10b981]/15 border border-[#10b981]/30">
                    <span className="text-[15px] font-bold text-[#10b981]">#{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-semibold text-[var(--text-primary)]">{h.label}</span>
                      <span className="text-[14px] font-bold text-[#10b981]">{formatCurrency(h.netPnl)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--text-muted)]">
                      <span>{h.trades} trades</span>
                      <span>·</span>
                      <span>WR {formatPercent(h.winRate)}</span>
                      <span>·</span>
                      <span>Avg {formatCurrency(h.avgPnl)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {analytics.bestHours.length === 0 && (
                <p className="text-[12px] text-[var(--text-muted)] py-4 text-center">Not enough data yet</p>
              )}
            </div>
          </DataBlock>

          <DataBlock title="Worst Trading Hours" subtitle="Bottom 3 hours by net P&L">
            <div className="space-y-3">
              {analytics.worstHours.map((h, i) => (
                <div key={h.hour} className="flex items-center gap-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ef4444]/15 border border-[#ef4444]/30">
                    <span className="text-[15px] font-bold text-[#ef4444]">#{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-semibold text-[var(--text-primary)]">{h.label}</span>
                      <span className="text-[14px] font-bold text-[#ef4444]">{formatCurrency(h.netPnl)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--text-muted)]">
                      <span>{h.trades} trades</span>
                      <span>·</span>
                      <span>WR {formatPercent(h.winRate)}</span>
                      <span>·</span>
                      <span>Avg {formatCurrency(h.avgPnl)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {analytics.worstHours.length === 0 && (
                <p className="text-[12px] text-[var(--text-muted)] py-4 text-center">Not enough data yet</p>
              )}
            </div>
          </DataBlock>
        </div>
      </div>

      {/* ── Section 2: Intraday Patterns ── */}
      <div className="space-y-5">
        <SectionHeader title="Intraday Patterns" description="Profitability patterns across different hours of the day" />

        <DataBlock title="Hourly P&L Heatmap" subtitle="Net profitability by hour of entry (local time)">
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
            {analytics.hourlySlots.map((slot) => (
              <HeatmapCell
                key={slot.hour}
                value={slot.netPnl}
                maxAbs={maxHourlyPnl}
                label={slot.label}
                sublabel={slot.trades > 0 ? `${slot.trades}t` : '—'}
              />
            ))}
          </div>
          <div className="flex items-center justify-center gap-8 mt-5 text-[10px] text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(244,63,94,0.5)' }} />
              <span>Loss</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--surface-ghost)', border: '1px solid var(--border-soft)' }} />
              <span>No data</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(16,185,129,0.5)' }} />
              <span>Profit</span>
            </div>
          </div>
        </DataBlock>

        <DataBlock title="Entry Hour Analysis" subtitle="Trade count vs win rate by hour of entry">
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analytics.timingByHour} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-soft)" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" interval={2} stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(0)}%`} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--surface-overlay)', borderColor: 'var(--border-strong)', borderRadius: '12px', fontSize: '11px', color: 'var(--text-primary)' }} formatter={(v: number, k: string) => {
                  if (k === 'trades') return [`${v}`, 'Trades'];
                  if (k === 'winRate') return [formatPercent(v), 'Win Rate'];
                  return [formatCurrency(v), 'P&L'];
                }} />
                <Bar yAxisId="left" dataKey="trades" fill="var(--accent-1)" radius={[4, 4, 0, 0]} fillOpacity={0.65} />
                <Line yAxisId="right" type="monotone" dataKey="winRate" stroke="#10b981" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </DataBlock>
      </div>

      {/* ── Section 3: Weekday Edge ── */}
      <div className="space-y-6">
        <SectionHeader title="Weekday & Session Edge" description="Performance by day of the week and market session" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DataBlock title="Day-of-Week Edge" subtitle="Net P&L and win rate by closing day">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={analytics.dayOfWeekEdge} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border-soft)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--surface-overlay)', borderColor: 'var(--border-strong)', borderRadius: '12px', fontSize: '11px', color: 'var(--text-primary)' }} formatter={(v: number, k: string) => [k === 'winRate' ? formatPercent(v) : k === 'net' ? formatCurrency(v) : `${v}`, k]} />
                  <Bar yAxisId="left" dataKey="net" fill="var(--accent-1)" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" dataKey="winRate" stroke="#10b981" dot={false} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </DataBlock>

          <DataBlock title="Session Regime Split" subtitle="Performance by market session">
            <div className="space-y-3">
              {analytics.regimeSplit.map((row) => (
                <div key={row.key} className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">{row.label}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{row.trades} trades</span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[12px]">
                    <span className={row.net >= 0 ? 'text-[#10b981] font-semibold' : 'text-[#ef4444] font-semibold'}>{formatCurrency(row.net)}</span>
                    <div className="flex items-center gap-4 text-[var(--text-muted)]">
                      <span>WR {formatPercent(row.winRate)}</span>
                      <span>Avg {formatCurrency(row.avgPnl)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DataBlock>
        </div>
      </div>

      {/* ── Section 4: Monthly Seasonality ── */}
      <div className="space-y-6">
        <SectionHeader title="Seasonality" description="Profitability by month and weekday of trade close" />
        <DataBlock title="Monthly Seasonality Heatmap" subtitle="Net P&L by month × weekday">
          <div className="overflow-x-auto">
            <div className="min-w-[720px] grid grid-cols-[70px_repeat(12,1fr)] gap-1.5">
              {Array.from({ length: 12 }, (_, m) => (
                <div key={m} className="text-center text-[10px] font-bold uppercase text-[var(--text-muted)]">
                  {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m]}
                </div>
              ))}
              <div />
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((weekday, w) => (
                <div key={weekday} className="contents">
                  <div className="flex items-center justify-end pr-1 text-[10px] font-semibold text-[var(--text-muted)]">{weekday}</div>
                  {Array.from({ length: 12 }, (_, m) => {
                    const cell = analytics.seasonalityHeatmap.find((c) => c.weekdayIndex === w && c.monthIndex === m);
                    if (!cell || cell.trades === 0) {
                      return <div key={m} className="flex h-9 items-center justify-center rounded-lg border border-[var(--border-soft)] bg-[var(--surface-ghost)] text-[9px] text-[var(--text-muted)]">·</div>;
                    }
                    const intensity = Math.min(Math.abs(cell.net) / Math.max(Math.abs(analytics.monthlyPerformance.reduce((acc, p) => acc + p.pnl, 0)) / 4, 1), 1);
                    const bg = cell.net >= 0
                      ? `rgba(16,185,129,${0.08 + intensity * 0.5})`
                      : `rgba(244,63,94,${0.08 + intensity * 0.5})`;
                    return (
                      <div key={m} className="flex h-9 flex-col items-center justify-center rounded-lg border border-[var(--border-soft)]" style={{ background: bg }} title={`${cell.month} ${cell.weekday} — ${cell.trades} trades, ${formatCurrency(cell.net)}`}>
                        <span className={`text-[10px] font-bold ${cell.net >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{formatCompactCurrency(cell.net)}</span>
                        <span className="text-[8px] text-[var(--text-muted)]">{cell.trades}t</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center gap-8 mt-5 text-[10px] text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(244,63,94,0.5)' }} />
              <span>Loss</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--surface-ghost)', border: '1px solid var(--border-soft)' }} />
              <span>No trades</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(16,185,129,0.5)' }} />
              <span>Profit</span>
            </div>
          </div>
        </DataBlock>
      </div>

      {/* ── Section 5: Hourly Breakdown Table ── */}
      <div className="space-y-6">
        <SectionHeader title="Hourly Breakdown" description="Detailed statistics per trading hour" />
        <DataBlock title="Full Hourly Stats Table" subtitle="All hours with trading activity" noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px] text-[var(--text-secondary)]">
              <thead className="border-b border-[var(--border-soft)] bg-[var(--surface-ghost)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-6 py-4 font-semibold">Hour</th>
                  <th className="px-6 py-4 font-semibold text-right">Trades</th>
                  <th className="px-6 py-4 font-semibold text-right">Win Rate</th>
                  <th className="px-6 py-4 font-semibold text-right">Avg P&L</th>
                  <th className="px-6 py-4 font-semibold text-right">Net P&L</th>
                  <th className="px-6 py-4 font-semibold text-right">Best</th>
                  <th className="px-6 py-4 font-semibold text-right">Worst</th>
                  <th className="px-6 py-4 font-semibold text-right">PF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-soft)]">
                {analytics.hourlySlots.filter((s) => s.trades > 0).map((slot) => (
                  <tr key={slot.hour} className="hover:bg-[var(--surface-ghost)] transition-colors">
                    <td className="px-6 py-3.5 font-semibold text-[var(--text-primary)]">{slot.label}</td>
                    <td className="px-6 py-3.5 text-right text-[var(--text-primary)]">{slot.trades}</td>
                    <td className="px-6 py-3.5 text-right text-[var(--text-primary)]">{formatPercent(slot.winRate)}</td>
                    <td className={`px-6 py-3.5 text-right font-medium ${slot.avgPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{formatCurrency(slot.avgPnl)}</td>
                    <td className={`px-6 py-3.5 text-right font-semibold ${slot.netPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{formatCurrency(slot.netPnl)}</td>
                    <td className="px-6 py-3.5 text-right text-[#10b981]">{formatCurrency(slot.bestTrade)}</td>
                    <td className="px-6 py-3.5 text-right text-[#ef4444]">{formatCurrency(slot.worstTrade)}</td>
                    <td className="px-6 py-3.5 text-right text-[var(--text-primary)]">{Number.isFinite(slot.profitFactor) ? slot.profitFactor.toFixed(2) : '∞'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataBlock>
      </div>

      {/* ── Section 6: Rolling Win Rate ── */}
      <div className="space-y-6">
        <SectionHeader title="Rolling Metrics" description="Smoothed win rate trend over time" />
        <DataBlock title="Rolling Win Rate" subtitle="10-trade moving win rate over time">
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.rollingWinRate} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-soft)" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="index" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--surface-overlay)', borderColor: 'var(--border-strong)', borderRadius: '12px', fontSize: '11px', color: 'var(--text-primary)' }} formatter={(v: number) => [formatPercent(v), 'Win Rate']} />
                <Line type="monotone" dataKey="winRate" stroke="var(--accent-1)" dot={false} strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </DataBlock>
      </div>
    </div>
  );
};
