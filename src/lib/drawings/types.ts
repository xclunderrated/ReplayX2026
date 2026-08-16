export type DrawingToolId =
  | 'select'
  | 'trendline'
  | 'ray'
  | 'extendedLine'
  | 'horizontalLine'
  | 'verticalLine'
  | 'parallelChannel'
  | 'rectangle'
  | 'measure'
  | 'longPosition'
  | 'shortPosition'
  | 'fibRetracement'
  | 'arrow'
  | 'brush'
  | 'polyline'
  | 'text'
  | 'callout'
  | 'anchoredNote'
  | 'marker'
  | 'horizontalRay'
  | 'trendAngle'
  | 'infoLine'
  | 'rotatedRectangle'
  | 'ellipse'
  | 'circle'
  | 'triangle'
  | 'disjointChannel'
  | 'flatTopBottom'
  | 'highlighter'
  | 'path'
  | 'curve'
  | 'doubleCurve'
  | 'fibExtension'
  | 'fibChannel'
  | 'fibSpeedFan'
  | 'fibTimeExtension'
  | 'fibTimeZone'
  | 'fibCircles'
  | 'fibArcs'
  | 'fibWedge'
  | 'fibSpiral'
  | 'gannBox'
  | 'gannFan'
  | 'gannSquare'
  | 'gannSquareFixed'
  | 'andrewsPitchfork'
  | 'schiffPitchfork'
  | 'modifiedSchiffPitchfork'
  | 'insidePitchfork'
  | 'dateRange'
  | 'priceRange'
  | 'forecast'
  | 'projection'
  | 'regressionTrend'
  | 'comment'
  | 'priceLabel'
  | 'priceNote'
  | 'arrowMarker'
  | 'flagMark'
  | 'signpost';

export type DrawingFamily = 'line' | 'range' | 'ratio' | 'path' | 'annotation';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingPoint {
  time: number;
  price: number;
  rawTime?: number;
}

export interface DrawingStyle {
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number;
  fillColor?: string;
  fillOpacity?: number;
  textColor?: string;
  fontSize?: number;
  backgroundColor?: string;
  extendLeft?: boolean;
  extendRight?: boolean;
  fibLevels?: number[];
  fibColors?: Record<number, string>;
  showPrices?: boolean;
  showLabels?: boolean;
  showStats?: boolean;
  showBars?: boolean;
  showAngle?: boolean;
  riskRewardRatio?: number;
  accountSize?: number;
  riskPercent?: number;
}

export interface DrawingObject {
  id: string;
  tool: DrawingToolId;
  family: DrawingFamily;
  points: DrawingPoint[];
  style: DrawingStyle;
  text?: string;
  locked: boolean;
  hidden: boolean;
  zIndex: number;
  meta: {
    version: 1;
    name?: string;
    notes?: string;
    source?: 'manual' | 'template' | 'import';
  };
  createdAt: number;
  updatedAt: number;
}
