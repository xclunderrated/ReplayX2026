import type { Timeframe } from '../store/useSimulatorStore';

export type MultiChartLayoutType =
  | 'single'
  | 'dual-horiz'
  | 'dual-vert'
  | 'triple-left'
  | 'triple-top'
  | 'triple-col'
  | 'quad';

export interface ChartPaneConfig {
  id: string;
  timeframe: Timeframe;
  instrument?: string; // Optional override if detached/independent
  isLinkedToSessionSymbol: boolean;
  indicatorsEnabled: boolean;
  drawingFilter?: 'all' | 'timeframe-only';
  syncTimeRange?: boolean;
}

export interface MultiChartState {
  layout: MultiChartLayoutType;
  activePaneId: string;
  maximizedPaneId: string | null;
  panes: ChartPaneConfig[];
  syncCrosshair: boolean;
  syncTimeRange: boolean;
  syncDrawings: boolean;
  syncSymbol: boolean;
  splitRatios: number[];
}

export interface MultiChartPreset {
  id: string;
  name: string;
  description: string;
  layout: MultiChartLayoutType;
  timeframes: Timeframe[];
}

export const MULTICHART_PRESETS: MultiChartPreset[] = [
  {
    id: 'single',
    name: 'Single Chart',
    description: 'Focused single workspace',
    layout: 'single',
    timeframes: ['m5'],
  },
  {
    id: 'scalp',
    name: 'Scalp Setup',
    description: '1m Execution + 5m Context + 15m Structure',
    layout: 'triple-left',
    timeframes: ['m1', 'm5', 'm15'],
  },
  {
    id: 'intraday',
    name: 'Intraday Flow',
    description: '5m Entry + 15m Trend + 1H Bias',
    layout: 'triple-left',
    timeframes: ['m5', 'm15', 'h1'],
  },
  {
    id: 'swing',
    name: 'Swing Bias',
    description: '15m Entry + 1H Structure + 4H Direction',
    layout: 'triple-left',
    timeframes: ['m15', 'h1', 'h4'],
  },
  {
    id: 'ict-quad',
    name: 'ICT 4-Timeframe Matrix',
    description: '1m Precision + 15m Intermediate + 1H Setup + 4H HTF Liquidity',
    layout: 'quad',
    timeframes: ['m1', 'm15', 'h1', 'h4'],
  },
  {
    id: 'dual-structure',
    name: 'Dual Timeframe',
    description: '5m Precision + 1H Higher Timeframe',
    layout: 'dual-horiz',
    timeframes: ['m5', 'h1'],
  },
];
