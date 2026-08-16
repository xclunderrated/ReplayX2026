import React, { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { DataBlock, StatCell, MiniStat, HeatmapCell } from '../AnalyticsPrimitives';
import { formatCompactCurrency, formatCurrency, formatDuration, formatPercent } from '../formatters';
import type { computeAnalytics } from '../analyticsEngine';

type Analytics = ReturnType<typeof computeAnalytics>;

export const OverviewTab: React.FC<{ analytics: Analytics }> = ({ analytics }) => {
  const [chartMode, setChartMode] = useState<'both' | 'equity' | 'drawdown'>('both');
  const maxCalendarPnl = Math.max(1, ...analytics.calendarData.map((d) => Math.abs(d.pnl)));

  return (
    <div className="space-y-8">
      {/* ── 1. Hero KPI Strip (Single Row with Generous Spacing) ── */}
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] shadow-xs">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-[var(--border-soft)]">
          <StatCell
            label="Net P&L"
            value={formatCurrency(analytics.netPnl)}
            subtext={`Gross: +${formatCompactCurrency(analytics.grossProfit)} / -${formatCompactCurrency(analytics.grossLoss)}`}
            colorClass={analytics.netPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}
            tooltip="Total realized net profit or loss across all closed trades."
          />
          <StatCell
            label="Win Rate"
            value={formatPercent(analytics.winRate)}
            subtext={`${analytics.winningTrades.length}W · ${analytics.losingTrades.length}L of ${analytics.totalTrades}`}
            colorClass="text-[var(--text-primary)]"
            tooltip="Percentage of closed trades with profit > $0.00."
          />
          <StatCell
            label="Profit Factor"
            value={Number.isFinite(analytics.profitFactor) ? analytics.profitFactor.toFixed(2) : '∞'}
            subtext={analytics.profitFactor >= 1.5 ? 'Strong Edge' : analytics.profitFactor >= 1.0 ? 'Profitable' : 'Negative'}
            colorClass={analytics.profitFactor >= 1.0 ? 'text-[#089981]' : 'text-[#f23645]'}
            tooltip="Gross Profit divided by Gross Loss."
          />
          <StatCell
            label="Expectancy"
            value={formatCurrency(analytics.expectancy)}
            subtext="Per closed trade"
            colorClass={analytics.expectancy >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}
            tooltip="Expected average dollar return per trade based on historical win rate and payoff ratio."
          />
          <StatCell
            label="Max Drawdown"
            value={formatCurrency(analytics.maxDrawdown)}
            subtext={`-${formatPercent(analytics.maxDrawdownPct)} from peak`}
            colorClass="text-[#f23645]"
            tooltip="The largest peak-to-trough balance decline."
          />
          <StatCell
            label="Avg Win / Loss"
            value={`${formatCompactCurrency(analytics.averageWin)} / ${formatCompactCurrency(analytics.averageLoss)}`}
            subtext={`Payoff: ${Number.isFinite(analytics.payoffRatio) ? analytics.payoffRatio.toFixed(2) : '∞'}x`}
            colorClass="text-[var(--text-primary)]"
            tooltip="Average dollar gain on winning trades versus average loss on losing trades."
          />
        </div>
      </div>

      {/* ── 2. Equity & Drawdown Chart ── */}
      <DataBlock
        title="Equity Curve & Drawdown"
        subtitle="Cumulative balance trajectory and peak-to-trough decline"
        headerAction={
          <div className="flex items-center rounded-xl bg-[var(--surface-ghost)] p-1 border border-[var(--border-soft)]">
            <button
              type="button"
              onClick={() => setChartMode('both')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                chartMode === 'both'
                  ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Combined
            </button>
            <button
              type="button"
              onClick={() => setChartMode('equity')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                chartMode === 'equity'
                  ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Equity
            </button>
            <button
              type="button"
              onClick={() => setChartMode('drawdown')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                chartMode === 'drawdown'
                  ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Drawdown
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          {(chartMode === 'both' || chartMode === 'equity') && (
            <div>
              <div className="flex items-center justify-between mb-2 text-xs text-[var(--text-muted)]">
                <span className="font-medium">Balance Progression</span>
                <span className="font-mono font-bold text-[var(--text-primary)]">
                  End Balance: {formatCurrency(analytics.equityCurve[analytics.equityCurve.length - 1]?.balance ?? 0)}
                </span>
              </div>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.equityCurve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-1)" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="var(--accent-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border-soft)" vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="index" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompactCurrency(v)} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18191d', borderColor: 'var(--border-panel-strong)', borderRadius: '12px', fontSize: '11px', color: '#f4f4f5', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}
                      formatter={(v: number) => [formatCurrency(v), 'Balance']}
                      labelFormatter={(_, p) => `Trade #${p?.[0]?.payload?.index ?? ''} · ${p?.[0]?.payload?.label ?? ''}`}
                    />
                    <Area type="monotone" dataKey="balance" stroke="var(--accent-1)" strokeWidth={2} fill="url(#eqFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {(chartMode === 'both' || chartMode === 'drawdown') && (
            <div className={chartMode === 'both' ? 'pt-4 border-t border-[var(--border-soft)]' : ''}>
              <div className="flex items-center justify-between mb-2 text-xs text-[var(--text-muted)]">
                <span className="font-medium">Drawdown Depth</span>
                <span className="font-mono font-bold text-[#f23645]">
                  Max: -{formatCurrency(analytics.maxDrawdown)} (-{formatPercent(analytics.maxDrawdownPct)})
                </span>
              </div>
              <div className="h-[110px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.drawdownTimeline} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f23645" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#f23645" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border-soft)" vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="index" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} tickFormatter={(v) => formatCompactCurrency(v)} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18191d', borderColor: 'var(--border-panel-strong)', borderRadius: '12px', fontSize: '11px', color: '#f4f4f5', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}
                      formatter={(v: number) => [`-${formatCurrency(v)}`, 'Drawdown']}
                    />
                    <Area type="monotone" dataKey="drawdown" stroke="#f23645" strokeWidth={1.5} fill="url(#ddFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </DataBlock>

      {/* ── 3. Performance Details (2-Column Grid) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Trade & Execution Breakdown */}
        <DataBlock title="Execution Breakdown" subtitle="Directional splits and trading efficiency">
          <div className="space-y-5">
            {/* Directional Split */}
            <div className="grid grid-cols-2 gap-4">
              {analytics.directionStats.map((stat) => (
                <div key={stat.direction} className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                      {stat.direction === 'Long' ? (
                        <ArrowUpRight size={14} className="text-[#089981]" />
                      ) : (
                        <ArrowDownRight size={14} className="text-[#2962ff]" />
                      )}
                      <span>{stat.direction}</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">{stat.trades} trades</span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className={`text-lg font-bold font-mono ${stat.net >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                      {formatCurrency(stat.net)}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] font-mono font-medium">WR {formatPercent(stat.winRate)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Supporting Stats Table */}
            <div className="space-y-1 pt-2">
              <MiniStat label="Average Trade Duration" value={formatDuration(analytics.averageHoldingMs)} />
              <MiniStat label="Sharpe Ratio" value={analytics.sharpeRatio.toFixed(2)} tooltip="Risk-adjusted return vs annualized standard deviation." />
              <MiniStat label="Sortino Ratio" value={analytics.sortinoRatio.toFixed(2)} tooltip="Downside volatility risk-adjusted ratio." />
              <MiniStat label="Recovery Factor" value={analytics.recoveryFactor.toFixed(2)} tooltip="Net P&L divided by Maximum Drawdown." />
              <MiniStat label="Best Win Streak" value={`${analytics.bestWinStreak} trades`} colorClass="text-[#089981]" />
              <MiniStat label="Worst Loss Streak" value={`${analytics.worstLossStreak} trades`} colorClass="text-[#f23645]" />
            </div>
          </div>
        </DataBlock>

        {/* Right Column: P&L Distribution */}
        <DataBlock title="P&L Distribution" subtitle="Trade outcome frequency by profit/loss bracket">
          <div className="h-[250px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.outcomeDistribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-soft)" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="bucket" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18191d', borderColor: 'var(--border-panel-strong)', borderRadius: '12px', fontSize: '11px', color: '#f4f4f5', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}
                  formatter={(v: number) => [`${v} trades`, 'Count']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {analytics.outcomeDistribution.map((b) => (
                    <Cell key={b.bucket} fill={b.bucket.includes('-') || b.bucket.includes('<') ? '#f23645' : '#089981'} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DataBlock>
      </div>

      {/* ── 4. Daily Activity Matrix ── */}
      {analytics.calendarData.length > 0 && (
        <DataBlock title="Recent Daily Activity" subtitle="P&L distribution across active trading sessions">
          <div className="grid gap-2 grid-cols-4 sm:grid-cols-7 md:grid-cols-10 lg:grid-cols-14">
            {analytics.calendarData.slice(-42).map((day) => (
              <HeatmapCell
                key={day.date}
                value={day.pnl}
                maxAbs={maxCalendarPnl}
                label={day.date.split('-').slice(1).join('/')}
                sublabel={formatCompactCurrency(day.pnl)}
              />
            ))}
          </div>
        </DataBlock>
      )}
    </div>
  );
};
