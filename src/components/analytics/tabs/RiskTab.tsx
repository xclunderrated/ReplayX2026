import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DataBlock, MiniStat, InfoTooltip } from '../AnalyticsPrimitives';
import { formatCompactCurrency, formatCurrency, formatPercent } from '../formatters';
import type { computeAnalytics } from '../analyticsEngine';

type Analytics = ReturnType<typeof computeAnalytics>;

export const RiskTab: React.FC<{ analytics: Analytics }> = ({ analytics }) => {
  return (
    <div className="space-y-8">
      {/* ── 1. Risk Profile Overview Strip ── */}
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-soft)]">
          {[
            {
              label: 'Sharpe Ratio',
              value: analytics.sharpeRatio.toFixed(2),
              desc: 'Annualized risk-return',
              tooltip: 'Sharpe Ratio = (Annualized Return - Risk Free Rate) / Annualized Standard Deviation.',
              good: analytics.sharpeRatio >= 1.0,
            },
            {
              label: 'Sortino Ratio',
              value: analytics.sortinoRatio.toFixed(2),
              desc: 'Downside risk-adjusted',
              tooltip: 'Focuses only on negative volatility (downside deviation), ignoring upside volatility.',
              good: analytics.sortinoRatio >= 1.5,
            },
            {
              label: 'Calmar Ratio',
              value: analytics.calmarRatio.toFixed(2),
              desc: 'Return / Max DD',
              tooltip: 'Annualized return divided by maximum percentage drawdown.',
              good: analytics.calmarRatio >= 1.0,
            },
            {
              label: 'Recovery Factor',
              value: analytics.recoveryFactor.toFixed(2),
              desc: 'Net P&L / Max DD',
              tooltip: 'Total Net Profit divided by Maximum Dollar Drawdown.',
              good: analytics.recoveryFactor >= 1.5,
            },
            {
              label: 'Kelly %',
              value: `${(analytics.kellyPercent * 100).toFixed(1)}%`,
              desc: 'Theoretical optimal',
              tooltip: 'Kelly Criterion: theoretical optimal capital percentage to risk per trade.',
              good: analytics.kellyPercent > 0,
            },
            {
              label: 'Payoff Ratio',
              value: Number.isFinite(analytics.payoffRatio) ? analytics.payoffRatio.toFixed(2) : '∞',
              desc: 'Avg Win / Avg Loss',
              tooltip: 'Ratio of average winning trade profit to average losing trade loss.',
              good: analytics.payoffRatio >= 1.2,
            },
          ].map((item) => (
            <div key={item.label} className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{item.label}</span>
                <InfoTooltip text={item.tooltip} />
              </div>
              <div className={`mt-2 text-xl sm:text-2xl font-bold font-mono ${item.good ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                {item.value}
              </div>
              <div className="mt-1 text-[11px] text-[var(--text-muted)] truncate">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. Drawdown Timeline & Ranked Periods ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <DataBlock
          title="Drawdown Timeline"
          subtitle="Underwater decline profile across trade sequence"
          tooltip="Shows the depth of equity retracement from the all-time high at each trade."
        >
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.drawdownTimeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ddFillRisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f23645" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f23645" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border-soft)" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="index" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={(v) => formatCompactCurrency(v)} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18191d', borderColor: 'var(--border-panel-strong)', borderRadius: '12px', fontSize: '11px', color: '#f4f4f5', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}
                  formatter={(v: number) => [`-${formatCurrency(v)}`, 'Drawdown']}
                />
                <Area type="monotone" dataKey="drawdown" stroke="#f23645" strokeWidth={1.8} fill="url(#ddFillRisk)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </DataBlock>

        <DataBlock
          title="Significant Drawdowns"
          subtitle="Ranked historical peak-to-trough drawdowns"
          noPadding
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[var(--text-secondary)]">
              <thead className="border-b border-[var(--border-soft)] bg-[var(--surface-ghost)] text-[var(--text-muted)] text-[10px] uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">#</th>
                  <th className="px-5 py-3 font-semibold text-right">Depth ($)</th>
                  <th className="px-5 py-3 font-semibold text-right">Depth (%)</th>
                  <th className="px-5 py-3 font-semibold text-right">Duration</th>
                  <th className="px-5 py-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-soft)] font-mono">
                {analytics.drawdownPeriods.slice(0, 6).map((dd, i) => (
                  <tr key={i} className="hover:bg-[var(--surface-ghost)] transition-colors">
                    <td className="px-5 py-2.5 text-[var(--text-muted)]">{i + 1}</td>
                    <td className="px-5 py-2.5 text-right text-[#f23645] font-semibold">-{formatCurrency(dd.depth)}</td>
                    <td className="px-5 py-2.5 text-right text-[#f23645]">{formatPercent(dd.depthPct)}</td>
                    <td className="px-5 py-2.5 text-right text-[var(--text-primary)]">{dd.durationTrades}t</td>
                    <td className="px-5 py-2.5 text-right">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold border ${dd.recovered ? 'border-[#089981]/30 bg-[#089981]/15 text-[#089981]' : 'border-[#f23645]/30 bg-[#f23645]/15 text-[#f23645]'}`}>
                        {dd.recovered ? 'Recovered' : 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {analytics.drawdownPeriods.length === 0 && (
              <div className="p-8 text-center text-xs text-[var(--text-muted)] font-sans">No significant drawdown periods recorded</div>
            )}
          </div>
        </DataBlock>
      </div>

      {/* ── 3. Excursions & Cumulative R Curve ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <DataBlock
          title="MAE / MFE Scatter"
          subtitle="Max Adverse Excursion vs Max Favorable Excursion"
          tooltip="Plots trade drawdowns (MAE) against maximum unrealized profit (MFE)."
        >
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-soft)" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="mae" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} name="MAE" tickFormatter={(v: number) => formatCompactCurrency(v)} />
                <YAxis type="number" dataKey="mfe" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} name="MFE" tickFormatter={(v: number) => formatCompactCurrency(v)} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ backgroundColor: '#18191d', borderColor: 'var(--border-panel-strong)', borderRadius: '12px', fontSize: '11px', color: '#f4f4f5', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}
                  formatter={(v: number, k: string) => [formatCurrency(v), k === 'mae' ? 'MAE (Max Risk)' : 'MFE (Max Gain)']}
                />
                <Scatter data={analytics.maeMfeScatter.filter((d) => d.mae !== null && d.mfe !== null)} fill="var(--accent-1)" fillOpacity={0.65} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </DataBlock>

        <DataBlock
          title="Cumulative R-Multiple"
          subtitle="Normalized risk performance progression"
          tooltip="Measures cumulative return in units of 1R initial risk."
        >
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.cumulativeRMultipleCurve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-soft)" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="index" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18191d', borderColor: 'var(--border-panel-strong)', borderRadius: '12px', fontSize: '11px', color: '#f4f4f5', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}
                  formatter={(v: number | null, k: string) => [v === null ? 'N/A' : `${v.toFixed(2)}R`, k === 'cumulativeR' ? 'Cumulative R' : 'Trade R']}
                />
                <Line dataKey="rMultiple" stroke="var(--text-muted)" strokeOpacity={0.3} dot={false} strokeWidth={1} />
                <Line dataKey="cumulativeR" stroke="var(--accent-1)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </DataBlock>
      </div>

      {/* ── 4. R-Spread & Extreme Bounds ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <DataBlock title="R-Multiple Spread" subtitle="Trades grouped by realized R multiple" className="lg:col-span-2">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center font-mono">
            {Object.entries(analytics.rBuckets).map(([label, count]) => (
              <div key={label} className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-3.5">
                <div className="text-lg font-bold text-[var(--text-primary)]">{count}</div>
                <div className="text-[11px] text-[var(--text-muted)] font-sans mt-1">{label}</div>
              </div>
            ))}
          </div>
        </DataBlock>

        <DataBlock title="Risk Bounds" subtitle="Key extreme parameters" className="lg:col-span-1">
          <div className="space-y-1">
            <MiniStat label="Max Drawdown ($)" value={formatCurrency(analytics.maxDrawdown)} colorClass="text-[#f23645]" />
            <MiniStat label="Max Drawdown (%)" value={formatPercent(analytics.maxDrawdownPct)} colorClass="text-[#f23645]" />
            <MiniStat label="Best Win" value={analytics.bestTrade ? formatCurrency(analytics.bestTrade.pnlValue) : '-'} colorClass="text-[#089981]" />
            <MiniStat label="Worst Loss" value={analytics.worstTrade ? formatCurrency(analytics.worstTrade.pnlValue) : '-'} colorClass="text-[#f23645]" />
            <MiniStat label="Average Win" value={formatCurrency(analytics.averageWin)} colorClass="text-[#089981]" />
            <MiniStat label="Average Loss" value={formatCurrency(analytics.averageLoss)} colorClass="text-[#f23645]" />
          </div>
        </DataBlock>
      </div>
    </div>
  );
};
