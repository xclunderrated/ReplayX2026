import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, RotateCcw, Globe2, Palette, Moon, Sun, ChevronDown, SlidersHorizontal, Newspaper, Minus, BarChart3, HardDrive, Download, Upload, CheckCircle2, AlertTriangle, RefreshCw, FileCheck, Layers, Database, Camera, CheckSquare, Square, type LucideIcon } from 'lucide-react';
import { useSimulatorStore, ChartColors, DEFAULT_AUTO_SCREENSHOT_TIMEFRAMES } from '../store/useSimulatorStore';
import { ColorPicker } from './ui/ColorPicker';
import { CHART_TIMEZONE_OPTIONS } from '../lib/timezone';
import { getImpactColor, type NewsImpactFilter } from '../lib/news';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'motion/react';
import {
  exportWorkspaceArchive,
  triggerDownloadBackup,
  validateBackupFile,
  importWorkspaceArchive,
  ValidationResult,
  RestoreMode,
  BACKUP_FILE_EXTENSION,
} from '../services/localBackupService';

type SettingsTab = 'general' | 'screenshots' | 'data' | 'news' | 'colors' | 'backup';

const TABS: { id: SettingsTab; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'General', hint: 'Timezone & theme', icon: Globe2 },
  { id: 'screenshots', label: 'Auto Screenshot', hint: 'Multi-TF trade capture', icon: Camera },
  { id: 'data', label: 'Data', hint: 'Market data source', icon: BarChart3 },
  { id: 'news', label: 'News', hint: 'News lines & filter', icon: Newspaper },
  { id: 'colors', label: 'Chart Colors', hint: 'Appearance', icon: Palette },
  { id: 'backup', label: 'Local Backup', hint: 'Export & import workspace', icon: HardDrive },
];

const NEWS_IMPACT_FILTERS: Array<{ value: NewsImpactFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Med' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'Other' },
];

const COLOR_RE = /^(#([0-9a-f]{3}|[0-9a-f]{6})|rgba?\([^)]*\)|transparent|linear-gradient\([^)]*\))$/i;

const COLOR_GROUPS: { title: string; items: { key: keyof ChartColors; label: string }[] }[] = [
  {
    title: 'Background & Text',
    items: [
      { key: 'background', label: 'Chart Background' },
      { key: 'text', label: 'Text Color' },
    ],
  },
  {
    title: 'Grid Lines',
    items: [
      { key: 'gridVert', label: 'Vertical Grid' },
      { key: 'gridHorz', label: 'Horizontal Grid' },
    ],
  },
  {
    title: 'Scales',
    items: [
      { key: 'timeScaleBorder', label: 'Time Scale Border' },
      { key: 'priceScaleBorder', label: 'Price Scale Border' },
    ],
  },
  {
    title: 'Candles',
    items: [
      { key: 'upColor', label: 'Up Candle' },
      { key: 'downColor', label: 'Down Candle' },
      { key: 'wickUpColor', label: 'Wick Up' },
      { key: 'wickDownColor', label: 'Wick Down' },
      { key: 'borderUpColor', label: 'Border Up' },
      { key: 'borderDownColor', label: 'Border Down' },
    ],
  },
  {
    title: 'Crosshair',
    items: [
      { key: 'crosshairVert', label: 'Vertical Line' },
      { key: 'crosshairHorz', label: 'Horizontal Line' },
    ],
  },
  {
    title: 'Indicator Lines',
    items: [
      { key: 'indicatorLine1', label: 'Line 1' },
      { key: 'indicatorLine2', label: 'Line 2' },
      { key: 'indicatorLine3', label: 'Line 3' },
      { key: 'indicatorLine4', label: 'Line 4' },
      { key: 'indicatorLine5', label: 'Line 5' },
    ],
  },
];

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-overlay)]">
    <h4 className="border-b border-[var(--border-soft)] px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
      {title}
    </h4>
    <div className="space-y-0.5 p-3">{children}</div>
  </div>
);

const SelectRow: React.FC<{ label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }> = ({
  label,
  value,
  options,
  onChange,
}) => (
  <div>
    <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-2.5 pr-10 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-1)] focus:ring-1 focus:ring-[var(--accent-1)]/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[var(--app-bg)] text-[var(--text-primary)]">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
    </div>
  </div>
);

