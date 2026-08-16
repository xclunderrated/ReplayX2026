import type { DrawingFamily, DrawingToolId } from './types';

export interface DrawingToolDefinition {
  id: DrawingToolId;
  family: DrawingFamily;
  shortcut?: string;
  anchorCount: number | 'dynamic';
  label: string;
}

export const DRAWING_TOOLS: DrawingToolDefinition[] = [
  { id: 'select', family: 'annotation', shortcut: 'V', anchorCount: 0, label: 'Select' },
  { id: 'trendline', family: 'line', shortcut: 'T', anchorCount: 2, label: 'Trend Line' },
  { id: 'ray', family: 'line', anchorCount: 2, label: 'Ray' },
  { id: 'extendedLine', family: 'line', anchorCount: 2, label: 'Extended Line' },
  { id: 'horizontalLine', family: 'line', shortcut: 'H', anchorCount: 1, label: 'Horizontal Line' },
  { id: 'verticalLine', family: 'line', shortcut: 'V', anchorCount: 1, label: 'Vertical Line' },
  { id: 'parallelChannel', family: 'range', anchorCount: 3, label: 'Parallel Channel' },
  { id: 'rectangle', family: 'range', shortcut: 'R', anchorCount: 2, label: 'Rectangle' },
  { id: 'measure', family: 'range', shortcut: 'M', anchorCount: 2, label: 'Measure' },
  { id: 'longPosition', family: 'ratio', shortcut: 'L', anchorCount: 2, label: 'Long Position' },
  { id: 'shortPosition', family: 'ratio', shortcut: 'S', anchorCount: 2, label: 'Short Position' },
  { id: 'fibRetracement', family: 'ratio', shortcut: 'F', anchorCount: 2, label: 'Fib Retracement' },
  { id: 'arrow', family: 'line', anchorCount: 2, label: 'Arrow' },
  { id: 'brush', family: 'path', shortcut: 'B', anchorCount: 'dynamic', label: 'Brush' },
  { id: 'polyline', family: 'path', anchorCount: 'dynamic', label: 'Polyline' },
  { id: 'text', family: 'annotation', shortcut: 'A', anchorCount: 1, label: 'Text' },
  { id: 'callout', family: 'annotation', anchorCount: 2, label: 'Callout' },
  { id: 'anchoredNote', family: 'annotation', anchorCount: 1, label: 'Anchored Note' },
  { id: 'marker', family: 'annotation', anchorCount: 1, label: 'Marker' },

  // NEW LINE TOOLS
  { id: 'horizontalRay', family: 'line', anchorCount: 1, label: 'Horizontal Ray' },
  { id: 'trendAngle', family: 'line', anchorCount: 2, label: 'Trend Angle' },
  { id: 'infoLine', family: 'line', anchorCount: 2, label: 'Info Line' },

  // NEW SHAPE & CHANNEL TOOLS
  { id: 'rotatedRectangle', family: 'range', anchorCount: 3, label: 'Rotated Rectangle' },
  { id: 'ellipse', family: 'range', anchorCount: 3, label: 'Ellipse' },
  { id: 'circle', family: 'range', anchorCount: 2, label: 'Circle' },
  { id: 'triangle', family: 'range', anchorCount: 3, label: 'Triangle' },
  { id: 'disjointChannel', family: 'range', anchorCount: 4, label: 'Disjoint Channel' },
  { id: 'flatTopBottom', family: 'range', anchorCount: 3, label: 'Flat Top/Bottom' },
  { id: 'highlighter', family: 'path', anchorCount: 'dynamic', label: 'Highlighter' },
  { id: 'path', family: 'path', anchorCount: 'dynamic', label: 'Path' },
  { id: 'curve', family: 'path', anchorCount: 3, label: 'Curve' },
  { id: 'doubleCurve', family: 'path', anchorCount: 3, label: 'Double Curve' },

  // NEW GANN, PITCHFORK & FIBONACCI TOOLS
  { id: 'fibExtension', family: 'ratio', anchorCount: 3, label: 'Fib Extension' },
  { id: 'fibChannel', family: 'ratio', anchorCount: 3, label: 'Fib Channel' },
  { id: 'fibSpeedFan', family: 'ratio', anchorCount: 2, label: 'Fib Speed Fan' },
  { id: 'fibTimeExtension', family: 'ratio', anchorCount: 3, label: 'Fib Time Extension' },
  { id: 'fibTimeZone', family: 'ratio', anchorCount: 2, label: 'Fib Time Zone' },
  { id: 'fibCircles', family: 'ratio', anchorCount: 2, label: 'Fib Circles' },
  { id: 'fibArcs', family: 'ratio', anchorCount: 2, label: 'Fib Arcs' },
  { id: 'fibWedge', family: 'ratio', anchorCount: 3, label: 'Fib Wedge' },
  { id: 'fibSpiral', family: 'ratio', anchorCount: 2, label: 'Fib Spiral' },
  { id: 'gannBox', family: 'ratio', anchorCount: 2, label: 'Gann Box' },
  { id: 'gannFan', family: 'ratio', anchorCount: 2, label: 'Gann Fan' },
  { id: 'gannSquare', family: 'ratio', anchorCount: 2, label: 'Gann Square' },
  { id: 'gannSquareFixed', family: 'ratio', anchorCount: 1, label: 'Gann Square Fixed' },
  { id: 'andrewsPitchfork', family: 'ratio', anchorCount: 3, label: 'Andrews Pitchfork' },
  { id: 'schiffPitchfork', family: 'ratio', anchorCount: 3, label: 'Schiff Pitchfork' },
  { id: 'modifiedSchiffPitchfork', family: 'ratio', anchorCount: 3, label: 'Modified Schiff Pitchfork' },
  { id: 'insidePitchfork', family: 'ratio', anchorCount: 3, label: 'Inside Pitchfork' },

  // NEW MEASUREMENT & FORECAST TOOLS
  { id: 'dateRange', family: 'range', anchorCount: 2, label: 'Date Range' },
  { id: 'priceRange', family: 'range', anchorCount: 2, label: 'Price Range' },
  { id: 'forecast', family: 'ratio', anchorCount: 2, label: 'Forecast' },
  { id: 'projection', family: 'ratio', anchorCount: 2, label: 'Projection' },
  { id: 'regressionTrend', family: 'range', anchorCount: 2, label: 'Regression Trend' },

  // NEW TEXT & ANNOTATION TOOLS
  { id: 'comment', family: 'annotation', anchorCount: 1, label: 'Comment Bubble' },
  { id: 'priceLabel', family: 'annotation', anchorCount: 1, label: 'Price Label' },
  { id: 'priceNote', family: 'annotation', anchorCount: 1, label: 'Price Note' },
  { id: 'arrowMarker', family: 'annotation', anchorCount: 1, label: 'Arrow Marker' },
  { id: 'flagMark', family: 'annotation', anchorCount: 1, label: 'Flag Mark' },
  { id: 'signpost', family: 'annotation', anchorCount: 1, label: 'Signpost' },
];

export function getDrawingToolDefinition(id: DrawingToolId): DrawingToolDefinition {
  const tool = DRAWING_TOOLS.find((entry) => entry.id === id);
  if (!tool) throw new Error(`Unknown drawing tool: ${id}`);
  return tool;
}
