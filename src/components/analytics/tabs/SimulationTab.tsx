import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DataBlock, SectionHeader } from '../AnalyticsPrimitives';
import { formatCurrency, formatPercent } from '../formatters';
import type { computeAnalytics } from '../analyticsEngine';

type Analytics = ReturnType<typeof computeAnalytics>;

export const SimulationTab: React.FC<{ analytics: Analytics }> = ({ analytics }) => {
  const mc = analytics.monteCarlo;
  const percentiles = [
    { label: 'P5 (pessimistic)', value: mc.percentiles.p5 },
    { label: 'P25', value: mc.percentiles.p25 },
    { label: 'P50 (median)', value: mc.percentiles.p50 },
    { label: 'P75', value: mc.percentiles.p75 },
    { label: 'P95 (optimistic)', value: mc.percentiles.p95 },
  ];

  const seededRunData = mc.seededRun.map((equity, index) => ({ index: index + 1, equity }));

  return (
    <div className="space-y-10">
      {/* ── Section 1: Intro & Key Stats ── */}
      <div className="space-y-6">
        <SectionHeader
          title="Monte Carlo Simulation"
          description={`${mc.simulations.toLocaleString()} bootstrap resamples of your ${mc.tradeCount} actual trade outcomes — no invented distributions, only your real results`}
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
          {[
            { label: 'Win Rate', value: formatPercent(mc.winRate), good: true },
            { label: 'Avg Win', value: formatCurrency(mc.avgWin), good: true },
            { label: 'Avg Loss', value: formatCurrency(mc.avgLoss), good: false },
            { label: 'Expected Net', value: formatCurrency(mc.expectedNet), good: mc.expectedNet > 0 },
            { label: 'Chance of Profit', value: formatPercent(mc.positiveProbability), good: mc.positiveProbability > 0.5 },
            { label: 'Ruin Probability', value: formatPercent(mc.ruinProbability), good: mc.ruinProbability < 0.05 },
          ].map((item) => (
            <div key={item.label} className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 border border-[var(--border-soft)] glass-panel">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{item.label}</div>
              <div className={`mt-2 text-2xl font-bold ${item.good ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 2: Outcome Distribution ── */}
      <div className="space-y-6">
        <SectionHeader title="Outcome Distribution" description="Range of possible net results after replaying your trade sequence" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DataBlock title="Seeded Example Run" subtitle="One deterministic replay path from your outcomes">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={seededRunData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mcFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-1)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--accent-1)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border-soft)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="index" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={(v: number) => formatCurrency(v)} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--surface-overlay)', borderColor: 'var(--border-strong)', borderRadius: '12px', fontSize: '11px', color: 'var(--text-primary)' }} formatter={(v: number) => [formatCurrency(v), 'Cumulative P&L']} />
                  <Area type="monotone" dataKey="equity" stroke="var(--accent-1)" strokeWidth={2} fill="url(#mcFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </DataBlock>

          <DataBlock title="Percentile Range" subtitle="Net P&L at key percentiles across all simulations">
            <div className="space-y-3">
              {percentiles.map((p) => (
                <div key={p.label} className="flex items-center justify-between rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-4">
                  <span className="text-[12px] text-[var(--text-muted)] font-semibold">{p.label}</span>
                  <span className={`text-[15px] font-bold ${p.value >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{formatCurrency(p.value)}</span>
                </div>
              ))}
              <div className="mt-4 text-center text-[11px] text-[var(--text-muted)] font-medium">
                {mc.tradeCount < 5
                  ? 'Add more trades for a meaningful distribution — results below 5 trades are unreliable.'
                  : '90% of simulated sequences land between the P5 and P95 bounds.'}
              </div>
            </div>
          </DataBlock>
        </div>
      </div>

      {/* ── Section 3: Caveats ── */}
      <div className="space-y-6">
        <DataBlock title="How to read this" subtitle="What the simulation does and does not tell you">
          <div className="space-y-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
            <p>Each simulation shuffles your <b>{mc.tradeCount}</b> realized trades (with replacement) into a new sequence of the same length, then sums the P&L. Repeating this {mc.simulations.toLocaleString()} times maps the range of outcomes your current edge can produce by luck alone.</p>
            <p>The median (P50) shows the typical result; the P5 / P95 band shows how wide the variance is. A wide band with a positive median means your edge is real but choppy — position sizing discipline matters more than ever.</p>
            <p>Limitations: order of trades is randomized (sequence effects like tilt are ignored), and risk per trade is fixed — it does not model compounding or changes in position size.</p>
          </div>
        </DataBlock>
      </div>
    </div>
  );
};
