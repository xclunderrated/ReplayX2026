import React, { useState } from 'react';
import {
  X,
  Trash2,
  Copy,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Layers,
  Palette,
  Sliders,
  Settings,
  Search,
  Check,
  ChevronRight,
  Maximize2,
} from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore';
import type { DrawingObject, DrawingStyle } from '../lib/drawings/types';
import { DRAWING_TOOLS } from '../lib/drawings/tools';
import { DrawingSettingsModal } from './drawings/DrawingSettingsModal';

interface DrawingInspectorProps {
  onClose?: () => void;
  onOpenSettingsModal?: (drawing: DrawingObject) => void;
}

const PRESET_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#ffffff', // White
  '#94a3b8', // Slate
];

export const DrawingInspector: React.FC<DrawingInspectorProps> = ({
  onClose,
  onOpenSettingsModal,
}) => {
  const currentSessionId = useSimulatorStore((s) => s.currentSessionId);
  const session = useSimulatorStore((s) =>
    s.sessions.find((sess) => sess.id === currentSessionId)
  );

  const activeTool = useSimulatorStore((s) => s.activeDrawingTool);
  const updateDrawingObject = useSimulatorStore((s) => s.updateDrawingObject);
  const deleteDrawingObjects = useSimulatorStore((s) => s.deleteDrawingObjects);
  const selectDrawingObjects = useSimulatorStore((s) => s.selectDrawingObjects);
  const duplicateSelectedDrawings = useSimulatorStore((s) => s.duplicateSelectedDrawings);
  const updateToolPreset = useSimulatorStore((s) => s.updateToolPreset);

  const doc = session?.drawingDocument;
  const objects = doc?.objects ?? [];
  const selectedIds = doc?.selectedIds ?? [];
  const toolDefaults = doc?.toolDefaults ?? ({} as any);

  const selectedObjects = objects.filter((o) => selectedIds.includes(o.id));
  const primarySelected = selectedObjects[0];

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'style' | 'objects'>('style');
  const [modalDrawing, setModalDrawing] = useState<DrawingObject | null>(null);

  const handleOpenSettings = (obj: DrawingObject) => {
    if (onOpenSettingsModal) {
      onOpenSettingsModal(obj);
    } else {
      setModalDrawing(obj);
    }
  };

  const handleColorChange = (color: string) => {
    if (selectedObjects.length > 0) {
      selectedObjects.forEach((o) => {
        updateDrawingObject(o.id, {
          style: { ...o.style, strokeColor: color },
        });
      });
    } else if (activeTool) {
      updateToolPreset(activeTool, { style: { strokeColor: color } });
    }
  };

  const handleFillColorChange = (color: string) => {
    if (selectedObjects.length > 0) {
      selectedObjects.forEach((o) => {
        updateDrawingObject(o.id, {
          style: { ...o.style, fillColor: color },
        });
      });
    } else if (activeTool) {
      updateToolPreset(activeTool, { style: { fillColor: color } });
    }
  };

  const handleWidthChange = (width: number) => {
    if (selectedObjects.length > 0) {
      selectedObjects.forEach((o) => {
        updateDrawingObject(o.id, {
          style: { ...o.style, strokeWidth: width },
        });
      });
    } else if (activeTool) {
      updateToolPreset(activeTool, { style: { strokeWidth: width } });
    }
  };

  const handleStyleChange = (strokeStyle: 'solid' | 'dashed' | 'dotted') => {
    if (selectedObjects.length > 0) {
      selectedObjects.forEach((o) => {
        updateDrawingObject(o.id, {
          style: { ...o.style, strokeStyle },
        });
      });
    } else if (activeTool) {
      updateToolPreset(activeTool, { style: { strokeStyle } });
    }
  };

  const presetStyle = (activeTool && (toolDefaults as any)[activeTool]?.style) as DrawingStyle | undefined;
  const currentStrokeColor = selectedObjects.length > 0 ? (primarySelected?.style.strokeColor || '#3b82f6') : (presetStyle?.strokeColor || '#3b82f6');
  const currentFillColor = selectedObjects.length > 0 ? (primarySelected?.style.fillColor || primarySelected?.style.strokeColor || '#3b82f6') : (presetStyle?.fillColor || '#3b82f6');
  const currentStrokeWidth = selectedObjects.length > 0 ? (primarySelected?.style.strokeWidth || 2) : (presetStyle?.strokeWidth || 2);
  const currentStrokeStyle = selectedObjects.length > 0 ? (primarySelected?.style.strokeStyle || 'solid') : (presetStyle?.strokeStyle || 'solid');

  const primaryFillOpacity =
    selectedObjects.length > 0
      ? primarySelected?.style.fillOpacity ?? 0.2
      : presetStyle?.fillOpacity ?? 0.2;

  const handleFillOpacityChange = (value: number) => {
    if (selectedObjects.length > 0) {
      selectedObjects.forEach((o) => {
        updateDrawingObject(o.id, {
          style: { ...o.style, fillOpacity: value },
        });
      });
    } else if (activeTool) {
      updateToolPreset(activeTool, { style: { fillOpacity: value } });
    }
  };

  const filteredObjects = objects.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return o.tool.toLowerCase().includes(q) || (o.text && o.text.toLowerCase().includes(q));
  });

  return (
    <>
      <div className="w-80 bg-[var(--surface-panel)] border border-[var(--border-panel)] rounded-xl shadow-2xl flex flex-col h-[520px] max-h-[calc(100vh-120px)] text-xs text-[var(--text-primary)] z-40 backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-3 border-b border-[var(--border-soft)]">
          <div className="flex items-center space-x-2 font-semibold">
            <Sliders className="w-4 h-4 text-[var(--accent-1)]" />
            <span className="text-sm">Drawing Inspector</span>
          </div>
          <div className="flex items-center space-x-1">
            {primarySelected && (
              <button
                onClick={() => handleOpenSettings(primarySelected)}
                className="p-1 rounded-lg hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
                title="Full Drawing Settings"
              >
                <Settings className="w-4 h-4 text-[var(--accent-1)]" />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex border-b border-[var(--border-soft)] bg-[var(--surface-2)]/40 p-1 gap-1">
          <button
            onClick={() => setActiveTab('style')}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center justify-center space-x-1.5 ${
              activeTab === 'style'
                ? 'bg-[var(--surface-panel)] text-[var(--accent-1)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Styles & Settings</span>
          </button>
          <button
            onClick={() => setActiveTab('objects')}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center justify-center space-x-1.5 ${
              activeTab === 'objects'
                ? 'bg-[var(--surface-panel)] text-[var(--accent-1)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Object Tree ({objects.length})</span>
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4" style={{ scrollbarWidth: 'thin' }}>
          {activeTab === 'style' ? (
            <>
              {/* Selection Banner */}
              <div className="bg-[var(--surface-2)] rounded-lg p-2.5 border border-[var(--border-soft)] flex items-center justify-between">
                {selectedObjects.length > 0 ? (
                  <div>
                    <div className="font-semibold text-[var(--accent-1)]">
                      {selectedObjects.length} object{selectedObjects.length > 1 ? 's' : ''} selected
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5 capitalize">
                      {selectedObjects.map((o) => o.tool).join(', ')}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="font-semibold text-emerald-400 capitalize">
                      Active: {activeTool || 'Cursor Select'}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      Tool preset default properties
                    </div>
                  </div>
                )}

                {primarySelected && (
                  <button
                    onClick={() => handleOpenSettings(primarySelected)}
                    className="px-2 py-1 rounded bg-[var(--accent-1)]/15 border border-[var(--accent-1)]/30 text-[var(--accent-1)] hover:bg-[var(--accent-1)] hover:text-[var(--accent-contrast)] transition text-[10px] font-semibold flex items-center space-x-1 cursor-pointer"
                  >
                    <span>Advanced</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Stroke Color */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Stroke Color
                  </span>
                  <input
                    type="color"
                    value={currentStrokeColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="w-6 h-6 rounded border border-[var(--border-soft)] bg-transparent cursor-pointer"
                    title="Custom Stroke Color"
                  />
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => handleColorChange(c)}
                      className={`h-6 rounded-md border transition flex items-center justify-center cursor-pointer ${
                        currentStrokeColor.toLowerCase() === c.toLowerCase()
                          ? 'border-white ring-1 ring-white/50 scale-105'
                          : 'border-white/10 hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {currentStrokeColor.toLowerCase() === c.toLowerCase() && (
                        <Check className="w-3 h-3 text-black drop-shadow" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stroke Width */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Line Width
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map((w) => (
                    <button
                      key={w}
                      onClick={() => handleWidthChange(w)}
                      className={`py-1 rounded-lg border font-mono text-[11px] transition cursor-pointer ${
                        currentStrokeWidth === w
                          ? 'bg-[var(--accent-1)] text-[var(--accent-contrast)] border-[var(--accent-1)] font-bold'
                          : 'bg-[var(--surface-2)] text-[var(--text-secondary)] border-[var(--border-soft)] hover:bg-[var(--surface-3)]'
                      }`}
                    >
                      {w}px
                    </button>
                  ))}
                </div>
              </div>

              {/* Stroke Style */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Line Style
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['solid', 'dashed', 'dotted'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => handleStyleChange(st)}
                      className={`py-1 rounded-lg border capitalize text-[11px] transition cursor-pointer ${
                        currentStrokeStyle === st
                          ? 'bg-[var(--accent-1)] text-[var(--accent-contrast)] border-[var(--accent-1)] font-bold'
                          : 'bg-[var(--surface-2)] text-[var(--text-secondary)] border-[var(--border-soft)] hover:bg-[var(--surface-3)]'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fill Color & Opacity */}
              <div className="space-y-2 pt-2 border-t border-[var(--border-soft)]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Fill & Background
                  </span>
                  <input
                    type="color"
                    value={currentFillColor}
                    onChange={(e) => handleFillColorChange(e.target.value)}
                    className="w-6 h-6 rounded border border-[var(--border-soft)] bg-transparent cursor-pointer"
                    title="Custom Fill Color"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-secondary)]">Fill Opacity</span>
                  <span className="font-mono text-[var(--text-primary)] font-bold">
                    {Math.round(primaryFillOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={primaryFillOpacity}
                  onChange={(e) => handleFillOpacityChange(Number(e.target.value))}
                  className="w-full accent-[var(--accent-1)] cursor-pointer"
                />
              </div>

              {/* Toggles (Labels & Stats) */}
              {primarySelected && (
                <div className="pt-2 border-t border-[var(--border-soft)] space-y-2">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Display Options
                  </span>
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition">
                      <span className="text-[11px] text-[var(--text-secondary)]">Show Labels</span>
                      <input
                        type="checkbox"
                        checked={primarySelected.style.showLabels ?? true}
                        onChange={(e) =>
                          updateDrawingObject(primarySelected.id, {
                            style: { ...primarySelected.style, showLabels: e.target.checked },
                          })
                        }
                        className="rounded accent-[var(--accent-1)] cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition">
                      <span className="text-[11px] text-[var(--text-secondary)]">Show Stats & Values</span>
                      <input
                        type="checkbox"
                        checked={primarySelected.style.showStats ?? true}
                        onChange={(e) =>
                          updateDrawingObject(primarySelected.id, {
                            style: { ...primarySelected.style, showStats: e.target.checked },
                          })
                        }
                        className="rounded accent-[var(--accent-1)] cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition">
                      <span className="text-[11px] text-[var(--text-secondary)]">Extend Right</span>
                      <input
                        type="checkbox"
                        checked={primarySelected.style.extendRight ?? false}
                        onChange={(e) =>
                          updateDrawingObject(primarySelected.id, {
                            style: { ...primarySelected.style, extendRight: e.target.checked },
                          })
                        }
                        className="rounded accent-[var(--accent-1)] cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {selectedObjects.length > 0 && (
                <div className="pt-2 border-t border-[var(--border-soft)] grid grid-cols-2 gap-2">
                  <button
                    onClick={() => duplicateSelectedDrawings()}
                    className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--accent-1)] hover:text-[var(--accent-contrast)] transition cursor-pointer font-semibold"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Duplicate</span>
                  </button>
                  <button
                    onClick={() => deleteDrawingObjects(selectedIds)}
                    className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-600 hover:text-white transition cursor-pointer font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Objects Tree View */
            <div className="space-y-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Filter drawings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border-soft)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-1)]"
                />
              </div>

              {/* Batch Actions Bar */}
              {objects.length > 0 && (
                <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] px-1">
                  <span>{filteredObjects.length} drawing{filteredObjects.length !== 1 ? 's' : ''}</span>
                  <button
                    onClick={() => deleteDrawingObjects(objects.map((o) => o.id))}
                    className="text-red-400 hover:underline font-semibold cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              )}

              {/* Object List */}
              <div className="space-y-1 max-h-[320px] overflow-y-auto pr-0.5">
                {filteredObjects.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-muted)] italic text-xs">
                    {searchQuery ? 'No matching drawings found' : 'No drawings on chart yet'}
                  </div>
                ) : (
                  filteredObjects.map((obj) => {
                    const isSel = selectedIds.includes(obj.id);
                    return (
                      <div
                        key={obj.id}
                        onClick={() => selectDrawingObjects([obj.id])}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-lg border transition cursor-pointer group ${
                          isSel
                            ? 'bg-[var(--accent-1)]/20 border-[var(--accent-1)]/50 text-[var(--accent-1)] font-semibold'
                            : 'bg-[var(--surface-2)]/50 border-transparent hover:border-[var(--border-soft)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 truncate min-w-0">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20"
                            style={{ backgroundColor: obj.style.strokeColor }}
                          />
                          <div className="truncate">
                            <div className="capitalize truncate text-xs text-[var(--text-primary)]">
                              {obj.text ? obj.text : obj.tool}
                            </div>
                            <div className="text-[9px] text-[var(--text-muted)] capitalize">
                              {obj.tool} • {obj.points.length} pts
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenSettings(obj);
                            }}
                            className="p-1 hover:text-[var(--accent-1)] rounded hover:bg-[var(--surface-3)] transition"
                            title="Open Settings"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDrawingObject(obj.id, { locked: !obj.locked });
                            }}
                            className="p-1 hover:text-white rounded hover:bg-[var(--surface-3)] transition"
                            title={obj.locked ? 'Unlock' : 'Lock'}
                          >
                            {obj.locked ? (
                              <Lock className="w-3.5 h-3.5 text-amber-400" />
                            ) : (
                              <Unlock className="w-3.5 h-3.5 text-white/30 group-hover:text-white/60" />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDrawingObject(obj.id, { hidden: !obj.hidden });
                            }}
                            className="p-1 hover:text-white rounded hover:bg-[var(--surface-3)] transition"
                            title={obj.hidden ? 'Show' : 'Hide'}
                          >
                            {obj.hidden ? (
                              <EyeOff className="w-3.5 h-3.5 text-red-400" />
                            ) : (
                              <Eye className="w-3.5 h-3.5 text-white/30 group-hover:text-white/60" />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteDrawingObjects([obj.id]);
                            }}
                            className="p-1 hover:text-red-400 rounded hover:bg-red-500/10 transition"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-white/30 hover:text-red-400" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {modalDrawing && (
        <DrawingSettingsModal
          drawingId={modalDrawing.id}
          onClose={() => setModalDrawing(null)}
        />
      )}
    </>
  );
};
