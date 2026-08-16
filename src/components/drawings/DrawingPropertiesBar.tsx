import React, { useState, useRef, useEffect } from 'react';
import {
  Settings,
  Trash2,
  Lock,
  Unlock,
  Copy,
  Eye,
  EyeOff,
  Move,
  ChevronDown,
} from 'lucide-react';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import type { DrawingObject, StrokeStyle } from '../../lib/drawings/types';
import { getDrawingToolDefinition } from '../../lib/drawings/tools';
import { calculateDrawingMetrics } from '../../lib/drawings/calculations';

interface DrawingPropertiesBarProps {
  onOpenSettingsModal: (drawingId: string) => void;
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
  '#f8fafc', // White
  '#131722', // Dark
];

export const DrawingPropertiesBar: React.FC<DrawingPropertiesBarProps> = ({ onOpenSettingsModal }) => {
  const currentSessionId = useSimulatorStore((s) => s.currentSessionId);
  const session = useSimulatorStore((s) => s.sessions.find((sess) => sess.id === currentSessionId));
  const updateDrawingObject = useSimulatorStore((s) => s.updateDrawingObject);
  const deleteDrawingObjects = useSimulatorStore((s) => s.deleteDrawingObjects);
  const duplicateSelectedDrawings = useSimulatorStore((s) => s.duplicateSelectedDrawings);

  const selectedIds = session?.drawingDocument?.selectedIds || [];
  const selectedObjects: DrawingObject[] = (session?.drawingDocument?.objects || []).filter((obj) =>
    selectedIds.includes(obj.id)
  );

  const primaryObj = selectedObjects[0];

  // Popover states
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [fillMenuOpen, setFillMenuOpen] = useState(false);
  const [widthMenuOpen, setWidthMenuOpen] = useState(false);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);

  // Position state for floating bar
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
  });

  // Default position: top center of chart
  useEffect(() => {
    if (selectedObjects.length > 0 && !pos) {
      setPos({ x: Math.max(20, window.innerWidth / 2 - 200), y: 70 });
    }
  }, [selectedObjects.length, pos]);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setColorMenuOpen(false);
        setFillMenuOpen(false);
        setWidthMenuOpen(false);
        setStyleMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Dragging of the toolbar
  const handleDragStart = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: pos?.x || 200,
      startY: pos?.y || 70,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = ev.clientX - dragStartRef.current.mouseX;
      const dy = ev.clientY - dragStartRef.current.mouseY;
      setPos({
        x: Math.max(10, Math.min(window.innerWidth - 380, dragStartRef.current.startX + dx)),
        y: Math.max(40, Math.min(window.innerHeight - 80, dragStartRef.current.startY + dy)),
      });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  if (!primaryObj) return null;

  const toolDef = getDrawingToolDefinition(primaryObj.tool);
  const metrics = calculateDrawingMetrics(
    primaryObj,
    session?.instrument || 'EURUSD',
    session?.balance || 10000,
    1.0,
    session?.data
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
  ].includes(primaryObj.tool);

  const handleUpdateStyle = (styleUpdates: Partial<typeof primaryObj.style>) => {
    selectedObjects.forEach((obj) => {
      updateDrawingObject(obj.id, {
        style: {
          ...obj.style,
          ...styleUpdates,
        },
      });
    });
  };

  const handleToggleLock = () => {
    const nextLocked = !primaryObj.locked;
    selectedObjects.forEach((obj) => {
      updateDrawingObject(obj.id, { locked: nextLocked });
    });
  };

  const handleToggleHidden = () => {
    const nextHidden = !primaryObj.hidden;
    selectedObjects.forEach((obj) => {
      updateDrawingObject(obj.id, { hidden: nextHidden });
    });
  };

  const handleDelete = () => {
    deleteDrawingObjects(selectedIds);
  };

  const handleDuplicate = () => {
    duplicateSelectedDrawings();
  };

  return (
    <div
      ref={barRef}
      id="drawing-properties-floating-bar"
      style={{
        position: 'fixed',
        left: `${pos?.x ?? 200}px`,
        top: `${pos?.y ?? 70}px`,
        zIndex: 60,
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-1)] backdrop-blur-md border border-[var(--border-panel)] shadow-2xl text-[var(--text-primary)] text-xs select-none animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Drag Handle & Tool Name */}
      <div
        onMouseDown={handleDragStart}
        className="flex items-center gap-1.5 pr-2 mr-1 border-r border-[var(--border-panel)] cursor-grab active:cursor-grabbing text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        title="Drag to reposition"
      >
        <Move className="w-3.5 h-3.5 opacity-60" />
        <span className="font-semibold text-[11px] text-[var(--text-primary)] whitespace-nowrap">
          {toolDef?.label || primaryObj.tool}
        </span>
      </div>

      {/* Live Risk:Reward Ratio Pill for Position Tools */}
      {(primaryObj.tool === 'longPosition' || primaryObj.tool === 'shortPosition') && metrics.riskRewardRatio !== undefined && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--surface-chip)] border border-[var(--border-panel)] text-[var(--text-primary)] font-mono text-[11px] font-semibold">
          <span>R:R 1:{metrics.riskRewardRatio}</span>
          {metrics.estimatedLots ? <span className="text-[10px] text-[var(--text-muted)]">({metrics.estimatedLots}L)</span> : null}
        </div>
      )}

      {/* Stroke Color Picker Button */}
      <div className="relative">
        <button
          onClick={() => {
            setColorMenuOpen(!colorMenuOpen);
            setFillMenuOpen(false);
            setWidthMenuOpen(false);
            setStyleMenuOpen(false);
          }}
          className="flex items-center gap-1 p-1 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Line Color"
        >
          <div
            className="w-4 h-4 rounded-full border border-white/20 shadow-xs"
            style={{ backgroundColor: primaryObj.style.strokeColor || '#2962ff' }}
          />
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>

        {colorMenuOpen && (
          <div className="absolute top-full left-0 mt-2 p-2.5 rounded-xl bg-[var(--surface-panel)] border border-[var(--border-panel-strong)] shadow-2xl z-50 w-52">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Line Color
            </div>
            <div className="grid grid-cols-6 gap-1.5 mb-2.5">
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    handleUpdateStyle({ strokeColor: color });
                    setColorMenuOpen(false);
                  }}
                  className="w-6 h-6 rounded-md border border-white/10 hover:scale-110 transition-transform relative flex items-center justify-center cursor-pointer"
                  style={{ backgroundColor: color }}
                >
                  {primaryObj.style.strokeColor === color && (
                    <div className="w-2 h-2 rounded-full bg-white shadow-xs" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-panel)]">
              <span className="text-[10px] text-[var(--text-muted)]">Custom:</span>
              <input
                type="color"
                value={primaryObj.style.strokeColor || '#2962ff'}
                onChange={(e) => handleUpdateStyle({ strokeColor: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
              />
              <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                {primaryObj.style.strokeColor}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Fill Color & Opacity (If applicable) */}
      {hasFill && (
        <div className="relative">
          <button
            onClick={() => {
              setFillMenuOpen(!fillMenuOpen);
              setColorMenuOpen(false);
              setWidthMenuOpen(false);
              setStyleMenuOpen(false);
            }}
            className="flex items-center gap-1 p-1 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            title="Fill Color & Opacity"
          >
            <div
              className="w-4 h-4 rounded-md border border-white/20 relative overflow-hidden flex items-center justify-center text-[9px] font-bold"
              style={{
                backgroundColor: primaryObj.style.fillColor || primaryObj.style.strokeColor || '#2962ff',
                opacity: primaryObj.style.fillOpacity ?? 0.2,
              }}
            />
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {fillMenuOpen && (
            <div className="absolute top-full left-0 mt-2 p-3 rounded-xl bg-[var(--surface-panel)] border border-[var(--border-panel-strong)] shadow-2xl z-50 w-56">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Fill Color
              </div>
              <div className="grid grid-cols-6 gap-1.5 mb-3">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleUpdateStyle({ fillColor: color })}
                    className="w-6 h-6 rounded-md border border-white/10 hover:scale-110 transition-transform relative flex items-center justify-center cursor-pointer"
                    style={{ backgroundColor: color }}
                  >
                    {primaryObj.style.fillColor === color && (
                      <div className="w-2 h-2 rounded-full bg-white shadow-xs" />
                    )}
                  </button>
                ))}
              </div>
              <div className="pt-2 border-t border-[var(--border-panel)]">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-[var(--text-secondary)]">Opacity</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {Math.round((primaryObj.style.fillOpacity ?? 0.2) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={primaryObj.style.fillOpacity ?? 0.2}
                  onChange={(e) => handleUpdateStyle({ fillOpacity: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-[var(--surface-chip)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-1)]"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Line Width Button */}
      <div className="relative">
        <button
          onClick={() => {
            setWidthMenuOpen(!widthMenuOpen);
            setColorMenuOpen(false);
            setFillMenuOpen(false);
            setStyleMenuOpen(false);
          }}
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-mono text-[11px] transition-colors"
          title="Line Width"
        >
          <div className="flex flex-col gap-0.5 items-center justify-center w-3">
            <div
              className="w-3 bg-current rounded-full"
              style={{ height: `${Math.min(primaryObj.style.strokeWidth || 2, 4)}px` }}
            />
          </div>
          <span>{primaryObj.style.strokeWidth || 2}px</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>

        {widthMenuOpen && (
          <div className="absolute top-full left-0 mt-2 p-1.5 rounded-xl bg-[var(--surface-panel)] border border-[var(--border-panel-strong)] shadow-2xl z-50 w-28 flex flex-col gap-1">
            {[1, 2, 3, 4, 6].map((w) => (
              <button
                key={w}
                onClick={() => {
                  handleUpdateStyle({ strokeWidth: w });
                  setWidthMenuOpen(false);
                }}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-[var(--surface-2)] text-[var(--text-primary)] transition-colors ${
                  (primaryObj.style.strokeWidth || 2) === w ? 'bg-[var(--surface-chip)] font-bold' : ''
                }`}
              >
                <span>{w}px</span>
                <div
                  className="w-8 bg-current rounded-full"
                  style={{ height: `${w}px` }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Line Style (Solid, Dashed, Dotted) */}
      <div className="relative">
        <button
          onClick={() => {
            setStyleMenuOpen(!styleMenuOpen);
            setColorMenuOpen(false);
            setFillMenuOpen(false);
            setWidthMenuOpen(false);
          }}
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[11px] capitalize transition-colors"
          title="Line Style"
        >
          <span className="font-mono">{primaryObj.style.strokeStyle || 'solid'}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>

        {styleMenuOpen && (
          <div className="absolute top-full left-0 mt-2 p-1.5 rounded-xl bg-[var(--surface-panel)] border border-[var(--border-panel-strong)] shadow-2xl z-50 w-32 flex flex-col gap-1">
            {(['solid', 'dashed', 'dotted'] as StrokeStyle[]).map((st) => (
              <button
                key={st}
                onClick={() => {
                  handleUpdateStyle({ strokeStyle: st });
                  setStyleMenuOpen(false);
                }}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs capitalize hover:bg-[var(--surface-2)] text-[var(--text-primary)] transition-colors ${
                  (primaryObj.style.strokeStyle || 'solid') === st ? 'bg-[var(--surface-chip)] font-bold' : ''
                }`}
              >
                <span>{st}</span>
                <div
                  className="w-8 border-b-2 border-current"
                  style={{
                    borderStyle: st,
                  }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-[var(--border-panel)] mx-0.5" />

      {/* Quick Action Buttons */}
      {/* Lock / Unlock */}
      <button
        onClick={handleToggleLock}
        className={`p-1.5 rounded-lg transition-colors ${
          primaryObj.locked
            ? 'bg-amber-500/20 text-amber-400'
            : 'hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
        title={primaryObj.locked ? 'Unlock Drawing' : 'Lock Drawing'}
      >
        {primaryObj.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
      </button>

      {/* Hide / Unhide */}
      <button
        onClick={handleToggleHidden}
        className={`p-1.5 rounded-lg transition-colors ${
          primaryObj.hidden
            ? 'bg-red-500/20 text-red-400'
            : 'hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
        title={primaryObj.hidden ? 'Show Drawing' : 'Hide Drawing'}
      >
        {primaryObj.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>

      {/* Duplicate */}
      <button
        onClick={handleDuplicate}
        className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        title="Clone / Duplicate (Ctrl+D)"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>

      {/* Open Full Settings Modal */}
      <button
        onClick={() => onOpenSettingsModal(primaryObj.id)}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--surface-chip)] hover:bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border-panel)] transition-colors font-medium text-[11px]"
        title="Drawing Settings"
      >
        <Settings className="w-3.5 h-3.5" />
        <span>Settings</span>
      </button>

      {/* Delete Button */}
      <button
        onClick={handleDelete}
        className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors ml-0.5"
        title="Delete (Delete / Backspace)"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

