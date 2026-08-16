import React, { useState } from 'react';
import {
  X,
  Sliders,
  TrendingUp,
  Hash,
  Trash2,
  Copy,
  Plus,
  RotateCcw,
  Check,
  Calculator,
} from 'lucide-react';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import type { StrokeStyle } from '../../lib/drawings/types';
import { getDrawingToolDefinition } from '../../lib/drawings/tools';
import { calculateDrawingMetrics } from '../../lib/drawings/calculations';
import { getPipSize, getInstrumentSpec } from '../../lib/orders';
import { getDefaultToolPreset } from '../../lib/drawings/defaults';

interface DrawingSettingsModalProps {
  drawingId: string | null;
  onClose: () => void;
}

const COLOR_PALETTE = [
  '#2962ff', // Electric Blue
  '#089981', // Emerald Green
  '#22c55e', // Bright Green
  '#f23645', // Coral Red
  '#e11d48', // Rose
  '#f59e0b', // Amber / Gold
  '#ff9800', // Deep Orange
  '#ab47bc', // Purple
  '#00bcd4', // Cyan
  '#787b86', // Slate Gray
  '#f8fafc', // Soft White
  '#131722', // Dark Charcoal
];

const STANDARD_FIB_LEVELS = [
  { level: 0, label: '0.0% (Base)', defaultColor: '#787b86' },
  { level: 0.236, label: '23.6%', defaultColor: '#787b86' },
  { level: 0.382, label: '38.2%', defaultColor: '#00bcd4' },
  { level: 0.5, label: '50.0% (Equilibrium)', defaultColor: '#2962ff' },
  { level: 0.618, label: '61.8% (Golden Pocket)', defaultColor: '#f59e0b' },
  { level: 0.786, label: '78.6%', defaultColor: '#ab47bc' },
  { level: 1.0, label: '100.0% (Full)', defaultColor: '#787b86' },
  { level: 1.272, label: '127.2% (Extension)', defaultColor: '#089981' },
  { level: 1.414, label: '141.4% (Extension)', defaultColor: '#089981' },
  { level: 1.618, label: '161.8% (Golden Extension)', defaultColor: '#22c55e' },
  { level: 2.0, label: '200.0% (Target 2)', defaultColor: '#22c55e' },
  { level: 2.618, label: '261.8% (Target 3)', defaultColor: '#22c55e' },
];

