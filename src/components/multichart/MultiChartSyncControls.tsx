import React from 'react';
import {
  Crosshair,
  MoveHorizontal,
  PenTool,
  Link,
} from 'lucide-react';
import { useSimulatorStore } from '../../store/useSimulatorStore';

export const MultiChartSyncControls: React.FC = () => {
  const session = useSimulatorStore((state) =>
    state.sessions.find((s) => s.id === state.currentSessionId)
  );

  const toggleMultiChartSync = useSimulatorStore((state) => state.toggleMultiChartSync);

  if (!session || (session.multiChartLayout === 'single' && (!session.multiChartPanes || session.multiChartPanes.length <= 1))) {
    return null;
  }

  const syncCrosshair = session.syncCrosshair ?? true;
  const syncTimeRange = session.syncTimeRange ?? true;
  const syncDrawings = session.syncDrawings ?? true;

  const toggles = [
    {
      key: 'syncCrosshair' as const,
      label: 'Cursor',
      icon: <Crosshair size={13} />,
      active: syncCrosshair,
      title: 'Sync Crosshair & Hover across all charts',
    },
    {
      key: 'syncTimeRange' as const,
      label: 'Scroll & Zoom',
      icon: <MoveHorizontal size={13} />,
      active: syncTimeRange,
      title: 'Sync Time Span Scroll & Zoom across all charts',
    },
    {
      key: 'syncDrawings' as const,
      label: 'Drawings',
      icon: <PenTool size={13} />,
      active: syncDrawings,
      title: 'Sync Drawings & Annotations',
    },
  ];

  return (
    <div className="flex items-center space-x-1 pl-1">
      {toggles.map((item) => (
        <button
          key={item.key}
          onClick={() => toggleMultiChartSync(item.key)}
          title={item.title}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium transition-colors ${
            item.active
              ? 'bg-[#2962ff20] text-[#2962ff]'
              : 'text-[#868993] hover:text-[#d1d4dc] hover:bg-[#2a2e39]'
          }`}
        >
          {item.icon}
          <span className="hidden xl:inline">{item.label}</span>
        </button>
      ))}
    </div>
  );
};