const ToggleRow: React.FC<{ label: string; description: React.ReactNode; checked: boolean; onChange: (value: boolean) => void }> = ({
  label,
  description,
  checked,
  onChange,
}) => (
  <div className="flex items-start justify-between gap-4 py-1">
    <div className="min-w-0">
      <label className="block text-xs font-semibold text-[var(--text-primary)]">{label}</label>
      <div className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-muted)]">{description}</div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${
        checked
          ? 'border-[var(--accent-1)]/40 bg-[var(--accent-1)]/80'
          : 'border-[var(--border-strong)] bg-[var(--surface-3)]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-[18px] w-[18px] rounded-full shadow transition-all ${
          checked ? 'left-[22px] bg-[var(--accent-contrast)]' : 'left-0.5 bg-white'
        }`}
      />
    </button>
  </div>
);

const ColorRow: React.FC<{ label: string; value: string; onChange: (value: string) => void; gradient?: boolean }> = ({ label, value, onChange, gradient = false }) => {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!COLOR_RE.test(trimmed)) {
      setDraft(value);
      return;
    }
    setDraft(trimmed);
    onChange(trimmed);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-[var(--surface-2)]">
      <label className="text-[13px] font-medium text-[var(--text-secondary)]">{label}</label>
      <div className="flex items-center gap-2.5">
        <ColorPicker color={value} onChange={onChange} align="right" gradient={gradient} />
        <input
          type="text"
          value={focused ? draft : value}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          spellCheck={false}
          className="w-28 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-1)] px-2.5 py-1.5 text-center font-mono text-xs text-[var(--text-secondary)] uppercase outline-none transition-colors focus:border-[var(--accent-1)] focus:ring-1 focus:ring-[var(--accent-1)]/20"
        />
      </div>
    </div>
  );
};

export const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const {
    chartColors,
    gridVertLinesVisible,
    gridHorzLinesVisible,
    setGridVertLinesVisible,
    setGridHorzLinesVisible,
    chartTimezone,
    theme,
    setChartColors,
    resetChartColors,
    setChartTimezone,
    setTheme,
    newsImpactFilter,
    setNewsImpactFilter,
    newsLineOpacity,
    setNewsLineOpacity,
    useSyntheticSeconds,
    setUseSyntheticSeconds,
    autoScreenshotEnabled,
    setAutoScreenshotEnabled,
    autoScreenshotTimeframes,
    setTimeframeAutoScreenshot,
    setAllAutoScreenshotTimeframes,
    autoScreenshotSaveToJournal,
    setAutoScreenshotSaveToJournal,
    autoOpenLastTradeScreenshots,
    setAutoOpenLastTradeScreenshots,
  } = useSimulatorStore(
    useShallow((state) => ({
      chartColors: state.chartColors,
      gridVertLinesVisible: state.gridVertLinesVisible,
      gridHorzLinesVisible: state.gridHorzLinesVisible,
      setGridVertLinesVisible: state.setGridVertLinesVisible,
      setGridHorzLinesVisible: state.setGridHorzLinesVisible,
      chartTimezone: state.chartTimezone,
      theme: state.theme,
      setChartColors: state.setChartColors,
      resetChartColors: state.resetChartColors,
      setChartTimezone: state.setChartTimezone,
      setTheme: state.setTheme,
      newsImpactFilter: state.newsImpactFilter,
      setNewsImpactFilter: state.setNewsImpactFilter,
      newsLineOpacity: state.newsLineOpacity,
      setNewsLineOpacity: state.setNewsLineOpacity,
      useSyntheticSeconds: state.useSyntheticSeconds,
      setUseSyntheticSeconds: state.setUseSyntheticSeconds,
      autoScreenshotEnabled: state.autoScreenshotEnabled ?? true,
      setAutoScreenshotEnabled: state.setAutoScreenshotEnabled,
      autoScreenshotTimeframes: state.autoScreenshotTimeframes || DEFAULT_AUTO_SCREENSHOT_TIMEFRAMES,
      setTimeframeAutoScreenshot: state.setTimeframeAutoScreenshot,
      setAllAutoScreenshotTimeframes: state.setAllAutoScreenshotTimeframes,
      autoScreenshotSaveToJournal: state.autoScreenshotSaveToJournal ?? true,
      setAutoScreenshotSaveToJournal: state.setAutoScreenshotSaveToJournal,
      autoOpenLastTradeScreenshots: state.autoOpenLastTradeScreenshots ?? true,
      setAutoOpenLastTradeScreenshots: state.setAutoOpenLastTradeScreenshots,
    }))
  );
  const [tab, setTab] = useState<SettingsTab>('general');
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null);

  // Backup & Restore states
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('replace');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccessMsg(null);
    try {
      const { jsonString, filename } = await exportWorkspaceArchive();
      triggerDownloadBackup(jsonString, filename);
      setExportSuccessMsg(`Exported backup: ${filename}`);
      setTimeout(() => setExportSuccessMsg(null), 5000);
    } catch (err: any) {
      alert('Export failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  };

  const processSelectedFile = async (file: File) => {
    setSelectedFileName(file.name);
    setValidating(true);
    setValidationResult(null);
    setConfirmReplace(false);
    try {
      const content = await file.text();
      const result = await validateBackupFile(content);
      setValidationResult(result);
    } catch (err: any) {
      setValidationResult({
        valid: false,
        error: 'Failed to read file: ' + (err?.message || 'File error'),
      });
    } finally {
      setValidating(false);
    }
  };

  const executeRestore = async () => {
    if (!validationResult?.archive) return;
    setIsRestoring(true);
    setConfirmReplace(false);
    setRestoreSuccessMsg(null);
    const result = await importWorkspaceArchive(validationResult.archive, restoreMode);
    setIsRestoring(false);
    if (result.success) {
      setRestoreSuccessMsg('Workspace restored successfully!');
      setValidationResult(null);
      setSelectedFileName(null);
      setTimeout(() => setRestoreSuccessMsg(null), 5000);
    } else {
      alert('Import failed: ' + result.error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setPos(null);
      return;
    }
    setMinimized(false);
    setPos(null);
  }, [isOpen]);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const win = windowRef.current;
    if (!win) return;
    const rect = win.getBoundingClientRect();
    setPos({ x: rect.left, y: rect.top });
    dragRef.current = { startX: e.clientX, startY: e.clientY, winX: rect.left, winY: rect.top };
    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !win) return;
      const w = win.offsetWidth;
      const h = win.offsetHeight;
      const x = Math.min(Math.max(drag.winX + (ev.clientX - drag.startX), -w + 80), window.innerWidth - 80);
      const y = Math.min(Math.max(drag.winY + (ev.clientY - drag.startY), -h + 60), window.innerHeight - 60);
      setPos({ x, y });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  const handleColorChange = (key: keyof ChartColors) => (value: string) => {
    setChartColors({ [key]: value });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
          {!minimized ? (
            <motion.div
              ref={windowRef}
              role="dialog"
              aria-modal="true"
              aria-label="Settings"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[min(85vh,calc(100vh-32px))] w-[640px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] shadow-[var(--aura-shadow-strong)]"
              style={pos ? { position: 'absolute', left: pos.x, top: pos.y } : undefined}
            >
              {/* Header (drag handle) */}
              <div
                onPointerDown={onHeaderPointerDown}
                className="flex shrink-0 cursor-grab touch-none select-none items-center justify-between border-b border-[var(--border-soft)] px-5 py-4 active:cursor-grabbing"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--accent-1)]/35 bg-[color-mix(in_srgb,var(--accent-1)_12%,transparent)] text-[var(--accent-1)]">
                    <SlidersHorizontal size={16} />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-bold tracking-tight text-[var(--text-primary)]">Settings</h2>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">Customize your workspace</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setMinimized(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                    title="Minimize"
                  >
                    <Minus size={16} />
                  </button>
                  <button
                    onClick={onClose}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                    title="Close (Esc)"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

            {/* Body: tab rail + content */}
            <div className="flex min-h-0 flex-1">
              {/* Tab rail */}
              <div className="flex w-44 shrink-0 flex-col gap-1 border-r border-[var(--border-soft)] bg-[var(--surface-overlay)] p-3">
                {TABS.map((item) => {
                  const isActive = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setTab(item.id)}
                      className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-150 ${
                        isActive
                          ? 'border-[var(--accent-1)]/30 bg-[color-mix(in_srgb,var(--accent-1)_10%,transparent)] text-[var(--accent-1)]'
                          : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <item.icon size={15} strokeWidth={isActive ? 2.4 : 2} />
                      <span className="min-w-0">
                        <span className={`block text-xs leading-tight ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                        <span className="block truncate text-[10px] leading-tight text-[var(--text-muted)]">{item.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Content */}
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {tab === 'general' ? (
                  <div className="space-y-4">
                    <SectionCard title="Time Zone">
                      <SelectRow
                        label="Chart time scale + crosshair"
                        value={chartTimezone}
                        options={CHART_TIMEZONE_OPTIONS}
                        onChange={(value) => setChartTimezone(value as typeof chartTimezone)}
                      />
                    </SectionCard>

                    <SectionCard title="Interface Theme">
                      <div className="flex gap-1.5 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] p-1">
                        {(
                          [
                            { id: 'dark', label: 'Dark', icon: Moon },
                            { id: 'light', label: 'Light', icon: Sun },
                          ] as const
                        ).map((mode) => {
                          const isActive = theme === mode.id;
                          return (
                            <button
                              key={mode.id}
                              onClick={() => setTheme(mode.id)}
                              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-150 ${
                                isActive
                                  ? 'bg-[var(--accent-1)]/15 text-[var(--accent-1)] ring-1 ring-inset ring-[var(--accent-1)]/30'
                                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              <mode.icon size={13} />
                              {mode.label} Mode
                            </button>
                          );
                        })}
                      </div>
                    </SectionCard>
                  </div>
                ) : tab === 'data' ? (
                  <div className="space-y-4">
                    <SectionCard title="Market Data">
                      <ToggleRow
                        label="Synthetic sub-minute candles (5s / 15s / 30s / tick)"
                        checked={useSyntheticSeconds}
                        onChange={(value) => {
                          setUseSyntheticSeconds(value);
                        }}
                        description={
                          <>
                            <p className="mb-1">
                              <span className="font-semibold text-[var(--text-secondary)]">OFF — default — </span>
                              downloads real 1-second tick data from Dukascopy and aggregates true sub-minute
                              candles. Slower first load and range-limited (tick/1s: 3 days, 5s: 30 days, 15s:
                              45 days, 30s: 60 days).
                            </p>
                            <p>
                              <span className="font-semibold text-[var(--text-secondary)]">ON — </span>
                              5s/15s/30s (and tick) candles are reconstructed from real 1-minute candles by
                              interpolation. The open/high/low/close path <em>inside</em> each minute is an
                              estimate, not market-recorded prices — each sub-candle is clamped to the real 1m
                              high/low, so the chart re-aggregates to exact 1m candles. Instant loading, any
                              date range. Toggling reloads the current sub-minute session.
                            </p>
                          </>
                        }
                      />
                    </SectionCard>
                  </div>
                ) : tab === 'news' ? (
                  <div className="space-y-4">
                    <SectionCard title="News Lines">
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                            Impact filter <span className="font-normal opacity-70">(applies to chart lines, markers & panel)</span>
                          </label>
                          <div className="flex gap-1.5 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] p-1">
                            {NEWS_IMPACT_FILTERS.map((item) => {
                              const isActive = newsImpactFilter === item.value;
                              return (
                                <button
                                  key={item.value}
                                  onClick={() => setNewsImpactFilter(item.value)}
                                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-all duration-150 ${
                                    isActive
                                      ? 'bg-[var(--accent-1)]/15 text-[var(--accent-1)] ring-1 ring-inset ring-[var(--accent-1)]/30'
                                      : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
                                  }`}
                                >
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{ background: item.value === 'all' ? 'var(--text-muted)' : getImpactColor(item.value) }}
                                  />
                                  {item.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="mb-1.5 flex items-center justify-between">
                            <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                              <Newspaper size={12} />
                              Line opacity
                            </label>
                            <span className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--text-primary)]">
                              {Math.round(newsLineOpacity * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.05}
                            max={1}
                            step={0.05}
                            value={newsLineOpacity}
                            onChange={(e) => setNewsLineOpacity(Number(e.target.value))}
                            className="w-full accent-[var(--accent-1)]"
                          />
                          <div className="mt-1 flex justify-between text-[9px] font-mono text-[var(--text-muted)]">
                            <span>Faint</span>
                            <span>Solid</span>
                          </div>
                        </div>
                      </div>
                    </SectionCard>
                  </div>
                ) : tab === 'screenshots' ? (
                  <div className="space-y-4">
                    <SectionCard title="Trade Auto-Screenshot Engine">
                      <div className="space-y-3">
                        <ToggleRow
                          label="Auto-Capture on Trade Close"
                          description="Automatically generate high-resolution candlestick chart screenshots across selected timeframes whenever a position is closed."
                          checked={autoScreenshotEnabled}
                          onChange={setAutoScreenshotEnabled}
                        />

                        <ToggleRow
                          label="Auto-Open Panel on Trade Close"
                          description="Automatically slide open the Last Trade Screenshots side panel whenever a position is closed."
                          checked={autoOpenLastTradeScreenshots}
                          onChange={setAutoOpenLastTradeScreenshots}
                        />

                        <ToggleRow
                          label="Save Directly to Trade Journal"
                          description="Automatically add each captured timeframe chart into the Journal tab with execution metrics, entry/exit levels, and session tags."
                          checked={autoScreenshotSaveToJournal}
                          onChange={setAutoScreenshotSaveToJournal}
                        />
                      </div>
                    </SectionCard>

                    <SectionCard title="Capture Timeframes">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-[var(--text-muted)]">
                            Select the timeframes to capture when each trade closes:
                          </p>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setAllAutoScreenshotTimeframes(true)}
                              className="px-2 py-1 text-[10px] font-semibold text-[var(--accent-1)] hover:bg-[var(--surface-2)] rounded border border-[var(--border-soft)] transition-colors cursor-pointer"
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onClick={() => setAllAutoScreenshotTimeframes(false)}
                              className="px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-2)] rounded border border-[var(--border-soft)] transition-colors cursor-pointer"
                            >
                              Clear All
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                          {[
                            { key: '5s', label: '5 Seconds', badge: '5S', category: 'Sub-minute' },
                            { key: '15s', label: '15 Seconds', badge: '15S', category: 'Sub-minute' },
                            { key: '30s', label: '30 Seconds', badge: '30S', category: 'Sub-minute' },
                            { key: '1m', label: '1 Minute', badge: '1M', category: 'Standard' },
                            { key: '5m', label: '5 Minutes', badge: '5M', category: 'Standard' },
                            { key: '15m', label: '15 Minutes', badge: '15M', category: 'Standard' },
                            { key: '30m', label: '30 Minutes', badge: '30M', category: 'Standard' },
                            { key: '1h', label: '1 Hour', badge: '1H', category: 'Higher TF' },
                            { key: '4h', label: '4 Hours', badge: '4H', category: 'Higher TF' },
                            { key: '1D', label: '1 Day (Daily)', badge: '1D', category: 'Higher TF' },
                            { key: '1W', label: '1 Week (Weekly)', badge: '1W', category: 'Higher TF' },
                          ].map((tf) => {
                            const isChecked = Boolean(autoScreenshotTimeframes[tf.key]);
                            return (
                              <button
                                key={tf.key}
                                type="button"
                                onClick={() => setTimeframeAutoScreenshot(tf.key, !isChecked)}
                                className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                  isChecked
                                    ? 'border-[var(--accent-1)] bg-[var(--accent-1)]/10 text-[var(--text-primary)]'
                                    : 'border-[var(--border-soft)] bg-[var(--surface-2)]/50 text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]'
                                }`}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                                        isChecked
                                          ? 'bg-[var(--accent-1)] text-[var(--accent-contrast)]'
                                          : 'bg-[var(--surface-3)] text-[var(--text-muted)]'
                                      }`}
                                    >
                                      {tf.badge}
                                    </span>
                                    <span className="text-[12px] font-medium truncate">{tf.label}</span>
                                  </div>
                                </div>
                                <div className="shrink-0">
                                  {isChecked ? (
                                    <CheckSquare size={16} className="text-[var(--accent-1)]" />
                                  ) : (
                                    <Square size={16} className="text-[var(--text-muted)]/50" />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <p className="text-[11px] text-[var(--text-muted)] pt-1">
                          Charts include full entry/exit markers, stop loss & take profit price lines, risk:reward annotations, profit/loss watermark, and high-visibility timeframe indicator pills.
                        </p>
                      </div>
                    </SectionCard>
                  </div>
                ) : tab === 'backup' ? (
                  <div className="space-y-4">
                    {/* Status notifications */}
                    {exportSuccessMsg && (
                      <div className="flex items-center gap-2 rounded-xl bg-[#089981]/15 border border-[#089981]/30 p-3 text-xs font-semibold text-[#089981]">
                        <CheckCircle2 size={16} className="shrink-0" />
                        <span>{exportSuccessMsg}</span>
                      </div>
                    )}
                    {restoreSuccessMsg && (
                      <div className="flex items-center gap-2 rounded-xl bg-[#089981]/15 border border-[#089981]/30 p-3 text-xs font-semibold text-[#089981]">
                        <CheckCircle2 size={16} className="shrink-0" />
                        <span>{restoreSuccessMsg}</span>
                      </div>
                    )}

                    {/* Export Card */}
                    <SectionCard title="Export Local Workspace Backup">
                      <div className="space-y-3">
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                          Export your complete ReplayX workspace (sessions, trade history, journal entries, screenshots, drawings, strategies, settings) into a portable <code className="text-[#2962ff]">{BACKUP_FILE_EXTENSION}</code> file.
                        </p>
                        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-soft)]">
                          <div className="text-[11px] text-[var(--text-muted)]">
                            Last Export: <strong className="text-[var(--text-primary)]">{localStorage.getItem('replayx_last_export_at') ? new Date(parseInt(localStorage.getItem('replayx_last_export_at')!, 10)).toLocaleString() : 'Never'}</strong>
                          </div>
                          <button
                            type="button"
                            onClick={handleExport}
                            disabled={isExporting}
                            className="flex items-center gap-1.5 rounded-xl bg-[#2962ff] hover:bg-[#1e4bd8] disabled:opacity-50 text-white text-xs font-bold py-2 px-3.5 transition-colors cursor-pointer shadow-sm"
                          >
                            {isExporting ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                            <span>{isExporting ? 'Exporting...' : 'Export Backup'}</span>
                          </button>
                        </div>
                      </div>
                    </SectionCard>

                    {/* Import Card */}
                    <SectionCard title="Import Workspace Backup">
                      <div className="space-y-3">
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                          Restore a previously exported ReplayX archive file.
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".replayx,.json"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) processSelectedFile(file);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-1)] hover:border-[var(--border-strong)] p-3 text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
                        >
                          <FileCheck size={16} className="text-[#089981]" />
                          <span>{selectedFileName ? selectedFileName : 'Select ReplayX Backup File'}</span>
                        </button>

                        {validating && (
                          <div className="flex items-center gap-2 text-xs font-semibold text-[#2962ff] bg-[#2962ff]/10 border border-[#2962ff]/20 rounded-xl p-2.5">
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Validating backup file integrity...</span>
                          </div>
                        )}

                        {validationResult && !validating && (
                          <div className="space-y-3 pt-1">
                            {validationResult.valid ? (
                              <div className="rounded-xl border border-[#089981]/30 bg-[#089981]/10 p-3 space-y-2 text-xs">
                                <div className="font-bold text-[#089981] flex items-center justify-between">
                                  <span className="flex items-center gap-1.5"><CheckCircle2 size={15} /> Valid ReplayX Archive (Schema v{validationResult.schemaVersion})</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                                  <div className="bg-[var(--surface-1)] rounded p-1.5">
                                    <span className="text-[var(--text-muted)] block">Sessions:</span>
                                    <strong className="text-[var(--text-primary)] font-bold">{(validationResult.summary?.sessionCount || 0) + (validationResult.summary?.archivedSessionCount || 0)}</strong>
                                  </div>
                                  <div className="bg-[var(--surface-1)] rounded p-1.5">
                                    <span className="text-[var(--text-muted)] block">Trades:</span>
                                    <strong className="text-[var(--text-primary)] font-bold">{validationResult.summary?.tradeCount || 0}</strong>
                                  </div>
                                  <div className="bg-[var(--surface-1)] rounded p-1.5">
                                    <span className="text-[var(--text-muted)] block">Screenshots:</span>
                                    <strong className="text-[var(--text-primary)] font-bold">{validationResult.summary?.screenshotCount || 0}</strong>
                                  </div>
                                </div>

                                <div className="space-y-1.5 pt-1">
                                  <label className="block text-[11px] font-bold text-[var(--text-primary)]">Restore Option:</label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setRestoreMode('replace')}
                                      className={`rounded-lg border p-2 text-left text-[11px] cursor-pointer ${restoreMode === 'replace' ? 'border-[#089981] bg-[#089981]/20 font-bold text-[var(--text-primary)]' : 'border-[var(--border-soft)] bg-[var(--surface-1)] text-[var(--text-muted)]'}`}
                                    >
                                      Replace Workspace
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRestoreMode('merge')}
                                      className={`rounded-lg border p-2 text-left text-[11px] cursor-pointer ${restoreMode === 'merge' ? 'border-[#2962ff] bg-[#2962ff]/20 font-bold text-[var(--text-primary)]' : 'border-[var(--border-soft)] bg-[var(--surface-1)] text-[var(--text-muted)]'}`}
                                    >
                                      Merge / Append
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (restoreMode === 'replace') setConfirmReplace(true);
                                      else executeRestore();
                                    }}
                                    disabled={isRestoring}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#089981] hover:bg-[#067a67] text-white text-xs font-bold py-2 px-3 transition-colors cursor-pointer shadow-sm mt-2"
                                  >
                                    {isRestoring ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
                                    <span>Restore Workspace</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-[#f23645]/30 bg-[#f23645]/10 p-2.5 text-xs text-[#f23645]">
                                <span className="font-bold">Invalid Backup: </span>{validationResult.error}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </SectionCard>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {COLOR_GROUPS.map((group) => (
                      <SectionCard key={group.title} title={group.title}>
                        {group.title === 'Grid Lines' && (
                          <div className="space-y-1 pb-1">
                            <ToggleRow
                              label="Vertical grid lines"
                              description="Display vertical lines at time-scale marks."
                              checked={gridVertLinesVisible}
                              onChange={setGridVertLinesVisible}
                            />
                            <ToggleRow
                              label="Horizontal grid lines"
                              description="Display horizontal lines at price-scale marks."
                              checked={gridHorzLinesVisible}
                              onChange={setGridHorzLinesVisible}
                            />
                          </div>
                        )}
                        {group.items.map((item) => (
                          <ColorRow
                            key={item.key}
                            label={item.label}
                            value={chartColors[item.key]}
                            onChange={handleColorChange(item.key)}
                            gradient={item.key === 'background'}
                          />
                        ))}
                      </SectionCard>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-[var(--border-soft)] px-5 py-3">
              <button
                onClick={resetChartColors}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--accent-1)]"
                title="Reset all chart colors to default"
              >
                <RotateCcw size={13} />
                <span>Reset colors</span>
              </button>
              <button
                onClick={onClose}
                className="rounded-xl bg-[var(--accent-1)] px-5 py-2 text-xs font-bold text-[var(--accent-contrast)] transition-all hover:brightness-110"
              >
                Done
              </button>
            </div>
          </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-6 right-6 flex items-center gap-1 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] p-1.5 pl-3 shadow-[var(--aura-shadow-strong)]"
            >
              <button
                onClick={() => setMinimized(false)}
                className="flex items-center gap-2 py-1 pr-1 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:text-[var(--accent-1)]"
                title="Restore settings"
              >
                <SlidersHorizontal size={14} className="text-[var(--accent-1)]" />
                <span>Settings</span>
              </button>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                title="Close (Esc)"
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
};
