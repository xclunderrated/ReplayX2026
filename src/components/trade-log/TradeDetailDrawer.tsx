import React, { useState } from 'react';
import { clsx } from 'clsx';
import { EnrichedTrade, formatDuration, formatTradeTime } from '../../services/math/tradeMetrics';
import { Strategy, useSimulatorStore } from '../../store/useSimulatorStore';
import {
  captureTradeMultiTimeframeScreenshots,
  formatTimeframeBadgeLabel,
  AutoScreenshotCapture,
} from '../../services/autoScreenshotService';
import {
  X,
  Play,
  Download,
  CheckSquare,
  Square,
  Clock,
  Target,
  Shield,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  ShieldAlert,
  Award,
  Save,
  Tag,
  AlertTriangle,
  FileEdit,
  Camera,
  Maximize2,
  RefreshCw,
} from 'lucide-react';

interface TradeDetailDrawerProps {
  trade: EnrichedTrade | null;
  onClose: () => void;
  onReplay: (trade: EnrichedTrade) => void;
  onExportPdf: (trade: EnrichedTrade) => void;
  strategies: Strategy[];
}

export default function TradeDetailDrawer({
  trade,
  onClose,
  onReplay,
  onExportPdf,
  strategies,
}: TradeDetailDrawerProps) {
  if (!trade) return null;

  const [notes, setNotes] = useState(trade.notes || '');
  const [setupTag, setSetupTag] = useState(trade.setupTag || '');
  const [mistakeTag, setMistakeTag] = useState(trade.mistakeTag || '');
  const [grade, setGrade] = useState<string>(trade.grade || 'Ungraded');
  const [checklistHits, setChecklistHits] = useState<string[]>(trade.checklistHits || []);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Screenshots state
  const [screenshots, setScreenshots] = useState<AutoScreenshotCapture[]>(
    (trade.screenshots as AutoScreenshotCapture[]) || []
  );
  const [selectedScreenshotIdx, setSelectedScreenshotIdx] = useState<number>(0);
  const [isCapturingScreenshots, setIsCapturingScreenshots] = useState(false);
  const [lightboxDataUrl, setLightboxDataUrl] = useState<string | null>(null);

  const activeStrategy = strategies.find((s) => s.id === trade.strategyId) || strategies[0];

  const handleCaptureScreenshots = async () => {
    setIsCapturingScreenshots(true);
    try {
      const store = useSimulatorStore.getState();
      const session = store.sessions.find((s) => s.id === trade.sessionId) || store.sessions[0];
      if (session) {
        const captured = await captureTradeMultiTimeframeScreenshots(trade, session);
        if (captured && captured.length > 0) {
          setScreenshots(captured);
          setSelectedScreenshotIdx(0);
        }
      }
    } catch (e) {
      console.error('Error capturing trade screenshots:', e);
    } finally {
      setIsCapturingScreenshots(false);
    }
  };

  const handleDownloadScreenshot = (dataUrl: string, tf: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `ReplayX_${trade.instrument}_${trade.type.toUpperCase()}_${formatTimeframeBadgeLabel(tf)}_${trade.id.slice(0, 8)}.png`;
    link.click();
  };

  const syncToStore = (
    currentNotes: string,
    currentSetup: string,
    currentMistake: string,
    currentGrade: string,
    currentHits: string[]
  ) => {
    let confidence = 3;
    if (currentGrade === 'A+') confidence = 5;
    else if (currentGrade === 'A') confidence = 4;
    else if (currentGrade === 'B') confidence = 3;
    else if (currentGrade === 'C') confidence = 2;
    else if (currentGrade === 'D') confidence = 1;
    else if (currentGrade === 'F') confidence = 0;

    const store = useSimulatorStore.getState();
    store.updateTradeMetadata(trade.id, {
      notes: currentNotes,
      setupTag: currentSetup,
      mistakeTag: currentMistake,
      confidence,
      checklistHits: currentHits,
    });

    trade.notes = currentNotes;
    trade.setupTag = currentSetup;
    trade.mistakeTag = currentMistake;
    trade.grade = currentGrade as any;
    trade.confidence = confidence;
    trade.checklistHits = currentHits;
  };

  const handleToggleChecklist = (id: string) => {
    const next = checklistHits.includes(id)
      ? checklistHits.filter((item) => item !== id)
      : [...checklistHits, id];
    setChecklistHits(next);
    syncToStore(notes, setupTag, mistakeTag, grade, next);
  };

  const handleGradeChange = (newGrade: string) => {
    setGrade(newGrade);
    syncToStore(notes, setupTag, mistakeTag, newGrade, checklistHits);
  };

  const handleSetupTagChange = (newSetup: string) => {
    setSetupTag(newSetup);
    syncToStore(notes, newSetup, mistakeTag, grade, checklistHits);
  };

  const handleMistakeTagChange = (newMistake: string) => {
    setMistakeTag(newMistake);
    syncToStore(notes, setupTag, newMistake, grade, checklistHits);
  };

  const handleNotesChange = (newNotes: string) => {
    setNotes(newNotes);
    syncToStore(newNotes, setupTag, mistakeTag, grade, checklistHits);
  };

  const handleSave = () => {
    setIsSaving(true);
    syncToStore(notes, setupTag, mistakeTag, grade, checklistHits);

    setTimeout(() => {
      setIsSaving(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    }, 200);
  };

  const pnl = Number(trade.pnl || 0);
  const isWin = pnl > 0.5;
  const isLoss = pnl < -0.5;
  const pnlSign = pnl >= 0 ? '+' : '';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs transition-opacity select-none">
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-[var(--app-bg)] border-l border-[var(--border-soft)] shadow-2xl overflow-y-auto">
        {/* Header Bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-soft)] bg-[var(--surface-2)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-[var(--text-primary)]">{trade.instrument}</span>
              <span
                className={clsx(
                  'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider',
                  trade.type === 'buy'
                    ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20'
                    : 'bg-rose-500/15 text-rose-500 border border-rose-500/20'
                )}
              >
                {trade.type === 'buy' ? <ArrowUpRight size={13} className="mr-1" /> : <ArrowDownRight size={13} className="mr-1" />}
                {trade.type}
              </span>
            </div>
            <span className="text-xs font-semibold text-[var(--text-muted)] bg-[var(--surface-3)] px-2 py-0.5 rounded-md">
              {trade.timeframe.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onExportPdf(trade)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--surface-3)] hover:bg-[var(--surface-ghost)] text-[var(--text-primary)] border border-[var(--border-soft)] transition-colors cursor-pointer"
              title="Export Single Trade Autopsy PDF"
            >
              <Download size={14} />
              <span>Export PDF</span>
            </button>

            <button
              onClick={() => onReplay(trade)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--accent-1)] text-white hover:opacity-90 transition-opacity shadow-xs cursor-pointer"
            >
              <Play size={14} />
              <span>Launch Replay</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Container */}
        <div className="space-y-6 p-6">
          {/* Main Outcome Card */}
          <div className="p-5 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Realized Net PnL
                </div>
                <div
                  className={clsx(
                    'text-3xl font-black font-mono tracking-tight mt-1',
                    isWin ? 'text-emerald-500' : isLoss ? 'text-rose-500' : 'text-[var(--text-muted)]'
                  )}
                >
                  {pnlSign}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Return (R)
                </div>
                <div
                  className={clsx(
                    'text-2xl font-black font-mono mt-1',
                    trade.riskAmountDollar > 0
                      ? trade.calculatedRMultiple >= 0 ? 'text-emerald-500' : 'text-rose-500'
                      : 'text-[var(--text-muted)]'
                  )}
                >
                  {trade.riskAmountDollar > 0
                    ? `${trade.calculatedRMultiple >= 0 ? '+' : ''}${trade.calculatedRMultiple}R`
                    : '—'}
                </div>
              </div>
            </div>

            {/* Sub-row with Pips & Risk */}
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--border-soft)] pt-4 text-center text-xs">
              <div className="p-2 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)]">
                <div className="text-[11px] font-medium text-[var(--text-muted)]">Pip Result</div>
                <div className={clsx('font-bold font-mono text-sm mt-0.5', trade.pipGain >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                  {trade.pipGain >= 0 ? '+' : ''}{trade.pipGain} pips
                </div>
              </div>
              <div className="p-2 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)]">
                <div className="text-[11px] font-medium text-[var(--text-muted)]">Initial Risk</div>
                <div className="font-bold font-mono text-sm text-[var(--text-primary)] mt-0.5">
                  {trade.riskAmountDollar > 0 ? `${trade.riskAmountDollar.toFixed(2)}` : 'No SL'}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)]">
                <div className="text-[11px] font-medium text-[var(--text-muted)]">Position Size</div>
                <div className="font-bold font-mono text-sm text-[var(--text-primary)] mt-0.5">
                  {trade.size} Lots
                </div>
              </div>
            </div>
          </div>

          {/* Execution Telemetry Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--app-bg)] shadow-xs">
              <div className="text-[11px] text-[var(--text-muted)] uppercase font-bold tracking-wider">Entry Execution</div>
              <div className="text-base font-bold font-mono text-[var(--text-primary)] mt-1">
                {Number(trade.entryPrice || 0).toFixed(5)}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1.5 flex items-center gap-1">
                <Clock size={12} />
                <span>{formatTradeTime(trade.entryTime || trade.orderTime)}</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--app-bg)] shadow-xs">
              <div className="text-[11px] text-[var(--text-muted)] uppercase font-bold tracking-wider">Exit Execution</div>
              <div className="text-base font-bold font-mono text-[var(--text-primary)] mt-1">
                {Number(trade.exitPrice || 0).toFixed(5)}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1.5 flex items-center gap-1">
                <Clock size={12} />
                <span>{formatTradeTime(trade.exitTime)}</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--app-bg)] shadow-xs">
              <div className="text-[11px] text-[var(--text-muted)] uppercase font-bold tracking-wider">Stop Loss (SL)</div>
              <div className="text-base font-bold font-mono text-rose-500 mt-1">
                {trade.sl ? Number(trade.sl).toFixed(5) : 'None Set'}
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--app-bg)] shadow-xs">
              <div className="text-[11px] text-[var(--text-muted)] uppercase font-bold tracking-wider">Take Profit (TP)</div>
              <div className="text-base font-bold font-mono text-emerald-500 mt-1">
                {trade.tp ? Number(trade.tp).toFixed(5) : 'None Set'}
              </div>
            </div>
          </div>

          {/* Excursion Profile (MAE vs MFE) */}
          <div className="p-5 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] space-y-3 shadow-xs">
            <div className="text-xs font-bold text-[var(--text-primary)] flex items-center justify-between">
              <span className="uppercase tracking-wider text-[11px] text-[var(--text-muted)]">Price Excursion Profile</span>
              <span className="text-xs font-mono font-medium text-[var(--text-secondary)]">Holding: {formatDuration(trade.calculatedDurationMs)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)]">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-500 uppercase tracking-wide">
                  <Flame size={13} />
                  <span>Max Peak (MFE)</span>
                </div>
                <div className="text-lg font-bold font-mono text-teal-500 mt-1.5">
                  +${trade.mfeDollar.toFixed(2)}
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                  +{trade.mfePips.toFixed(1)} pips excursion
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)]">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-500 uppercase tracking-wide">
                  <ShieldAlert size={13} />
                  <span>Max Drawdown (MAE)</span>
                </div>
                <div className="text-lg font-bold font-mono text-rose-500 mt-1.5">
                  -${trade.maeDollar.toFixed(2)}
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                  -{trade.maePips.toFixed(1)} pips drawdown
                </div>
              </div>
            </div>
          </div>

          {/* Strategy Checklist Rules */}
          {activeStrategy && activeStrategy.checklists.length > 0 && (
            <div className="p-5 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
                <span className="uppercase tracking-wider text-[11px] text-[var(--text-muted)]">Checklist: {activeStrategy.name}</span>
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[var(--accent-1)]/10 text-[var(--accent-1)]">
                  {checklistHits.length} / {activeStrategy.checklists.length} Rules Checked
                </span>
              </div>

              <div className="space-y-2">
                {activeStrategy.checklists.map((rule) => {
                  const isHit = checklistHits.includes(rule.id);
                  return (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => handleToggleChecklist(rule.id)}
                      className={clsx(
                        'flex items-start gap-2.5 w-full p-3 rounded-xl text-left text-xs border transition-all cursor-pointer',
                        isHit
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-medium'
                          : 'bg-[var(--app-bg)] border-[var(--border-soft)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
                      )}
                    >
                      {isHit ? (
                        <CheckSquare size={15} className="shrink-0 text-emerald-500 mt-0.5" />
                      ) : (
                        <Square size={15} className="shrink-0 text-[var(--text-muted)] mt-0.5" />
                      )}
                      <span className="leading-snug">{rule.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Multi-Timeframe Screenshots Gallery */}
          <div className="p-5 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] space-y-4 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
              <div className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-[var(--text-muted)]">
                <Camera size={13} className="text-[var(--accent-1)]" />
                <span>Multi-Timeframe Screenshots</span>
              </div>
              <button
                type="button"
                onClick={handleCaptureScreenshots}
                disabled={isCapturingScreenshots}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[var(--accent-1)]/10 text-[var(--accent-1)] hover:bg-[var(--accent-1)]/20 transition-colors disabled:opacity-50 cursor-pointer"
                title="Re-render multi-timeframe screenshots for this trade"
              >
                <RefreshCw size={12} className={isCapturingScreenshots ? 'animate-spin' : ''} />
                <span>{isCapturingScreenshots ? 'Rendering...' : 'Capture Multi-TF'}</span>
              </button>
            </div>

            {screenshots.length > 0 ? (
              <div className="space-y-3">
                {/* Timeframe Badges / Selector */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {screenshots.map((s, idx) => {
                    const isSelected = selectedScreenshotIdx === idx;
                    const badge = formatTimeframeBadgeLabel(s.timeframe);
                    return (
                      <button
                        key={s.id || idx}
                        type="button"
                        onClick={() => setSelectedScreenshotIdx(idx)}
                        className={clsx(
                          'px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5',
                          isSelected
                            ? 'bg-[#2563eb] text-white shadow-sm ring-2 ring-[#2563eb]/40'
                            : 'bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] border border-[var(--border-soft)]'
                        )}
                      >
                        <span>{badge}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Screenshot Preview */}
                {screenshots[selectedScreenshotIdx] && (
                  <div className="relative rounded-xl overflow-hidden border border-[var(--border-soft)] bg-black/40 group">
                    <img
                      src={screenshots[selectedScreenshotIdx].dataUrl}
                      alt={screenshots[selectedScreenshotIdx].title}
                      className="w-full h-auto object-contain cursor-pointer hover:opacity-95 transition-opacity max-h-[360px]"
                      onClick={() => setLightboxDataUrl(screenshots[selectedScreenshotIdx].dataUrl)}
                    />

                    {/* Overlay Action Bar */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => setLightboxDataUrl(screenshots[selectedScreenshotIdx].dataUrl)}
                        className="p-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white backdrop-blur-xs transition-colors cursor-pointer"
                        title="Expand full screen"
                      >
                        <Maximize2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadScreenshot(
                            screenshots[selectedScreenshotIdx].dataUrl,
                            screenshots[selectedScreenshotIdx].timeframe
                          )
                        }
                        className="p-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white backdrop-blur-xs transition-colors cursor-pointer"
                        title="Download screenshot"
                      >
                        <Download size={13} />
                      </button>
                    </div>

                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                      <span className="text-[11px] font-mono font-bold text-white/90 bg-black/70 px-2 py-0.5 rounded backdrop-blur-xs">
                        {screenshots[selectedScreenshotIdx].title}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--app-bg)] text-center space-y-2">
                <Camera size={24} className="text-[var(--text-muted)]/60" />
                <p className="text-xs text-[var(--text-muted)]">
                  No multi-timeframe screenshots captured yet for this trade.
                </p>
                <button
                  type="button"
                  onClick={handleCaptureScreenshots}
                  disabled={isCapturingScreenshots}
                  className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--accent-1)] text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                >
                  <Camera size={13} />
                  <span>{isCapturingScreenshots ? 'Capturing...' : 'Capture Multi-Timeframe Charts'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Trade Reflection & Notes Editor */}
          <div className="p-5 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-ghost)] space-y-4 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
              <div className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-[var(--text-muted)]">
                <FileEdit size={13} className="text-[var(--accent-1)]" />
                <span>Trade Review & Lessons</span>
              </div>
              {savedSuccess && <span className="text-emerald-500 text-xs font-semibold animate-pulse">Saved Successfully ✓</span>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">Execution Grade</label>
                <select
                  value={grade}
                  onChange={(e) => handleGradeChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] text-[var(--text-primary)] text-xs font-medium focus:outline-none focus:border-[var(--accent-1)] transition-colors"
                >
                  <option value="A+">A+ (Flawless Execution)</option>
                  <option value="A">A (Disciplined Execution)</option>
                  <option value="B">B (Minor Sizing / Timing Error)</option>
                  <option value="C">C (Suboptimal Entry)</option>
                  <option value="D">D (Poor Execution)</option>
                  <option value="F">F (Ignored Invalidation)</option>
                  <option value="Ungraded">Ungraded</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">Setup Model Tag</label>
                <input
                  type="text"
                  placeholder="e.g. FVG Inversion, Order Block"
                  value={setupTag}
                  onChange={(e) => handleSetupTagChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">Mistake Flag</label>
                <input
                  type="text"
                  placeholder="e.g. FOMO, Chased, Moved SL"
                  value={mistakeTag}
                  onChange={(e) => handleMistakeTagChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">Trade Notes & Lessons</label>
              <textarea
                rows={4}
                placeholder="Document trade psychology, reasons for entry/exit, and post-trade reflections..."
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                className="w-full p-3 rounded-xl bg-[var(--app-bg)] border border-[var(--border-soft)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] resize-none transition-colors"
              />
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex w-full items-center justify-center gap-2 py-3 rounded-xl text-xs font-semibold bg-[var(--accent-1)] text-white hover:opacity-90 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Save size={14} className={isSaving ? 'animate-spin' : ''} />
              <span>{isSaving ? 'Saving Changes...' : 'Save Trade Reflections'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox Fullscreen Modal */}
      {lightboxDataUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxDataUrl(null)}
        >
          <div className="relative max-w-6xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightboxDataUrl(null)}
              className="absolute -top-10 right-0 p-2 text-white/80 hover:text-white rounded-full bg-black/50 hover:bg-black/80 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X size={20} />
            </button>
            <img
              src={lightboxDataUrl}
              alt="High Resolution Trade Screenshot"
              className="max-h-[85vh] max-w-full rounded-xl border border-white/20 shadow-2xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
