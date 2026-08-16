import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MousePointer2,
  ChartLine,
  MoveHorizontal,
  MoveVertical,
  MoveUpRight,
  Minus,
  ArrowUpRight,
  ArrowRight,
  Compass,
  Info,
  RectangleHorizontal,
  Box,
  CircleDashed,
  Circle,
  Triangle,
  Layers,
  Columns2,
  AlignHorizontalSpaceBetween,
  Brush,
  Highlighter,
  Route,
  PenLine,
  Spline,
  AudioWaveform,
  Percent,
  ArrowUpRightFromSquare,
  Grid,
  Share,
  Hourglass,
  Milestone,
  CircleDotDashed,
  Rainbow,
  ChevronsRight,
  Orbit,
  LayoutGrid,
  Grid3X3,
  SquareDot,
  Frame,
  GitFork,
  GitMerge,
  Shuffle,
  GitCommit,
  RulerDimensionLine,
  CalendarRange,
  Banknote,
  ArrowUpCircle,
  ArrowDownCircle,
  Stars,
  Sparkles,
  ChartScatter,
  Type,
  MessageSquareQuote,
  StickyNote,
  MessageCircle,
  Tag,
  NotebookPen,
  ArrowDownToLine,
  Flag,
  Signpost,
  MapPin,
  ChevronRight,
  HelpCircle,
  Check,
} from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { getToolbarGroups } from '../lib/drawings/selectors';
import type { DrawingToolId } from '../lib/drawings/types';

interface DrawingToolbarProps {
  onOpenShortcuts?: () => void;
  onOpenInspector?: () => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  select: MousePointer2,
  trendline: ChartLine,
  horizontalLine: MoveHorizontal,
  verticalLine: MoveVertical,
  ray: MoveUpRight,
  extendedLine: Minus,
  arrow: ArrowUpRight,
  horizontalRay: ArrowRight,
  trendAngle: Compass,
  infoLine: Info,
  rectangle: RectangleHorizontal,
  rotatedRectangle: Box,
  ellipse: CircleDashed,
  circle: Circle,
  triangle: Triangle,
  parallelChannel: Layers,
  disjointChannel: Columns2,
  flatTopBottom: AlignHorizontalSpaceBetween,
  brush: Brush,
  highlighter: Highlighter,
  polyline: Route,
  path: PenLine,
  curve: Spline,
  doubleCurve: AudioWaveform,
  fibRetracement: Percent,
  fibExtension: ArrowUpRightFromSquare,
  fibChannel: Grid,
  fibSpeedFan: Share,
  fibTimeExtension: Hourglass,
  fibTimeZone: Milestone,
  fibCircles: CircleDotDashed,
  fibArcs: Rainbow,
  fibWedge: ChevronsRight,
  fibSpiral: Orbit,
  gannBox: LayoutGrid,
  gannFan: Grid3X3,
  gannSquare: SquareDot,
  gannSquareFixed: Frame,
  andrewsPitchfork: GitFork,
  schiffPitchfork: GitMerge,
  modifiedSchiffPitchfork: Shuffle,
  insidePitchfork: GitCommit,
  measure: RulerDimensionLine,
  dateRange: CalendarRange,
  priceRange: Banknote,
  longPosition: ArrowUpCircle,
  shortPosition: ArrowDownCircle,
  forecast: Stars,
  projection: Sparkles,
  regressionTrend: ChartScatter,
  text: Type,
  callout: MessageSquareQuote,
  anchoredNote: StickyNote,
  comment: MessageCircle,
  priceLabel: Tag,
  priceNote: NotebookPen,
  arrowMarker: ArrowDownToLine,
  flagMark: Flag,
  signpost: Signpost,
  marker: MapPin,
};

