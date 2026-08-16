import React from 'react';
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DataBlock, MiniStat, ScoreGauge, SectionHeader } from '../AnalyticsPrimitives';
import { formatCurrency, formatDuration, formatPercent } from '../formatters';
import type { computeAnalytics } from '../analyticsEngine';

type Analytics = ReturnType<typeof computeAnalytics>;

export const BehaviorTab: React.FC<{ analytics: Analytics }> = ({ analytics }) => {
  return (
    <div className="space-y-10">

      {/* ── Section 1: Behavioral Gauges ── */}
      <div className="space-y-6">
        <SectionHeader title="Behavioral Risk Gauges" description="Automated detection of key psychological trading patterns" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <ScoreGauge
            score={analytics.consistencyScore}
            label="Consistency Score"
            description={analytics.consistencyScore >= 70 ? 'Your returns are stable and predictable' : analytics.consistencyScore >= 40 ? 'Some variance in your trade outcomes' : 'High variability — returns are unpredictable'}
          />
          <div className="rounded-2xl p-6 glass-panel">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-3">Tilt Detection</div>
            <div className="flex items-end gap-2">
              <span className={`text-4xl font-bold ${analytics.tiltScore.score === 0 ? 'text-[#10b981]' : analytics.tiltScore.score < 30 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}`}>
                {analytics.tiltScore.incidents}
              </span>
              <span className="text-[12px] text-[var(--text-muted)] mb-1">incidents</span>
            </div>
            <div className="mt-4 h-2 w-full rounded-full bg-[var(--surface-ghost)] border border-[var(--border-soft)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, analytics.tiltScore.score)}%`,
                  backgroundColor: analytics.tiltScore.score === 0 ? '#10b981' : analytics.tiltScore.score < 30 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-secondary)]">{analytics.tiltScore.description}</p>
          </div>
          <div className="rounded-2xl p-6 glass-panel">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-3">Overtrading Analysis</div>
            <div className="flex items-end gap-2">
              <span className={`text-4xl font-bold ${analytics.overtradingScore.score < 30 ? 'text-[#10b981]' : analytics.overtradingScore.score < 60 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}`}>
                {analytics.overtradingScore.avgTradesPerSession.toFixed(1)}
              </span>
              <span className="text-[12px] text-[var(--text-muted)] mb-1">avg trades/session</span>
            </div>
            <div className="mt-4 h-2 w-full rounded-full bg-[var(--surface-ghost)] border border-[var(--border-soft)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, analytics.overtradingScore.score)}%`,
                  backgroundColor: analytics.overtradingScore.score < 30 ? '#10b981' : analytics.overtradingScore.score < 60 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-secondary)]">{analytics.overtradingScore.description}</p>
          </div>
        </div>
      </div>

      {/* ── Section 2: Streak Psychology ── */}
      <div className="space-y-6">
        <SectionHeader title="Streak Psychology" description="How your performance changes after consecutive wins or losses" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DataBlock title="Win Rate After Win Streaks" subtitle="How likely you are to win after consecutive wins">
            <div className="space-y-3">
              {analytics.winRateAfterStreaks
                .filter((s) => s.type === 'win')
                .map((s) => (
                  <div key={`win-${s.streakLength}`} className="flex items-center gap-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#10b981]/15 text-[#10b981] text-[12px] font-bold">
                      {s.streakLength}W
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[var(--text-primary)] font-semibold">After {s.streakLength} consecutive win{s.streakLength > 1 ? 's' : ''}</span>
                        <span className={`text-[13px] font-bold ${s.nextWinRate >= 50 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                          {s.sample > 0 ? formatPercent(s.nextWinRate) : 'N/A'}
                        </span>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-1">Sample size: {s.sample} trades</div>
                    </div>
                  </div>
                ))}
            </div>
          </DataBlock>

          <DataBlock title="Win Rate After Loss Streaks" subtitle="How likely you are to win after consecutive losses">
            <div className="space-y-3">
              {analytics.winRateAfterStreaks
                .filter((s) => s.type === 'loss')
                .map((s) => (
                  <div key={`loss-${s.streakLength}`} className="flex items-center gap-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ef4444]/15 text-[#ef4444] text-[12px] font-bold">
                      {s.streakLength}L
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[var(--text-primary)] font-semibold">After {s.streakLength} consecutive loss{s.streakLength > 1 ? 'es' : ''}</span>
                        <span className={`text-[13px] font-bold ${s.nextWinRate >= 50 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                          {s.sample > 0 ? formatPercent(s.nextWinRate) : 'N/A'}
                        </span>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-1">Sample size: {s.sample} trades</div>
                    </div>
                  </div>
                ))}
            </div>
          </DataBlock>
        </div>
      </div>

      {/* ── Section 3: Hold Time Analysis ── */}
      <div className="space-y-6">
        <SectionHeader title="Hold Time vs Performance" description="Relationship between how long you hold trades and your results" />

        <DataBlock title="Duration vs P&L" subtitle={`Hold time vs outcome · Correlation: ${analytics.durationPnlCorrelation.toFixed(3)}`}>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-soft)" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="durationMin" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} name="Duration (min)" />
                <YAxis type="number" dataKey="pnl" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} name="P&L" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ backgroundColor: 'var(--surface-overlay)', borderColor: 'var(--border-strong)', borderRadius: '12px', fontSize: '11px', color: 'var(--text-primary)' }}
                  formatter={(v: number, k: string) => [k === 'durationMin' ? `${v}m` : formatCurrency(v), k === 'durationMin' ? 'Duration' : 'P&L']}
                />
                <Scatter data={analytics.durationVsPnl} fill="var(--accent-1)" fillOpacity={0.55} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 text-center text-[11px] text-[var(--text-muted)] font-medium">
            {Math.abs(analytics.durationPnlCorrelation) < 0.1
              ? 'No meaningful correlation between hold time and P&L'
              : analytics.durationPnlCorrelation > 0
                ? `Positive correlation (${analytics.durationPnlCorrelation.toFixed(2)}) — longer holds tend to be more profitable`
                : `Negative correlation (${analytics.durationPnlCorrelation.toFixed(2)}) — shorter trades tend to be more profitable`}
          </div>
        </DataBlock>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DataBlock title="Holding Profile" subtitle="Time management analysis across all trades">
            <div className="space-y-0.5">
              <MiniStat label="Average Hold Time" value={formatDuration(analytics.averageHoldingMs)} />
              <MiniStat label="Median Hold Time" value={formatDuration(analytics.durationDistribution.median)} />
              <MiniStat label="Shortest Trade" value={formatDuration(analytics.durationDistribution.min)} />
              <MiniStat label="Longest Trade" value={formatDuration(analytics.durationDistribution.max)} />
              <MiniStat label="Kelly Optimal Size" value={`${(analytics.kellyPercent * 100).toFixed(1)}%`} colorClass={analytics.kellyPercent > 0 ? 'text-[#10b981]' : 'text-[#ef4444]'} />
              <MiniStat label="Edge Ratio" value={analytics.edgeRatio.toFixed(2)} colorClass={analytics.edgeRatio > 1 ? 'text-[#10b981]' : 'text-[#ef4444]'} />
            </div>
          </DataBlock>

          <DataBlock title="Streak Impact Analysis" subtitle="How your best and worst streaks played out">
            <div className="space-y-4">
              {analytics.longestWinStreakDetail && (
                <div className="rounded-xl border border-[#10b981]/30 bg-[#10b981]/5 p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-[#10b981] mb-2">Longest Win Streak</div>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold text-[#10b981]">{analytics.longestWinStreakDetail.length}</span>
                    <span className="text-[12px] text-[var(--text-muted)] mb-0.5">consecutive wins</span>
                  </div>
                  <div className="mt-2 text-[11px] text-[var(--text-secondary)]">
                    Total: {formatCurrency(analytics.longestWinStreakDetail.totalPnl)} · {analytics.longestWinStreakDetail.startDate}
                    {analytics.longestWinStreakDetail.startDate !== analytics.longestWinStreakDetail.endDate ? ` → ${analytics.longestWinStreakDetail.endDate}` : ''}
                  </div>
                </div>
              )}
              {analytics.longestLossStreakDetail && (
                <div className="rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/5 p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-[#ef4444] mb-2">Longest Loss Streak</div>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold text-[#ef4444]">{analytics.longestLossStreakDetail.length}</span>
                    <span className="text-[12px] text-[var(--text-muted)] mb-0.5">consecutive losses</span>
                  </div>
                  <div className="mt-2 text-[11px] text-[var(--text-secondary)]">
                    Total: {formatCurrency(analytics.longestLossStreakDetail.totalPnl)} · {analytics.longestLossStreakDetail.startDate}
                    {analytics.longestLossStreakDetail.startDate !== analytics.longestLossStreakDetail.endDate ? ` → ${analytics.longestLossStreakDetail.endDate}` : ''}
                  </div>
                </div>
              )}
              {!analytics.longestWinStreakDetail && !analytics.longestLossStreakDetail && (
                <p className="text-[12px] text-[var(--text-muted)] text-center py-6 font-medium">Not enough trades for streak analysis</p>
              )}
            </div>
          </DataBlock>
        </div>
      </div>

      {/* ── Section 4: Size Drift (Revenge Trading) ── */}
      {analytics.sizeAfterStreaks.afterLossStreak.some((s) => s.trades > 0) && (
        <div className="space-y-6">
          <SectionHeader title="Position Size Drift" description="Revenge-trading signature: does your size grow after losses?" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DataBlock title="Size After Win Streaks" subtitle="Average position size on the trade that follows N consecutive wins">
              <div className="space-y-3">
                {analytics.sizeAfterStreaks.afterWinStreak.map((s) => (
                  <div key={`w-${s.streak}`} className="flex items-center gap-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#10b981]/15 text-[#10b981] text-[12px] font-bold">
                      {s.streak}W
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[var(--text-primary)] font-semibold">After {s.streak} consecutive win{s.streak > 1 ? 's' : ''}</span>
                        <span className="text-[13px] font-bold text-[var(--text-primary)]">{s.avgSize.toFixed(2)} lots</span>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-1">Sample size: {s.trades} trades</div>
                    </div>
                  </div>
                ))}
              </div>
            </DataBlock>

            <DataBlock title="Size After Loss Streaks" subtitle="Average position size on the trade that follows N consecutive losses">
              <div className="space-y-3">
                {analytics.sizeAfterStreaks.afterLossStreak.map((s) => (
                  <div key={`l-${s.streak}`} className="flex items-center gap-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ef4444]/15 text-[#ef4444] text-[12px] font-bold">
                      {s.streak}L
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[var(--text-primary)] font-semibold">After {s.streak} consecutive loss{s.streak > 1 ? 'es' : ''}</span>
                        <span className="text-[13px] font-bold text-[var(--text-primary)]">{s.avgSize.toFixed(2)} lots</span>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-1">Sample size: {s.trades} trades</div>
                    </div>
                  </div>
                ))}
              </div>
            </DataBlock>
          </div>
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] p-4 text-[11px] text-[var(--text-secondary)]">
            {(() => {
              const lossStreaks = analytics.sizeAfterStreaks.afterLossStreak;
              const winStreaks = analytics.sizeAfterStreaks.afterWinStreak;
              const latestLoss = lossStreaks.length > 1 ? lossStreaks[lossStreaks.length - 1] : null;
              const latestWin = winStreaks.length > 1 ? winStreaks[winStreaks.length - 1] : null;
              if (latestLoss && latestWin && latestLoss.avgSize > latestWin.avgSize * 1.1) {
                return 'Detected: position size increases after losing streaks vs winning streaks. This is the classic revenge-trading pattern — consider capping size after losses.';
              }
              if (latestLoss && latestLoss.trades >= 2 && latestWin && latestWin.avgSize >= latestLoss.avgSize) {
                return 'Healthy pattern: position sizing does not inflate after losses.';
              }
              return 'Not enough streak variety to judge size drift yet.';
            })()}
          </div>
        </div>
      )}

      {/* ── Section 5: Setup & Strategy Breakdown ── */}
      <div className="space-y-6">
        <SectionHeader title="Strategy & Setup Performance" description="Real execution metrics grouped by setup model (e.g., FVG, Order Block, Liquidity Sweep)" />
        <div className="grid grid-cols-1 gap-6">
          <DataBlock title="Setup Models Edge" subtitle="Win rate, realized P&L, profit factor, and average R-multiple per strategy setup" noPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px] text-[var(--text-secondary)]">
                <thead className="border-b border-[var(--border-soft)] bg-[var(--surface-ghost)] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Setup / Model</th>
                    <th className="px-6 py-4 font-semibold text-right">Trades</th>
                    <th className="px-6 py-4 font-semibold text-right">W / L</th>
                    <th className="px-6 py-4 font-semibold text-right">Win Rate</th>
                    <th className="px-6 py-4 font-semibold text-right">Profit Factor</th>
                    <th className="px-6 py-4 font-semibold text-right">Avg R</th>
                    <th className="px-6 py-4 font-semibold text-right">Net Realized P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-soft)]">
                  {analytics.setupBreakdown.map((setup) => (
                    <tr key={setup.tag} className="hover:bg-[var(--surface-ghost)] transition-colors">
                      <td className="px-6 py-3.5 font-semibold text-[var(--text-primary)]">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--surface-1)] border border-[var(--border-soft)] text-[var(--text-primary)]">
                          {setup.tag}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-[var(--text-primary)]">{setup.trades}</td>
                      <td className="px-6 py-3.5 text-right font-mono text-[var(--text-muted)]">{setup.wins} / {setup.losses}</td>
                      <td className="px-6 py-3.5 text-right font-mono font-semibold text-[var(--text-primary)]">{formatPercent(setup.winRate)}</td>
                      <td className="px-6 py-3.5 text-right font-mono text-[var(--text-primary)]">{Number.isFinite(setup.profitFactor) ? setup.profitFactor.toFixed(2) : '∞'}</td>
                      <td className="px-6 py-3.5 text-right font-mono text-[var(--text-primary)]">{setup.avgR ? `${setup.avgR.toFixed(2)}R` : '-'}</td>
                      <td className={`px-6 py-3.5 text-right font-mono font-semibold ${setup.netPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                        {formatCurrency(setup.netPnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataBlock>
        </div>
      </div>

      {/* ── Section 6: Discipline & Rule Adherence ── */}
      <div className="space-y-6">
        <SectionHeader title="Trading Discipline & Mistake Analysis" description="Measure the cost of psychological mistakes vs plan execution" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DataBlock title="Discipline & Mistake Breakdown" subtitle="Distribution of trades adhering to plan vs breaking rules" noPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px] text-[var(--text-secondary)]">
                <thead className="border-b border-[var(--border-soft)] bg-[var(--surface-ghost)] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Classification</th>
                    <th className="px-6 py-4 font-semibold text-right">Trades</th>
                    <th className="px-6 py-4 font-semibold text-right">Win Rate</th>
                    <th className="px-6 py-4 font-semibold text-right">Net P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-soft)]">
                  {analytics.disciplineBreakdown.map((disc) => (
                    <tr key={disc.tag} className="hover:bg-[var(--surface-ghost)] transition-colors">
                      <td className="px-6 py-3.5 font-semibold text-[var(--text-primary)]">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                          disc.category === 'rule' 
                            ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30'
                            : disc.category === 'mistake'
                            ? 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/30'
                            : 'bg-[var(--surface-1)] text-[var(--text-muted)] border-[var(--border-soft)]'
                        }`}>
                          {disc.tag}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-[var(--text-primary)]">{disc.trades}</td>
                      <td className="px-6 py-3.5 text-right font-mono text-[var(--text-primary)]">{formatPercent(disc.winRate)}</td>
                      <td className={`px-6 py-3.5 text-right font-mono font-semibold ${disc.netPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                        {formatCurrency(disc.netPnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataBlock>

          <DataBlock title="Cost of Indiscipline" subtitle="Quantified net difference between rule-following and mistake trades">
            <div className="space-y-4">
              {(() => {
                const ruleTrades = analytics.disciplineBreakdown.filter((d) => d.category === 'rule');
                const mistakeTrades = analytics.disciplineBreakdown.filter((d) => d.category === 'mistake');
                const rulePnl = ruleTrades.reduce((sum, d) => sum + d.netPnl, 0);
                const mistakePnl = mistakeTrades.reduce((sum, d) => sum + d.netPnl, 0);
                const ruleCount = ruleTrades.reduce((sum, d) => sum + d.trades, 0);
                const mistakeCount = mistakeTrades.reduce((sum, d) => sum + d.trades, 0);

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)]">
                      <div>
                        <div className="text-[13px] font-semibold text-[var(--text-primary)]">Followed Trading Plan</div>
                        <div className="text-[11px] text-[var(--text-muted)]">{ruleCount} recorded trades</div>
                      </div>
                      <div className={`text-lg font-bold font-mono ${rulePnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                        {formatCurrency(rulePnl)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-ghost)]">
                      <div>
                        <div className="text-[13px] font-semibold text-[var(--text-primary)]">Rule Violations & Mistakes</div>
                        <div className="text-[11px] text-[var(--text-muted)]">{mistakeCount} recorded trades</div>
                      </div>
                      <div className={`text-lg font-bold font-mono ${mistakePnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                        {formatCurrency(mistakePnl)}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-dashed border-[var(--border-soft)] text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      {mistakePnl < 0 
                        ? `Fixing plan discipline would have saved ${formatCurrency(Math.abs(mistakePnl))} in avoidable drawdown.`
                        : 'Keep logging trade setup tags and execution mistakes to track rule discipline over time.'}
                    </div>
                  </div>
                );
              })()}
            </div>
          </DataBlock>
        </div>
      </div>

      {/* ── Section 7: Instrument Breakdown ── */}
      {analytics.instrumentBreakdown.length > 1 && (
        <div className="space-y-6">
          <SectionHeader title="Instrument Breakdown" description="Performance by instrument traded" />
          <DataBlock title="Instrument Performance Table" subtitle="Win rate and net P&L per instrument" noPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px] text-[var(--text-secondary)]">
                <thead className="border-b border-[var(--border-soft)] bg-[var(--surface-ghost)] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Instrument</th>
                    <th className="px-6 py-4 font-semibold text-right">Trades</th>
                    <th className="px-6 py-4 font-semibold text-right">Win Rate</th>
                    <th className="px-6 py-4 font-semibold text-right">Net P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-soft)]">
                  {analytics.instrumentBreakdown.map((inst) => (
                    <tr key={inst.instrument} className="hover:bg-[var(--surface-ghost)] transition-colors">
                      <td className="px-6 py-3.5 font-semibold text-[var(--text-primary)]">{inst.instrument}</td>
                      <td className="px-6 py-3.5 text-right text-[var(--text-primary)]">{inst.trades}</td>
                      <td className="px-6 py-3.5 text-right text-[var(--text-primary)]">{formatPercent(inst.winRate)}</td>
                      <td className={`px-6 py-3.5 text-right font-semibold ${inst.pnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{formatCurrency(inst.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataBlock>
        </div>
      )}
    </div>
  );
};
