import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutGrid,
  Columns,
  Rows,
  Sparkles,
  ChevronDown,
  Check,
} from 'lucide-react';
import {
  useSimulatorStore,
  type MultiChartLayoutType,
  MULTICHART_PRESETS,
} from '../../store/useSimulatorStore';

export const MultiChartLayoutSelector: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const session = useSimulatorStore((state) =>
    state.sessions.find((s) => s.id === state.currentSessionId)
  );

  const setMultiChartLayout = useSimulatorStore((state) => state.setMultiChartLayout);
  const applyMultiChartPreset = useSimulatorStore((state) => state.applyMultiChartPreset);

  const currentLayout: MultiChartLayoutType = session?.multiChartLayout || 'single';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const layouts: { id: MultiChartLayoutType; label: string; icon: React.ReactNode }[] = [
    {
      id: 'single',
      label: 'Single Chart',
      icon: (
        <div className="w-4 h-3.5 border border-[#868993] rounded-[2px] bg-[#868993]/20 flex items-center justify-center" />
      ),
    },
    {
      id: 'dual-horiz',
      label: '2 Charts (Horizontal)',
      icon: (
        <div className="w-4 h-3.5 border border-[#868993] rounded-[2px] flex overflow-hidden">
          <div className="w-1/2 border-r border-[#868993] bg-[#868993]/30" />
          <div className="w-1/2 bg-[#868993]/10" />
        </div>
      ),
    },
    {
      id: 'dual-vert',
      label: '2 Charts (Vertical)',
      icon: (
        <div className="w-4 h-3.5 border border-[#868993] rounded-[2px] flex flex-col overflow-hidden">
          <div className="h-1/2 border-b border-[#868993] bg-[#868993]/30" />
          <div className="h-1/2 bg-[#868993]/10" />
        </div>
      ),
    },
    {
      id: 'triple-left',
      label: '3 Charts (1 Large Left)',
      icon: (
        <div className="w-4 h-3.5 border border-[#868993] rounded-[2px] flex overflow-hidden">
          <div className="w-3/5 border-r border-[#868993] bg-[#868993]/30" />
          <div className="w-2/5 flex flex-col">
            <div className="h-1/2 border-b border-[#868993] bg-[#868993]/10" />
            <div className="h-1/2 bg-[#868993]/10" />
          </div>
        </div>
      ),
    },
    {
      id: 'triple-top',
      label: '3 Charts (1 Large Top)',
      icon: (
        <div className="w-4 h-3.5 border border-[#868993] rounded-[2px] flex flex-col overflow-hidden">
          <div className="h-3/5 border-b border-[#868993] bg-[#868993]/30" />
          <div className="h-2/5 flex">
            <div className="w-1/2 border-r border-[#868993] bg-[#868993]/10" />
            <div className="w-1/2 bg-[#868993]/10" />
          </div>
        </div>
      ),
    },
    {
      id: 'triple-col',
      label: '3 Columns',
      icon: (
        <div className="w-4 h-3.5 border border-[#868993] rounded-[2px] flex overflow-hidden">
          <div className="w-1/3 border-r border-[#868993] bg-[#868993]/30" />
          <div className="w-1/3 border-r border-[#868993] bg-[#868993]/10" />
          <div className="w-1/3 bg-[#868993]/10" />
        </div>
      ),
    },
    {
      id: 'quad',
      label: '4 Charts (Quad)',
      icon: (
        <div className="w-4 h-3.5 border border-[#868993] rounded-[2px] grid grid-cols-2 grid-rows-2 overflow-hidden">
          <div className="border-r border-b border-[#868993] bg-[#868993]/30" />
          <div className="border-b border-[#868993] bg-[#868993]/10" />
          <div className="border-r border-[#868993] bg-[#868993]/10" />
          <div className="bg-[#868993]/30" />
        </div>
      ),
    },
  ];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors text-[13px] font-medium ${
          currentLayout !== 'single'
            ? 'bg-[#2962ff20] text-[#2962ff]'
            : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
        }`}
        title="Multi-Chart Layout"
      >
        <LayoutGrid size={15} className={currentLayout !== 'single' ? 'text-[#2962ff]' : 'text-[#868993]'} />
        <span className="hidden sm:inline">
          {currentLayout === 'single' ? 'Layout' : layouts.find((l) => l.id === currentLayout)?.label || 'Grid'}
        </span>
        <ChevronDown size={10} className="text-[#868993]" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-64 rounded-lg bg-[#1e222d] border border-[#2a2e39] shadow-2xl p-1.5 z-50 text-[12px]">
          {/* Layout Grid Selector */}
          <div className="mb-2">
            <div className="text-[10px] font-bold text-[#868993] uppercase tracking-wider px-2 py-1">
              Workstation Layouts
            </div>
            <div className="space-y-0.5">
              {layouts.map((l) => {
                const isActive = currentLayout === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => {
                      setMultiChartLayout(l.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${
                      isActive
                        ? 'bg-[#2962ff20] text-[#2962ff] font-bold'
                        : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {l.icon}
                      <span>{l.label}</span>
                    </div>
                    {isActive && <Check size={13} className="text-[#2962ff]" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-[#2a2e39] my-1" />

          {/* Multi-Timeframe Presets */}
          <div>
            <div className="text-[10px] font-bold text-[#868993] uppercase tracking-wider px-2 py-1 flex items-center gap-1">
              <Sparkles size={11} className="text-amber-400" />
              <span>Timeframe Presets</span>
            </div>
            <div className="space-y-0.5">
              {MULTICHART_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    applyMultiChartPreset(preset.id);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left hover:bg-[#2a2e39] transition-colors"
                >
                  <div>
                    <div className="text-[#d1d4dc] font-medium">{preset.name}</div>
                    <div className="text-[10px] text-[#868993]">{preset.description}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {preset.timeframes.map((tf) => (
                      <span
                        key={tf}
                        className="px-1 py-0.5 rounded bg-[#131722] text-[10px] text-[#868993] font-mono uppercase"
                      >
                        {tf}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
