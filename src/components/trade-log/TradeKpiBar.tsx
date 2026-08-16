import React from 'react';
import { clsx } from 'clsx';
import { MetricSummary, formatDuration } from '../../services/math/tradeMetrics';
import {
  TrendingUp,
  Percent,
  Calculator,
  Scale,
  Crosshair,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  ShieldAlert,
  Clock,
} from 'lucide-react';

interface TradeKpiBarProps {
  metrics: MetricSummary;
}

export default function TradeKpiBar({ metrics }: TradeKpiBarProps) {
  const isNetPositive = metrics.netPnL >= 0;
  const pnlSign = isNetPositive ? '+' : '';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 p-4 rounded-2xl bg-[var(--surface-ghost)] border border-[var(--border-soft)] shadow-xs">
      {/* 1. Net Realized PnL & Total R */}
      <div className="flex flex-col justify-between p-3.5 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] shadow-2xs hover:border-[var(--border-strong)] transition-colors">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
          <span>Net PnL</span>
          <TrendingUp size={14} className={isNetPositive ? 'text-emerald-500' : 'text-rose-500'} />
        </div>
        <div className="mt-2.5">
          <div className={clsx(
            'text-xl font-bold font-mono tracking-tight',
            isNetPositive ? 'text-emerald-500' : 'text-rose-500'
          )}>
            {pnlSign}${metrics.netPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center gap-1.5 font-semibold text-[var(--text-secondary)] mt-1.5">
            <span className={clsx(
              'px-2 py-0.5 rounded-md text-[11px] font-bold font-mono',
              metrics.totalR >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
            )}>
              {metrics.totalR >= 0 ? '+' : ''}{metrics.totalR}R
            </span>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">({metrics.avgR >= 0 ? '+' : ''}{metrics.avgR}R avg)</span>
          </div>
        </div>
      </div>

      {/* 2. Win Rate & Trade Counts */}
      <div className="flex flex-col justify-between p-3.5 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] shadow-2xs hover:border-[var(--border-strong)] transition-colors">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
          <span>Win Rate</span>
          <Percent size={14} className="text-blue-500" />
        </div>
        <div className="mt-2.5">
          <div className="text-xl font-bold font-mono tracking-tight text-[var(--text-primary)]">
            {metrics.winRate}%
          </div>
          <div className="text-[11px] font-mono text-[var(--text-secondary)] font-semibold mt-1.5 flex items-center gap-1">
            <span className="text-emerald-500">{metrics.wins}W</span>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="text-rose-500">{metrics.losses}L</span>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="text-[var(--text-muted)]">{metrics.breakEvens}BE</span>
          </div>
        </div>
      </div>

      {/* 3. Profit Factor & Gross Figures */}
      <div className="flex flex-col justify-between p-3.5 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] shadow-2xs hover:border-[var(--border-strong)] transition-colors">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
          <span>Profit Factor</span>
          <Calculator size={14} className="text-indigo-500" />
        </div>
        <div className="mt-2.5">
          <div className="text-xl font-bold font-mono tracking-tight text-[var(--text-primary)]">
            {metrics.profitFactor >= 99 ? '∞' : metrics.profitFactor.toFixed(2)}
          </div>
          <div className="text-[11px] font-mono text-[var(--text-muted)] truncate mt-1.5">
            +${metrics.totalGrossProfit.toFixed(0)} / -${metrics.totalGrossLoss.toFixed(0)}
          </div>
        </div>
      </div>

      {/* 4. Average Win vs Average Loss */}
      <div className="flex flex-col justify-between p-3.5 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] shadow-2xs hover:border-[var(--border-strong)] transition-colors">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
          <span>Avg Win / Loss</span>
          <Scale size={14} className="text-amber-500" />
        </div>
        <div className="mt-2.5">
          <div className="flex items-center gap-1.5 text-sm font-bold font-mono">
            <span className="text-emerald-500">+${metrics.avgWinDollar.toFixed(0)}</span>
            <span className="text-[var(--text-muted)] font-normal">/</span>
            <span className="text-rose-500">-${metrics.avgLossDollar.toFixed(0)}</span>
          </div>
          <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1.5">
            <span className="text-emerald-500 font-semibold">+{metrics.avgWinR}R</span>
            <span className="mx-1">/</span>
            <span className="text-rose-500 font-semibold">-{metrics.avgLossR}R</span>
          </div>
        </div>
      </div>

      {/* 5. Excursion Profile (MAE vs MFE) */}
      <div className="flex flex-col justify-between p-3.5 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] shadow-2xs hover:border-[var(--border-strong)] transition-colors">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
          <span>Peak vs Heat</span>
          <Crosshair size={14} className="text-teal-500" />
        </div>
        <div className="mt-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold font-mono">
            <span className="text-teal-500 inline-flex items-center">
              <Flame size={12} className="mr-0.5" />
              +${metrics.avgMfeDollar.toFixed(0)}
            </span>
            <span className="text-[var(--text-muted)] font-normal">/</span>
            <span className="text-rose-400 inline-flex items-center">
              <ShieldAlert size={12} className="mr-0.5" />
              -${metrics.avgMaeDollar.toFixed(0)}
            </span>
          </div>
          <div className="text-[11px] text-[var(--text-muted)] truncate mt-1.5">
            Avg MFE / MAE
          </div>
        </div>
      </div>

      {/* 6. Expectancy & Avg Duration */}
      <div className="flex flex-col justify-between p-3.5 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] shadow-2xs hover:border-[var(--border-strong)] transition-colors">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
          <span>Expectancy</span>
          <ArrowUpRight size={14} className="text-cyan-500" />
        </div>
        <div className="mt-2.5">
          <div className={clsx(
            'text-xl font-bold font-mono tracking-tight',
            metrics.expectancyR >= 0 ? 'text-cyan-500' : 'text-rose-500'
          )}>
            {metrics.expectancyR >= 0 ? '+' : ''}{metrics.expectancyR}R
          </div>
          <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 truncate mt-1.5">
            <Clock size={11} />
            <span>Hold: {formatDuration(metrics.avgHoldingTimeMs)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
