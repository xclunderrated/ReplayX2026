import { DRAWING_TOOLS } from './tools';
import type { DrawingObject, DrawingToolId } from './types';
import type { ToolPreset } from './defaults';

export interface ToolbarGroup {
  id: string;
  label: string;
  tools: {
    id: DrawingToolId;
    label: string;
    shortcut?: string;
    icon?: string;
  }[];
}

export interface ToolbarTool {
  id: DrawingToolId;
  label: string;
  shortcut?: string;
  icon?: string;
}

export interface ToolbarGroup {
  id: string;
  label: string;
  sections: { label: string; tools: ToolbarTool[] }[];
  tools: ToolbarTool[];
}

function groupTools(
  sections: ToolbarGroup['sections'],
): ToolbarGroup['tools'] {
  return sections.flatMap((section) => section.tools);
}

export function getToolbarGroups(): ToolbarGroup[] {
  const groups: ToolbarGroup[] = [
    {
      id: 'select',
      label: 'Select',
      sections: [
        {
          label: 'Select',
          tools: [{ id: 'select', label: 'Cursor / Select', shortcut: 'V' }],
        },
      ],
      tools: [],
    },
    {
      id: 'lines',
      label: 'Trend Line Tools',
      sections: [
        {
          label: 'Trend Lines',
          tools: [
            { id: 'trendline', label: 'Trend Line', shortcut: 'T' },
            { id: 'ray', label: 'Ray' },
            { id: 'extendedLine', label: 'Extended Line' },
          ],
        },
        {
          label: 'Horizontal / Vertical',
          tools: [
            { id: 'horizontalLine', label: 'Horizontal Line', shortcut: 'H' },
            { id: 'verticalLine', label: 'Vertical Line', shortcut: 'Shift+H' },
            { id: 'horizontalRay', label: 'Horizontal Ray' },
          ],
        },
        {
          label: 'Angles & Info',
          tools: [
            { id: 'trendAngle', label: 'Trend Angle' },
            { id: 'infoLine', label: 'Info Line' },
          ],
        },
        {
          label: 'Arrows',
          tools: [{ id: 'arrow', label: 'Arrow Line' }],
        },
      ],
      tools: [],
    },
    {
      id: 'fib',
      label: 'Fibonacci',
      sections: [
        {
          label: 'Retracement & Extension',
          tools: [
            { id: 'fibRetracement', label: 'Fib Retracement', shortcut: 'F' },
            { id: 'fibExtension', label: 'Fib Extension' },
          ],
        },
        {
          label: 'Fib Channels & Fans',
          tools: [
            { id: 'fibChannel', label: 'Fib Channel' },
            { id: 'fibSpeedFan', label: 'Fib Speed Fan' },
          ],
        },
        {
          label: 'Fib Time',
          tools: [
            { id: 'fibTimeExtension', label: 'Fib Time Extension' },
            { id: 'fibTimeZone', label: 'Fib Time Zone' },
          ],
        },
        {
          label: 'Fib Geometry',
          tools: [
            { id: 'fibCircles', label: 'Fib Circles' },
            { id: 'fibArcs', label: 'Fib Arcs' },
            { id: 'fibWedge', label: 'Fib Wedge' },
            { id: 'fibSpiral', label: 'Fib Spiral' },
          ],
        },
      ],
      tools: [],
    },
    {
      id: 'gann',
      label: 'Gann',
      sections: [
        {
          label: 'Gann',
          tools: [
            { id: 'gannBox', label: 'Gann Box' },
            { id: 'gannFan', label: 'Gann Fan' },
            { id: 'gannSquare', label: 'Gann Square' },
            { id: 'gannSquareFixed', label: 'Gann Square Fixed' },
          ],
        },
      ],
      tools: [],
    },
    {
      id: 'pitchforks',
      label: 'Pitchforks',
      sections: [
        {
          label: 'Pitchforks',
          tools: [
            { id: 'andrewsPitchfork', label: 'Andrews Pitchfork' },
            { id: 'schiffPitchfork', label: 'Schiff Pitchfork' },
            { id: 'modifiedSchiffPitchfork', label: 'Modified Schiff Pitchfork' },
            { id: 'insidePitchfork', label: 'Inside Pitchfork' },
          ],
        },
      ],
      tools: [],
    },
    {
      id: 'shapes',
      label: 'Geometric Shapes',
      sections: [
        {
          label: 'Rectangles & Polygons',
          tools: [
            { id: 'rectangle', label: 'Rectangle', shortcut: 'R' },
            { id: 'rotatedRectangle', label: 'Rotated Rectangle' },
            { id: 'triangle', label: 'Triangle' },
          ],
        },
        {
          label: 'Ellipses & Circles',
          tools: [
            { id: 'ellipse', label: 'Ellipse' },
            { id: 'circle', label: 'Circle' },
          ],
        },
        {
          label: 'Channels',
          tools: [
            { id: 'parallelChannel', label: 'Parallel Channel', shortcut: 'C' },
            { id: 'disjointChannel', label: 'Disjoint Channel' },
            { id: 'flatTopBottom', label: 'Flat Top/Bottom' },
          ],
        },
        {
          label: 'Freehand',
          tools: [
            { id: 'brush', label: 'Freehand Brush', shortcut: 'B' },
            { id: 'highlighter', label: 'Highlighter' },
          ],
        },
        {
          label: 'Paths',
          tools: [
            { id: 'polyline', label: 'Polyline' },
            { id: 'path', label: 'Path' },
            { id: 'curve', label: 'Curve' },
            { id: 'doubleCurve', label: 'Double Curve' },
          ],
        },
      ],
      tools: [],
    },
    {
      id: 'calc',
      label: 'Forecasting & Measure',
      sections: [
        {
          label: 'Measure',
          tools: [{ id: 'measure', label: 'Ruler / Measure', shortcut: 'M' }],
        },
        {
          label: 'Ranges',
          tools: [
            { id: 'dateRange', label: 'Date Range' },
            { id: 'priceRange', label: 'Price Range' },
          ],
        },
        {
          label: 'Positions',
          tools: [
            { id: 'longPosition', label: 'Long Position', shortcut: 'L' },
            { id: 'shortPosition', label: 'Short Position', shortcut: 'S' },
          ],
        },
        {
          label: 'Forecasting',
          tools: [
            { id: 'forecast', label: 'Forecast' },
            { id: 'projection', label: 'Projection' },
            { id: 'regressionTrend', label: 'Regression Trend' },
          ],
        },
      ],
      tools: [],
    },
    {
      id: 'text',
      label: 'Annotations',
      sections: [
        {
          label: 'Text',
          tools: [
            { id: 'text', label: 'Text Note', shortcut: 'X' },
            { id: 'callout', label: 'Callout Box' },
            { id: 'anchoredNote', label: 'Anchored Note' },
            { id: 'comment', label: 'Comment Bubble' },
          ],
        },
        {
          label: 'Labels',
          tools: [
            { id: 'priceLabel', label: 'Price Label' },
            { id: 'priceNote', label: 'Price Note' },
          ],
        },
        {
          label: 'Marks',
          tools: [
            { id: 'arrowMarker', label: 'Arrow Marker' },
            { id: 'flagMark', label: 'Flag Mark' },
            { id: 'signpost', label: 'Signpost' },
          ],
        },
      ],
      tools: [],
    },
  ];

  for (const group of groups) {
    group.tools = groupTools(group.sections);
  }

  return groups;
}

export interface InspectorSection {
  id: string;
  title: string;
}

export function getInspectorSections(input: {
  activeTool: DrawingToolId | null;
  selectedObjects: DrawingObject[];
  toolDefaults: Record<DrawingToolId, ToolPreset>;
}): InspectorSection[] {
  if (input.selectedObjects.length === 0) {
    return [{ id: 'tool-defaults', title: 'Tool Defaults' }];
  }
  return [
    { id: 'style', title: 'Style' },
    { id: 'geometry', title: 'Geometry' },
    { id: 'actions', title: 'Actions' },
  ];
}
