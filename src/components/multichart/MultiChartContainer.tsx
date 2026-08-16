import React, { useMemo } from 'react';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import type { MultiChartLayoutType, ChartPaneConfig } from '../../types/multichart';
import { MultiChartPane } from './MultiChartPane';

interface MultiChartContainerProps {
  onOpenSettings?: () => void;
  onOpenDrawingSettings?: (drawingId: string) => void;
  captureRequestId?: number;
  onCaptureReady?: (dataUrl: string) => void;
  isNewsPanelOpen?: boolean;
  onCloseNewsPanel?: () => void;
}

export const MultiChartContainer: React.FC<MultiChartContainerProps> = ({
  onOpenSettings,
  onOpenDrawingSettings,
  captureRequestId,
  onCaptureReady,
  isNewsPanelOpen,
  onCloseNewsPanel,
}) => {
  const session = useSimulatorStore((state) =>
    state.sessions.find((s) => s.id === state.currentSessionId)
  );

  const setActiveChartPane = useSimulatorStore((state) => state.setActiveChartPane);

  const layout: MultiChartLayoutType = session?.multiChartLayout || 'single';
  const panes: ChartPaneConfig[] = useMemo(() => {
    if (session?.multiChartPanes && session.multiChartPanes.length > 0) {
      return session.multiChartPanes;
    }
    return [
      {
        id: 'pane-0',
        timeframe: (session?.timeframe as any) || 'm5',
        isLinkedToSessionSymbol: true,
        indicatorsEnabled: true,
        drawingFilter: 'all',
      },
    ];
  }, [session?.multiChartPanes, session?.timeframe]);

  const activePaneId = session?.activeChartPaneId || 'pane-0';
  const maximizedPaneId = session?.maximizedChartPaneId || null;

  // If a pane is maximized, show only that pane full container
  if (maximizedPaneId) {
    const paneToMaximize = panes.find((p) => p.id === maximizedPaneId) || panes[0];
    if (!paneToMaximize) return null;
    return (
      <div className="w-full h-full min-w-0 min-h-0 relative bg-[#131722]">
        <MultiChartPane
          pane={paneToMaximize}
          isPrimary={paneToMaximize.id === 'pane-0' || paneToMaximize.id === panes[0]?.id}
          isActive={true}
          isMaximized={true}
          onActivate={() => setActiveChartPane(paneToMaximize.id)}
          onOpenSettings={onOpenSettings}
          onOpenDrawingSettings={onOpenDrawingSettings}
          captureRequestId={captureRequestId}
          onCaptureReady={onCaptureReady}
          isNewsPanelOpen={isNewsPanelOpen}
          onCloseNewsPanel={onCloseNewsPanel}
        />
      </div>
    );
  }

  // Render by Grid Layout
  const renderPane = (pane: ChartPaneConfig, index: number) => {
    if (!pane) return null;
    const isPrimary = index === 0 || pane.id === 'pane-0';
    return (
      <MultiChartPane
        key={pane.id}
        pane={pane}
        isPrimary={isPrimary}
        isActive={activePaneId === pane.id}
        isMaximized={false}
        onActivate={() => setActiveChartPane(pane.id)}
        onOpenSettings={onOpenSettings}
        onOpenDrawingSettings={onOpenDrawingSettings}
        captureRequestId={isPrimary ? captureRequestId : undefined}
        onCaptureReady={isPrimary ? onCaptureReady : undefined}
        isNewsPanelOpen={isPrimary ? isNewsPanelOpen : undefined}
        onCloseNewsPanel={isPrimary ? onCloseNewsPanel : undefined}
      />
    );
  };

  switch (layout) {
    case 'dual-horiz':
      return (
        <div className="w-full h-full min-w-0 min-h-0 grid grid-cols-2 gap-[1px] bg-[#1e222d]">
          {panes.slice(0, 2).map((pane, idx) => renderPane(pane, idx))}
        </div>
      );

    case 'dual-vert':
      return (
        <div className="w-full h-full min-w-0 min-h-0 grid grid-rows-2 gap-[1px] bg-[#1e222d]">
          {panes.slice(0, 2).map((pane, idx) => renderPane(pane, idx))}
        </div>
      );

    case 'triple-left':
      return (
        <div className="w-full h-full min-w-0 min-h-0 grid grid-cols-12 gap-[1px] bg-[#1e222d]">
          <div className="col-span-7 h-full min-h-0 min-w-0">
            {renderPane(panes[0], 0)}
          </div>
          <div className="col-span-5 h-full min-h-0 min-w-0 grid grid-rows-2 gap-[1px] bg-[#1e222d]">
            {renderPane(panes[1], 1)}
            {renderPane(panes[2], 2)}
          </div>
        </div>
      );

    case 'triple-top':
      return (
        <div className="w-full h-full min-w-0 min-h-0 grid grid-rows-12 gap-[1px] bg-[#1e222d]">
          <div className="row-span-7 w-full min-h-0 min-w-0">
            {renderPane(panes[0], 0)}
          </div>
          <div className="row-span-5 w-full min-h-0 min-w-0 grid grid-cols-2 gap-[1px] bg-[#1e222d]">
            {renderPane(panes[1], 1)}
            {renderPane(panes[2], 2)}
          </div>
        </div>
      );

    case 'triple-col':
      return (
        <div className="w-full h-full min-w-0 min-h-0 grid grid-cols-3 gap-[1px] bg-[#1e222d]">
          {panes.slice(0, 3).map((pane, idx) => renderPane(pane, idx))}
        </div>
      );

    case 'quad':
      return (
        <div className="w-full h-full min-w-0 min-h-0 grid grid-cols-2 grid-rows-2 gap-[1px] bg-[#1e222d]">
          {panes.slice(0, 4).map((pane, idx) => renderPane(pane, idx))}
        </div>
      );

    case 'single':
    default:
      return (
        <div className="w-full h-full min-w-0 min-h-0 relative bg-[#131722]">
          {renderPane(panes[0] || {
            id: 'pane-0',
            timeframe: (session?.timeframe as any) || 'm5',
            isLinkedToSessionSymbol: true,
            indicatorsEnabled: true,
            drawingFilter: 'all',
          }, 0)}
        </div>
      );
  }
};
