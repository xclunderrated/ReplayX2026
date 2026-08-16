import type { DrawingToolId, DrawingStyle } from './types';

export interface ToolPreset {
  style: DrawingStyle;
}

const DEFAULT_FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export function getDefaultToolPreset(tool: DrawingToolId): ToolPreset {
  switch (tool) {
    case 'rectangle':
      return {
        style: {
          strokeColor: '#3b82f6',
          strokeWidth: 2,
          strokeStyle: 'solid',
          opacity: 1,
          fillColor: '#3b82f6',
          fillOpacity: 0.2,
        },
      };

    case 'parallelChannel':
      return {
        style: {
          strokeColor: '#3b82f6',
          strokeWidth: 2,
          strokeStyle: 'solid',
          opacity: 1,
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
        },
      };

    case 'fibRetracement':
      return {
        style: {
          strokeColor: '#787b86',
          strokeWidth: 1,
          strokeStyle: 'solid',
          opacity: 1,
          fibLevels: DEFAULT_FIB_LEVELS,
          showPrices: true,
          showLabels: true,
        },
      };

    case 'longPosition':
      return {
        style: {
          strokeColor: '#089981',
          strokeWidth: 1,
          strokeStyle: 'solid',
          opacity: 1,
          fillColor: '#089981',
          fillOpacity: 0.2,
          showStats: true,
        },
      };

    case 'shortPosition':
      return {
        style: {
          strokeColor: '#f23645',
          strokeWidth: 1,
          strokeStyle: 'solid',
          opacity: 1,
          fillColor: '#f23645',
          fillOpacity: 0.2,
          showStats: true,
        },
      };

    case 'measure':
      return {
        style: {
          strokeColor: '#3b82f6',
          strokeWidth: 1,
          strokeStyle: 'dashed',
          opacity: 0.9,
          fillColor: '#3b82f6',
          fillOpacity: 0.1,
          showStats: true,
        },
      };

    case 'text':
    case 'callout':
    case 'anchoredNote':
      return {
        style: {
          strokeColor: '#3b82f6',
          strokeWidth: 1,
          strokeStyle: 'solid',
          opacity: 1,
          textColor: '#e4e4e7',
          fontSize: 14,
          backgroundColor: '#18181b',
        },
      };

    default:
      return {
        style: {
          strokeColor: '#3b82f6',
          strokeWidth: 2,
          strokeStyle: 'solid',
          opacity: 1,
        },
      };
  }
}
