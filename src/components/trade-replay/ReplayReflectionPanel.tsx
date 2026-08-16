import React, { useState } from 'react';
import { clsx } from 'clsx';
import { EnrichedTrade, formatDuration, formatTradeTime } from '../../services/math/tradeMetrics';
import { Strategy, useSimulatorStore } from '../../store/useSimulatorStore';
import {
  Download,
  Camera,
  CheckSquare,
  Square,
  Save,
  Flame,
  ShieldAlert,
  Award,
  Layers,
  Sparkles,
  Tag,
  AlertTriangle,
  FileEdit,
} from 'lucide-react';

interface ReplayReflectionPanelProps {
  trade: EnrichedTrade;
  onExportPdf: () => void;
  onCaptureSnapshot?: () => void;
  strategies: Strategy[];
}

export default function ReplayReflectionPanel({
  trade,
  onExportPdf,
  onCaptureSnapshot,
  strategies,
}: ReplayReflectionPanelProps) {
  const [notes, setNotes] = useState(trade.notes || '');
  const [setupTag, setSetupTag] = useState(trade.setupTag || '');
  const [mistakeTag, setMistakeTag] = useState(trade.mistakeTag || '');
  const [grade, setGrade] = useState<string>(trade.grade || 'Ungraded');
  const [checklistHits, setChecklistHits] = useState<string[]>(trade.checklistHits || []);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const activeStrategy = strategies.find((s) => s.id === trade.strategyId) || strategies[0];

  // Helper to sync to store
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

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 space-y-5 bg-[var(--surface-1)] border-l border-[var(--border-soft)] select-none text-xs">
      {/* Top Action Bar */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onExportPdf}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[var(--accent-1)] text-white font-semibold shadow-xs hover:opacity-90 transition-opacity"
        >
          <Download size={14} />
          <span>Export Autopsy PDF</span>
        </button>

        {onCaptureSnapshot && (
          <button
            onClick={onCaptureSnapshot}
            className="p-2.5 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-soft)] transition-colors"
            title="Take Snapshot to Journal"
          >
            <Camera size={15} />
          </button>
        )}
      </div>

      {/* Trade Overview Card */}
      <div className="p-4 rounded-2xl bg-[var(--app-bg)] border border-[var(--border-soft)] space-y-3 shadow-2xs">
        <div className="text-[11px] uppercase font-bold tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
          <Sparkles size={12} className="text-[var(--accent-1)]" />
          <span>Trade Execution Summary</span>
        </div>

        <div className="space-y-2 text-xs divide-y divide-[var(--border-soft)]">
          <div className="flex items-center justify-between pt-1">
            <span className="text-[var(--text-muted)]">Session</span>
            <span className="font-semibold text-[var(--text-primary)] truncate max-w-[160px]" title={trade.sessionName}>
              {trade.sessionName}
            </span>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[var(--text-muted)]">Holding Time</span>
            <span className="font-semibold font-mono text-[var(--text-primary)]">
              {formatDuration(trade.calculatedDurationMs)}
            </span>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[var(--text-muted)]">Initial Risk</span>
            <span className="font-semibold font-mono text-[var(--text-primary)]">
              {trade.riskAmountDollar > 0 ? `${trade.riskAmountDollar.toFixed(2)}` : 'No SL'}
            </span>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[var(--text-muted)]">Position Size</span>
            <span className="font-semibold font-mono text-[var(--text-primary)]">{trade.size} Lots</span>
          </div>
        </div>
      </div>

      {/* Excursion Profile (MFE & MAE) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 rounded-2xl bg-[var(--app-bg)] border border-[var(--border-soft)] shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-500 uppercase tracking-wide">
            <Flame size={13} />
            <span>MFE (Peak)</span>
          </div>
          <div className="text-base font-bold font-mono text-teal-500 mt-1.5">
            +${trade.mfeDollar.toFixed(2)}
          </div>
          <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
            +{trade.mfePips.toFixed(1)} pips
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[var(--app-bg)] border border-[var(--border-soft)] shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-500 uppercase tracking-wide">
            <ShieldAlert size={13} />
            <span>MAE (Drawdown)</span>
          </div>
          <div className="text-base font-bold font-mono text-rose-500 mt-1.5">
            -${trade.maeDollar.toFixed(2)}
          </div>
          <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
            -{trade.maePips.toFixed(1)} pips
          </div>
        </div>
      </div>

      {/* Checklist Rules (Interactive) */}
      {activeStrategy && activeStrategy.checklists.length > 0 && (
        <div className="p-4 rounded-2xl bg-[var(--app-bg)] border border-[var(--border-soft)] space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-bold tracking-wider text-[var(--text-primary)]">
              {activeStrategy.name} Rules
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--accent-1)]/10 text-[var(--accent-1)]">
              {checklistHits.length}/{activeStrategy.checklists.length} Met
            </span>
          </div>

          <div className="space-y-1.5">
            {activeStrategy.checklists.map((rule) => {
              const isHit = checklistHits.includes(rule.id);
              return (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => handleToggleChecklist(rule.id)}
                  className={clsx(
                    'flex items-start gap-2.5 w-full p-2.5 rounded-xl text-left text-xs border transition-all cursor-pointer',
                    isHit
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-medium'
                      : 'bg-[var(--surface-2)]/60 border-[var(--border-soft)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
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

      {/* Reflection & Psychology Autopsy */}
      <div className="p-4 rounded-2xl bg-[var(--app-bg)] border border-[var(--border-soft)] space-y-3.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] uppercase font-bold tracking-wider text-[var(--text-primary)]">
            <FileEdit size={13} className="text-[var(--accent-1)]" />
            <span>Trade Autopsy & Psychology</span>
          </div>
          {savedSuccess && (
            <span className="inline-flex items-center gap-1 text-emerald-500 text-xs font-semibold animate-pulse">
              Saved ✓
            </span>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">
            Execution Grade
          </label>
          <select
            value={grade}
            onChange={(e) => handleGradeChange(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-soft)] text-[var(--text-primary)] text-xs font-medium focus:outline-none focus:border-[var(--accent-1)] transition-colors"
          >
            <option value="A+">Grade A+ (Flawless Execution)</option>
            <option value="A">Grade A (Disciplined)</option>
            <option value="B">Grade B (Minor Deviation)</option>
            <option value="C">Grade C (Suboptimal Entry)</option>
            <option value="D">Grade D (Hesitated / Chased)</option>
            <option value="F">Grade F (Ignored Invalidation)</option>
            <option value="Ungraded">Ungraded</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">
            Setup Model Tag
          </label>
          <input
            type="text"
            placeholder="e.g. FVG Inversion, Order Block, Asian Range Sweep"
            value={setupTag}
            onChange={(e) => handleSetupTagChange(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-soft)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] transition-colors"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">
            Mistake Flag (if any)
          </label>
          <input
            type="text"
            placeholder="e.g. FOMO, Early Exit, Moved SL, Overleveraged"
            value={mistakeTag}
            onChange={(e) => handleMistakeTagChange(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-soft)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] transition-colors"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">
            Post-Mortem Lessons & Psychology
          </label>
          <textarea
            rows={4}
            placeholder="Document what went well, emotional state during the trade, and lessons for next time..."
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            className="w-full p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-soft)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)] resize-none transition-colors"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="flex w-full items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--surface-3)] hover:bg-[var(--surface-2)] text-[var(--text-primary)] font-semibold transition-all border border-[var(--border-soft)] hover:border-[var(--accent-1)] cursor-pointer disabled:opacity-50"
        >
          <Save size={14} className={isSaving ? 'animate-spin' : ''} />
          <span>{isSaving ? 'Saving Changes...' : 'Save Autopsy'}</span>
        </button>
      </div>
    </div>
  );
}