export const DrawingSettingsModal: React.FC<DrawingSettingsModalProps> = ({ drawingId, onClose }) => {
  const currentSessionId = useSimulatorStore((s) => s.currentSessionId);
  const session = useSimulatorStore((s) => s.sessions.find((sess) => sess.id === currentSessionId));
  const updateDrawingObject = useSimulatorStore((s) => s.updateDrawingObject);
  const deleteDrawingObjects = useSimulatorStore((s) => s.deleteDrawingObjects);
  const duplicateSelectedDrawings = useSimulatorStore((s) => s.duplicateSelectedDrawings);

  const [activeTab, setActiveTab] = useState<'style' | 'coordinates' | 'fib' | 'position' | 'metrics'>('style');
  const [customFibInput, setCustomFibInput] = useState('');

  if (!drawingId || !session) return null;

  const drawing = (session.drawingDocument?.objects || []).find((o) => o.id === drawingId);
  if (!drawing) return null;

  const toolDef = getDrawingToolDefinition(drawing.tool);
  const instrument = session.instrument || 'EURUSD';
  const pipSize = getPipSize(instrument);
  const spec = getInstrumentSpec(instrument);
  const metrics = calculateDrawingMetrics(
    drawing,
    instrument,
    session.balance || 10000,
    1.0,
    session.data
  );

  const hasFill = [
    'rectangle',
    'parallelChannel',
    'longPosition',
    'shortPosition',
    'measure',
    'circle',
    'ellipse',
    'triangle',
    'rotatedRectangle',
    'disjointChannel',
    'fibRetracement',
    'fibExtension',
    'fibChannel',
    'gannBox',
    'andrewsPitchfork',
    'schiffPitchfork',
  ].includes(drawing.tool);

  const isFibTool = drawing.tool === 'fibRetracement' || drawing.tool === 'fibExtension' || drawing.tool === 'fibChannel';
  const isPositionTool = drawing.tool === 'longPosition' || drawing.tool === 'shortPosition';

  const updateStyle = (updates: Partial<typeof drawing.style>) => {
    updateDrawingObject(drawing.id, {
      style: {
        ...drawing.style,
        ...updates,
      },
    });
  };

  const updatePointPrice = (index: number, newPrice: number) => {
    const nextPoints = [...drawing.points];
    if (nextPoints[index]) {
      nextPoints[index] = {
        ...nextPoints[index],
        price: Number(newPrice.toFixed(spec.digits)),
      };
      updateDrawingObject(drawing.id, { points: nextPoints });
    }
  };

  const nudgePointPrice = (index: number, pipsDelta: number) => {
    const currentPrice = drawing.points[index]?.price ?? 0;
    const nextPrice = currentPrice + pipsDelta * pipSize;
    updatePointPrice(index, nextPrice);
  };

  const toggleFibLevel = (lvl: number) => {
    const currentLevels = drawing.style.fibLevels || [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    const exists = currentLevels.includes(lvl);
    const nextLevels = exists
      ? currentLevels.filter((l) => l !== lvl)
      : [...currentLevels, lvl].sort((a, b) => a - b);
    updateStyle({ fibLevels: nextLevels });
  };

  const setFibLevelColor = (lvl: number, color: string) => {
    const currentColors = drawing.style.fibColors || {};
    updateStyle({
      fibColors: {
        ...currentColors,
        [lvl]: color,
      },
    });
  };

  const handleAddCustomFibLevel = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customFibInput);
    if (!isNaN(val)) {
      const currentLevels = drawing.style.fibLevels || [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      if (!currentLevels.includes(val)) {
        updateStyle({ fibLevels: [...currentLevels, val].sort((a, b) => a - b) });
      }
      setCustomFibInput('');
    }
  };

  const handleResetDefaults = () => {
    const preset = getDefaultToolPreset(drawing.tool);
    updateDrawingObject(drawing.id, {
      style: { ...preset.style },
    });
  };

  const activeFibLevels = drawing.style.fibLevels || [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        id="drawing-settings-modal-dialog"
        className="w-full max-w-xl bg-[var(--surface-panel)] border border-[var(--border-panel-strong)] rounded-xl shadow-2xl overflow-hidden flex flex-col text-[var(--text-primary)] text-sm animate-in zoom-in-95 duration-150 max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-panel)] bg-[var(--surface-1)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--surface-chip)] border border-[var(--border-panel)] flex items-center justify-center text-[var(--text-primary)]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                {toolDef?.label || drawing.tool} Settings
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Configure style, coordinates, and precision metrics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-2 border-b border-[var(--border-panel)] bg-[var(--surface-1)] overflow-x-auto">
          <button
            onClick={() => setActiveTab('style')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-semibold transition-colors ${
              activeTab === 'style'
                ? 'border-[var(--accent-1)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Style</span>
          </button>

          {isFibTool && (
            <button
              onClick={() => setActiveTab('fib')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-semibold transition-colors ${
                activeTab === 'fib'
                  ? 'border-[var(--accent-1)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Fib Levels</span>
            </button>
          )}

          {isPositionTool && (
            <button
              onClick={() => setActiveTab('position')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-semibold transition-colors ${
                activeTab === 'position'
                  ? 'border-[var(--accent-1)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Risk & Position</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('coordinates')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-semibold transition-colors ${
              activeTab === 'coordinates'
                ? 'border-[var(--accent-1)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            <span>Coordinates</span>
          </button>

          <button
            onClick={() => setActiveTab('metrics')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-semibold transition-colors ${
              activeTab === 'metrics'
                ? 'border-[var(--accent-1)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Calculations</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB 1: STYLE */}
          {activeTab === 'style' && (
            <div className="space-y-4">
              {/* Line & Stroke Settings */}
              <div className="p-4 rounded-lg bg-[var(--surface-inset)] border border-[var(--border-panel)] space-y-3.5">
                <div className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                  Line & Stroke
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Line Color */}
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1.5">Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={drawing.style.strokeColor || '#2962ff'}
                        onChange={(e) => updateStyle({ strokeColor: e.target.value })}
                        className="w-8 h-8 rounded-md cursor-pointer border border-white/20 bg-transparent"
                      />
                      <span className="font-mono text-xs text-[var(--text-secondary)]">
                        {drawing.style.strokeColor || '#2962ff'}
                      </span>
                    </div>
                  </div>

                  {/* Line Width */}
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1.5">
                      Thickness ({drawing.style.strokeWidth || 2}px)
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 6].map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => updateStyle({ strokeWidth: w })}
                          className={`flex-1 py-1.5 rounded-md border text-xs font-mono transition-colors ${
                            (drawing.style.strokeWidth || 2) === w
                              ? 'border-[var(--border-panel-strong)] bg-[var(--surface-chip)] text-[var(--text-primary)] font-bold'
                              : 'border-[var(--border-panel)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)]'
                          }`}
                        >
                          {w}px
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Line Style (Solid, Dashed, Dotted) */}
                <div>
                  <label className="text-xs text-[var(--text-muted)] block mb-1.5">Stroke Pattern</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['solid', 'dashed', 'dotted'] as StrokeStyle[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => updateStyle({ strokeStyle: st })}
                        className={`flex items-center justify-center gap-2 py-2 rounded-md border text-xs capitalize transition-colors ${
                          (drawing.style.strokeStyle || 'solid') === st
                            ? 'border-[var(--border-panel-strong)] bg-[var(--surface-chip)] text-[var(--text-primary)] font-bold'
                            : 'border-[var(--border-panel)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        <span>{st}</span>
                        <div
                          className="w-6 border-b-2 border-current"
                          style={{ borderStyle: st }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fill / Background Settings (If applicable) */}
              {hasFill && (
                <div className="p-4 rounded-lg bg-[var(--surface-inset)] border border-[var(--border-panel)] space-y-3.5">
                  <div className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                    Background / Fill
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-[var(--text-muted)] block mb-1.5">
                        Fill Color
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={drawing.style.fillColor || drawing.style.strokeColor || '#2962ff'}
                          onChange={(e) => updateStyle({ fillColor: e.target.value })}
                          className="w-8 h-8 rounded-md cursor-pointer border border-white/20 bg-transparent"
                        />
                        <span className="font-mono text-xs text-[var(--text-secondary)]">
                          {drawing.style.fillColor || drawing.style.strokeColor || '#2962ff'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1.5">
                        <span>Fill Opacity</span>
                        <span className="font-mono font-bold text-[var(--text-primary)]">
                          {Math.round((drawing.style.fillOpacity ?? 0.2) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={drawing.style.fillOpacity ?? 0.2}
                        onChange={(e) => updateStyle({ fillOpacity: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-[var(--surface-chip)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-1)]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Display Options */}
              <div className="p-4 rounded-lg bg-[var(--surface-inset)] border border-[var(--border-panel)] space-y-3.5">
                <div className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                  Display Options
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="flex items-center gap-2.5 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={drawing.style.extendLeft || false}
                      onChange={(e) => updateStyle({ extendLeft: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    <span>Extend Left</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={drawing.style.extendRight || false}
                      onChange={(e) => updateStyle({ extendRight: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    <span>Extend Right</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={drawing.style.showPrices ?? true}
                      onChange={(e) => updateStyle({ showPrices: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    <span>Show Prices</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={drawing.style.showStats ?? true}
                      onChange={(e) => updateStyle({ showStats: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    <span>Show Stats (R:R / Pips)</span>
                  </label>
                </div>
              </div>

              {/* Text / Note Content if applicable */}
              <div className="p-4 rounded-lg bg-[var(--surface-inset)] border border-[var(--border-panel)] space-y-3">
                <div className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                  Text / Label
                </div>
                <input
                  type="text"
                  placeholder="Add custom text note..."
                  value={drawing.text || ''}
                  onChange={(e) => updateDrawingObject(drawing.id, { text: e.target.value })}
                  className="w-full px-3 py-2 rounded-md bg-[var(--surface-1)] border border-[var(--border-panel)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:border-[var(--accent-1)]"
                />
              </div>
            </div>
          )}

          {/* TAB 2: FIBONACCI LEVELS */}
          {activeTab === 'fib' && isFibTool && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[var(--surface-inset)] border border-[var(--border-panel)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                    Fibonacci Ratios & Colors
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {activeFibLevels.length} active levels
                  </span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {STANDARD_FIB_LEVELS.map((item) => {
                    const isActive = activeFibLevels.includes(item.level);
                    const currentColor = drawing.style.fibColors?.[item.level] || item.defaultColor;

                    return (
                      <div
                        key={item.level}
                        className={`flex items-center justify-between p-2 rounded-md border transition-colors ${
                          isActive
                            ? 'bg-[var(--surface-1)] border-[var(--border-panel)]'
                            : 'opacity-50 border-transparent hover:opacity-80'
                        }`}
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isActive}
                            onChange={() => toggleFibLevel(item.level)}
                            className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                          />
                          <span className="font-mono font-bold text-xs text-[var(--text-primary)]">
                            {item.level}
                          </span>
                          <span className="text-xs text-[var(--text-muted)]">({item.label})</span>
                        </label>

                        {isActive && (
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={currentColor}
                              onChange={(e) => setFibLevelColor(item.level, e.target.value)}
                              className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add Custom Level */}
                <form onSubmit={handleAddCustomFibLevel} className="flex items-center gap-2 pt-2 border-t border-[var(--border-panel)]">
                  <input
                    type="number"
                    step="0.001"
                    placeholder="e.g. 0.886, 3.14"
                    value={customFibInput}
                    onChange={(e) => setCustomFibInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-md bg-[var(--surface-1)] border border-[var(--border-panel)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:border-[var(--accent-1)] font-mono"
                  />
                  <button
                    type="submit"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-[var(--accent-1)] text-[var(--accent-contrast)] font-semibold text-xs transition-opacity hover:opacity-90"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: POSITION / RISK CALCULATOR */}
          {activeTab === 'position' && isPositionTool && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[var(--surface-inset)] border border-[var(--border-panel)] space-y-3.5">
                <div className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                  Risk & Position Sizing
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">
                      Account Size ($)
                    </label>
                    <input
                      type="number"
                      value={drawing.style.accountSize ?? session.balance ?? 10000}
                      onChange={(e) => updateStyle({ accountSize: parseFloat(e.target.value) || 10000 })}
                      className="w-full px-3 py-2 rounded-md bg-[var(--surface-1)] border border-[var(--border-panel)] text-xs text-[var(--text-primary)] font-mono focus:outline-hidden focus:border-[var(--accent-1)]"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">
                      Risk Per Trade (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={drawing.style.riskPercent ?? 1.0}
                      onChange={(e) => updateStyle({ riskPercent: parseFloat(e.target.value) || 1.0 })}
                      className="w-full px-3 py-2 rounded-md bg-[var(--surface-1)] border border-[var(--border-panel)] text-xs text-[var(--text-primary)] font-mono focus:outline-hidden focus:border-[var(--accent-1)]"
                    />
                  </div>
                </div>

                {/* Calculated Results Summary */}
                <div className="p-3.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-panel)] space-y-2.5 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-muted)]">Risk / Reward Ratio</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      1 : {metrics.riskRewardRatio ?? '--'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-muted)]">Calculated Position Size</span>
                    <span className="font-mono font-bold text-[var(--text-primary)] text-sm">
                      {metrics.estimatedLots ? `${metrics.estimatedLots} Standard Lots` : '--'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-muted)]">Risk Amount</span>
                    <span className="font-mono text-red-400">
                      ${metrics.riskAmount?.toFixed(2)} ({metrics.riskPercent}%) • {metrics.slPips} pips
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-muted)]">Target Profit</span>
                    <span className="font-mono text-emerald-400">
                      ${metrics.rewardAmount?.toFixed(2)} ({metrics.rewardPercent}%) • {metrics.tpPips} pips
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: COORDINATES */}
          {activeTab === 'coordinates' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[var(--surface-inset)] border border-[var(--border-panel)] space-y-3.5">
                <div className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                  Precise Anchor Coordinates
                </div>

                <div className="space-y-3">
                  {drawing.points.map((pt, idx) => {
                    const label =
                      isPositionTool && idx === 0
                        ? 'Entry Point'
                        : isPositionTool && idx === 1
                        ? 'Stop Loss'
                        : isPositionTool && idx === 2
                        ? 'Take Profit'
                        : `Anchor Point ${idx + 1}`;

                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-md bg-[var(--surface-1)] border border-[var(--border-panel)] space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--text-primary)]">{label}</span>
                          <span className="font-mono text-[11px] text-[var(--text-muted)]">
                            {new Date(pt.rawTime ? pt.rawTime * 1000 : pt.time * 1000).toLocaleTimeString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step={pipSize}
                            value={pt.price}
                            onChange={(e) => updatePointPrice(idx, parseFloat(e.target.value) || 0)}
                            className="flex-1 px-3 py-1.5 rounded-md bg-[var(--surface-inset)] border border-[var(--border-panel)] text-xs text-[var(--text-primary)] font-mono focus:outline-hidden focus:border-[var(--accent-1)]"
                          />

                          {/* Quick Nudge Buttons */}
                          <button
                            type="button"
                            onClick={() => nudgePointPrice(idx, -10)}
                            className="px-2 py-1.5 rounded-md bg-[var(--surface-chip)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
                          >
                            -10p
                          </button>
                          <button
                            type="button"
                            onClick={() => nudgePointPrice(idx, -1)}
                            className="px-2 py-1.5 rounded-md bg-[var(--surface-chip)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
                          >
                            -1p
                          </button>
                          <button
                            type="button"
                            onClick={() => nudgePointPrice(idx, 1)}
                            className="px-2 py-1.5 rounded-md bg-[var(--surface-chip)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
                          >
                            +1p
                          </button>
                          <button
                            type="button"
                            onClick={() => nudgePointPrice(idx, 10)}
                            className="px-2 py-1.5 rounded-md bg-[var(--surface-chip)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
                          >
                            +10p
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: CALCULATIONS & METRICS */}
          {activeTab === 'metrics' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[var(--surface-inset)] border border-[var(--border-panel)] space-y-3.5">
                <div className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                  Live Drawing Geometry & Market Measurements
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-md bg-[var(--surface-1)] border border-[var(--border-panel)]">
                    <span className="text-[11px] text-[var(--text-muted)] block">Price Delta</span>
                    <span className="font-mono font-bold text-sm text-[var(--accent-1)]">
                      {metrics.pipsChange !== undefined ? `${metrics.pipsChange} pips` : '--'}
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] block">
                      Δ {metrics.priceChange?.toFixed(spec.digits)} (
                      {metrics.priceChangePercent !== undefined ? `${metrics.priceChangePercent.toFixed(2)}%` : '--'})
                    </span>
                  </div>

                  <div className="p-3 rounded-md bg-[var(--surface-1)] border border-[var(--border-panel)]">
                    <span className="text-[11px] text-[var(--text-muted)] block">Time Duration</span>
                    <span className="font-mono font-bold text-sm text-emerald-400">
                      {metrics.timeSpanFormatted || '--'}
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] block">
                      {metrics.barsCount ? `${metrics.barsCount} candles` : 'Time span'}
                    </span>
                  </div>

                  {metrics.angleDegrees !== undefined && (
                    <div className="p-3 rounded-md bg-[var(--surface-1)] border border-[var(--border-panel)]">
                      <span className="text-[11px] text-[var(--text-muted)] block">Angle / Trend</span>
                      <span className="font-mono font-bold text-sm text-amber-400">
                        {metrics.angleDegrees}°
                      </span>
                    </div>
                  )}

                  {metrics.riskRewardRatio !== undefined && (
                    <div className="p-3 rounded-md bg-[var(--surface-1)] border border-[var(--border-panel)]">
                      <span className="text-[11px] text-[var(--text-muted)] block">Risk / Reward</span>
                      <span className="font-mono font-bold text-sm text-emerald-400">
                        1 : {metrics.riskRewardRatio}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-panel)] bg-[var(--surface-1)]">
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaults}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <button
              onClick={() => {
                duplicateSelectedDrawings();
                onClose();
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicate</span>
            </button>

            <button
              onClick={() => {
                deleteDrawingObjects([drawing.id]);
                onClose();
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[var(--accent-1)] hover:opacity-90 text-[var(--accent-contrast)] font-medium text-xs shadow-xs transition-opacity"
          >
            <Check className="w-4 h-4" />
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
};
