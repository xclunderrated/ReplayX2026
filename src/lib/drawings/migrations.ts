import { getDefaultToolPreset } from './defaults';
import { getDrawingToolDefinition } from './tools';
import type { DrawingObject, DrawingToolId } from './types';

export function migrateLegacyDrawing(legacy: any, zIndex: number): DrawingObject {
  const rawType = legacy.type === 'measure' ? 'measure' : legacy.type;
  // Map legacy type names to new DrawingToolId if needed
  let tool: DrawingToolId = 'trendline';
  if (rawType === 'trendline' || rawType === 'line') tool = 'trendline';
  else if (rawType === 'ray') tool = 'ray';
  else if (rawType === 'extendedLine') tool = 'extendedLine';
  else if (rawType === 'horizontalLine' || rawType === 'horizontal') tool = 'horizontalLine';
  else if (rawType === 'verticalLine' || rawType === 'vertical') tool = 'verticalLine';
  else if (rawType === 'parallelChannel') tool = 'parallelChannel';
  else if (rawType === 'rectangle') tool = 'rectangle';
  else if (rawType === 'measure') tool = 'measure';
  else if (rawType === 'longPosition' || rawType === 'long') tool = 'longPosition';
  else if (rawType === 'shortPosition' || rawType === 'short') tool = 'shortPosition';
  else if (rawType === 'fibRetracement' || rawType === 'fib') tool = 'fibRetracement';
  else if (rawType === 'arrow') tool = 'arrow';
  else if (rawType === 'brush') tool = 'brush';
  else if (rawType === 'polyline') tool = 'polyline';
  else if (rawType === 'text') tool = 'text';
  else if (rawType === 'callout') tool = 'callout';
  else if (rawType === 'anchoredNote' || rawType === 'note') tool = 'anchoredNote';
  else if (rawType === 'marker') tool = 'marker';

  const definition = getDrawingToolDefinition(tool);
  const preset = getDefaultToolPreset(tool);

  return {
    id: legacy.id ?? crypto.randomUUID(),
    tool,
    family: definition.family,
    points: legacy.points ?? [],
    style: {
      ...preset.style,
      strokeColor: legacy.color ?? legacy.style?.strokeColor ?? preset.style.strokeColor,
      fillColor: legacy.color ?? legacy.style?.fillColor ?? preset.style.fillColor,
      textColor: legacy.color ?? legacy.style?.textColor ?? preset.style.textColor,
      strokeWidth: legacy.style?.strokeWidth ?? preset.style.strokeWidth,
      strokeStyle: legacy.style?.strokeStyle ?? preset.style.strokeStyle,
      opacity: legacy.style?.opacity ?? preset.style.opacity,
    },
    text: legacy.text,
    locked: Boolean(legacy.locked),
    hidden: Boolean(legacy.hidden),
    zIndex,
    meta: { version: 1, source: 'manual' },
    createdAt: legacy.createdAt ?? Date.now(),
    updatedAt: legacy.updatedAt ?? Date.now(),
  };
}