function ToolTip({ label, shortcut }: { label: string; shortcut?: string }) {
  return (
    <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-[60] hidden group-hover:block whitespace-nowrap">
      <div className="animate-tool-tip-in flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)]/95 px-2 py-1 text-[10px] font-medium text-[var(--text-primary)] shadow-md ">
        <span>{label}</span>
        {shortcut && (
          <span className="font-mono text-[9px] px-1 py-px rounded bg-[var(--surface-3)] border border-[var(--border-soft)] text-[var(--text-muted)]">
            {shortcut}
          </span>
        )}
      </div>
    </div>
  );
}

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  onOpenShortcuts,
  onOpenInspector,
}) => {
  const activeTool = useSimulatorStore((state) => state.activeDrawingTool);
  const setActiveTool = useSimulatorStore((state) => state.setActiveDrawingTool);
  const groups = useMemo(() => getToolbarGroups(), []);

  const [groupActiveTools, setGroupActiveTools] = useState<Record<string, DrawingToolId>>({
    select: 'select',
    lines: 'trendline',
    fib: 'fibRetracement',
    gann: 'gannBox',
    pitchforks: 'andrewsPitchfork',
    shapes: 'rectangle',
    calc: 'measure',
    text: 'text',
  });

  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Keep track of active tool in group and sync if changed from keyboard shortcuts
  useEffect(() => {
    if (!activeTool) return;
    for (const group of groups) {
      const tool = group.tools.find((t) => t.id === activeTool);
      if (tool) {
        setGroupActiveTools((prev) => {
          if (prev[group.id] === activeTool) return prev;
          return {
            ...prev,
            [group.id]: activeTool,
          };
        });
        break;
      }
    }
  }, [activeTool, groups]);

  // Handle clicking outside to close any open submenus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setOpenGroupId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div
      ref={toolbarRef}
      className="w-[52px] flex-shrink-0 border-r border-[var(--border-soft)] bg-[var(--app-bg)] flex flex-col items-center py-3 justify-between h-full z-[48] text-[var(--text-secondary)] select-none"
    >
      {/* Top half: Drawing tools */}
      <div className="flex flex-col items-center gap-1.5 w-full px-1">
        {groups.map((group, idx) => {
          const groupActiveToolId = groupActiveTools[group.id] || group.tools[0].id;
          const mainTool = group.tools.find((t) => t.id === groupActiveToolId) || group.tools[0];
          const IconComponent = ICON_MAP[mainTool.id] || MousePointer2;
          const isActive = activeTool === mainTool.id || (activeTool === null && mainTool.id === 'select');

          return (
            <React.Fragment key={group.id}>
              {idx > 0 && <div className="w-6 h-px bg-[var(--border-soft)] my-0.5" />}

              <div className="relative flex flex-col items-center w-full">
                {/* Split Button Container */}
                <div className="group flex items-stretch w-[44px] h-[38px] rounded-xl overflow-visible">
                  {/* Left Action Portion: Activates current tool */}
                  <button
                    id={`drawing-tool-${mainTool.id}`}
                    aria-label={mainTool.label}
                    aria-pressed={isActive}
                    onClick={() => setActiveTool(isActive ? null : mainTool.id)}
                    className={`relative flex-1 flex items-center justify-center rounded-l-xl border transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'text-[var(--accent-1)] bg-[var(--accent-1)]/15 border-[var(--accent-1)]/40 font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--accent-1)]/10 hover:border-[var(--accent-1)]/30 border-transparent'
                    }`}
                  >
                    <IconComponent size={mainTool.id === 'select' ? 14 : 18} strokeWidth={isActive ? 2.5 : 2} />
                    {openGroupId !== group.id && <ToolTip label={mainTool.label} shortcut={mainTool.shortcut} />}
                  </button>

                  {/* Right Arrow Portion: Toggles dropdown flyout menu */}
                  {group.tools.length > 1 && (
                    <button
                      aria-label={`More ${group.label} tools`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenGroupId(openGroupId === group.id ? null : group.id);
                      }}
                      className={`flex items-center justify-center w-3.5 rounded-r-xl border-l transition-all duration-200 cursor-pointer ${
                        isActive
                          ? 'text-[var(--accent-1)] bg-[var(--accent-1)]/15 border-l-[var(--accent-1)]/30 hover:bg-[var(--accent-1)]/25'
                          : 'text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--accent-1)]/10 border-l-[var(--border-soft)]'
                      } ${openGroupId === group.id ? 'text-[var(--accent-1)] bg-[var(--accent-1)]/15' : ''}`}
                    >
                      <ChevronRight
                        size={9}
                        strokeWidth={3}
                        className={`transition-transform duration-200 ${openGroupId === group.id ? 'rotate-90' : ''}`}
                      />
                    </button>
                  )}
                </div>

                {/* Dropdown Flyout Menu */}
                {openGroupId === group.id && (
                  <div
                    className="animate-tool-flyout-in absolute left-full top-0 ml-2 bg-[var(--app-bg)] border border-[var(--border-strong)] rounded-xl p-1.5 shadow-lg z-50 flex flex-col gap-0.5 w-64 max-h-[80vh] overflow-y-auto"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    <div className="flex items-center gap-2 px-2 py-1.5 mb-0.5 border-b border-[var(--border-soft)]">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-[var(--surface-3)] text-[var(--accent-1)]">
                        <IconComponent size={12} strokeWidth={2.5} />
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">
                        {group.label}
                      </span>
                      <span className="ml-auto text-[9px] font-mono text-[var(--text-muted)] bg-[var(--surface-3)] rounded px-1 py-px">
                        {group.tools.length}
                      </span>
                    </div>
                    {group.sections.map((section, sectionIdx) => (
                      <div key={section.label}>
                        {sectionIdx > 0 && (
                          <div className="h-px bg-[var(--border-soft)] my-1" />
                        )}
                        {group.sections.length > 1 && (
                          <div className="flex items-center gap-1.5 px-2 pt-1 pb-0.5">
                            <span className="w-1 h-1 rounded-full bg-[var(--accent-1)]" />
                            <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold">
                              {section.label}
                            </span>
                          </div>
                        )}
                        {section.tools.map((tool) => {
                          const ToolIcon = ICON_MAP[tool.id] || MousePointer2;
                          const isToolActive = activeTool === tool.id;

                          return (
                        <button
                          key={tool.id}
                          aria-label={tool.label}
                          aria-pressed={isToolActive}
                          onClick={() => {
                            setActiveTool(tool.id);
                            setGroupActiveTools((prev) => ({
                              ...prev,
                              [group.id]: tool.id,
                            }));
                            setOpenGroupId(null);
                          }}
                          className={`group/row flex items-center justify-between w-full px-1.5 py-1 rounded-lg text-xs text-left transition-all duration-150 cursor-pointer border ${
                            isToolActive
                              ? 'bg-[var(--accent-1)]/15 text-[var(--accent-1)] border-[var(--accent-1)]/30'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] border-transparent hover:translate-x-0.5'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`flex items-center justify-center w-6 h-6 rounded-md border shrink-0 transition-colors ${
                                isToolActive
                                  ? 'bg-[var(--accent-1)]/20 border-[var(--accent-1)]/35'
                                  : 'bg-[var(--surface-3)] border-[var(--border-soft)] group-hover/row:border-[var(--accent-1)]/30'
                              }`}
                            >
                              <ToolIcon
                                size={tool.id === 'select' ? 11 : 13}
                                strokeWidth={2.2}
                                className={isToolActive ? 'text-[var(--accent-1)]' : 'text-[var(--text-secondary)]'}
                              />
                            </span>
                            <span className="truncate">{tool.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {tool.shortcut && (
                              <span
                                className={`text-[9px] font-mono px-1 py-0.5 rounded border ${
                                  isToolActive
                                    ? 'bg-[var(--accent-1)]/20 border-[var(--accent-1)]/35 text-[var(--accent-1)]'
                                    : 'bg-[var(--surface-3)] border-[var(--border-soft)] text-[var(--text-muted)]'
                                }`}
                              >
                                {tool.shortcut}
                              </span>
                            )}
                            {isToolActive && (
                              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[var(--accent-1)]/20 text-[var(--accent-1)]">
                                <Check size={10} strokeWidth={3} />
                              </span>
                            )}
                          </div>
                        </button>
                      );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Bottom half: Helper buttons */}
      <div className="flex flex-col items-center gap-1.5 w-full px-1">
        <div className="w-6 h-px bg-[var(--border-soft)] mb-1" />

        {onOpenInspector && (
          <button
            id="btn-open-inspector"
            onClick={onOpenInspector}
            aria-label="Drawing Inspector & Object Tree"
            className="group relative p-2.5 rounded-xl hover:text-[var(--accent-1)] hover:bg-[var(--accent-1)]/10 hover:border-[var(--accent-1)]/30 border border-transparent transition-all duration-200 cursor-pointer"
          >
            <Layers size={18} strokeWidth={2} />
            <ToolTip label="Inspector & Objects" />
          </button>
        )}
        {onOpenShortcuts && (
          <button
            id="btn-open-shortcuts"
            onClick={onOpenShortcuts}
            aria-label="Keyboard Shortcuts"
            className="group relative p-2.5 rounded-xl hover:text-[var(--accent-1)] hover:bg-[var(--accent-1)]/10 hover:border-[var(--accent-1)]/30 border border-transparent transition-all duration-200 cursor-pointer"
          >
            <HelpCircle size={18} strokeWidth={2} />
            <ToolTip label="Keyboard Shortcuts" shortcut="?" />
          </button>
        )}
      </div>
    </div>
  );
};
