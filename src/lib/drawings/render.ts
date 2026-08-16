import type { DrawingObject, DrawingPoint } from './types';

export function bakeFillOpacity(fillColor: string | undefined, fillOpacity: number | undefined): string {
  const base = (fillColor || '').trim();
  const alpha = Math.min(Math.max(fillOpacity ?? 0.2, 0), 1);

  let m: RegExpMatchArray | null;
  let r = 59;
  let g = 130;
  let b = 246;
  if ((m = base.match(/^#([0-9a-f]{3})$/i))) {
    r = parseInt(m[1][0] + m[1][0], 16);
    g = parseInt(m[1][1] + m[1][1], 16);
    b = parseInt(m[1][2] + m[1][2], 16);
  } else if ((m = base.match(/^#([0-9a-f]{6})$/i))) {
    r = parseInt(m[1].slice(0, 2), 16);
    g = parseInt(m[1].slice(2, 4), 16);
    b = parseInt(m[1].slice(4, 6), 16);
  } else if ((m = base.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i))) {
    r = Number(m[1]);
    g = Number(m[2]);
    b = Number(m[3]);
  } else {
    return base || 'rgba(59, 130, 246, 0.2)';
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface CoordinateTransformer {
  toX: (time: number) => number | null;
  toY: (price: number) => number | null;
}

export interface RenderHandle {
  x: number;
  y: number;
  handleType?: string;
  anchorIndex?: number;
}

export interface RenderedDrawingItem {
  id: string;
  kind: string;
  tool: string;
  points: { x: number; y: number }[];
  y?: number;
  x?: number;
  stroke: string;
  strokeWidth: number;
  strokeStyle: string;
  opacity: number;
  fill?: string;
  fillOpacity?: number;
  textColor?: string;
  fontSize?: number;
  text?: string;
  selected: boolean;
  locked: boolean;
  hidden: boolean;
  handles: RenderHandle[];
}

export function buildDrawingRenderState(
  objects: DrawingObject[],
  transformer: CoordinateTransformer,
  selectedIds: string[] = []
): RenderedDrawingItem[] {
  const selectedSet = new Set(selectedIds);
  const result: RenderedDrawingItem[] = [];

  for (const obj of objects) {
    if (obj.hidden) continue;

    const screenPoints: { x: number; y: number }[] = [];
    let isValid = true;

    for (const pt of obj.points) {
      const x = transformer.toX(pt.time);
      const y = transformer.toY(pt.price);
      if (x === null || y === null) {
        isValid = false;
        break;
      }
      screenPoints.push({ x, y });
    }

    if (!isValid && screenPoints.length === 0) continue;

    const isSelected = selectedSet.has(obj.id);
    const handles: RenderHandle[] = isSelected
      ? screenPoints.map((pt, index) => ({ x: pt.x, y: pt.y, anchorIndex: index }))
      : [];

    let primaryY: number | undefined;
    let primaryX: number | undefined;
    if (obj.tool === 'horizontalLine' && screenPoints.length > 0) {
      primaryY = screenPoints[0].y;
    }
    if (obj.tool === 'verticalLine' && screenPoints.length > 0) {
      primaryX = screenPoints[0].x;
    }

    result.push({
      id: obj.id,
      kind: obj.tool,
      tool: obj.tool,
      points: screenPoints,
      y: primaryY,
      x: primaryX,
      stroke: obj.style.strokeColor,
      strokeWidth: obj.style.strokeWidth,
      strokeStyle: obj.style.strokeStyle,
      opacity: obj.style.opacity,
      fill: obj.style.fillColor,
      fillOpacity: obj.style.fillOpacity,
      textColor: obj.style.textColor,
      fontSize: obj.style.fontSize,
      text: obj.text,
      selected: isSelected,
      locked: obj.locked,
      hidden: obj.hidden,
      handles,
    });
  }

  return result;
}
