import type { Point2D, BoundingBox } from './geometry';
import { distanceToSegment } from './geometry';

export interface HitTestResult {
  target: 'body' | 'anchor' | 'handle';
  anchorIndex?: number;
  handle?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right';
}

export function hitTestTrendline(point: Point2D, anchors: Point2D[], threshold = 8): HitTestResult | null {
  // Check anchors first
  for (let i = 0; i < anchors.length; i += 1) {
    const anchor = anchors[i];
    if (Math.hypot(point.x - anchor.x, point.y - anchor.y) <= threshold) {
      return { target: 'anchor', anchorIndex: i };
    }
  }

  // Check segments
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const dist = distanceToSegment(point, anchors[i], anchors[i + 1]);
    if (dist <= threshold) {
      return { target: 'body' };
    }
  }

  return null;
}

export function hitTestRectangleHandles(
  point: Point2D,
  bounds: BoundingBox,
  threshold = 8
): HitTestResult | null {
  const corners: { handle: HitTestResult['handle']; x: number; y: number }[] = [
    { handle: 'top-left', x: bounds.x, y: bounds.y },
    { handle: 'top-right', x: bounds.x + bounds.width, y: bounds.y },
    { handle: 'bottom-left', x: bounds.x, y: bounds.y + bounds.height },
    { handle: 'bottom-right', x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ];

  for (const corner of corners) {
    if (Math.hypot(point.x - corner.x, point.y - corner.y) <= threshold) {
      return { target: 'handle', handle: corner.handle };
    }
  }

  // Check body
  if (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  ) {
    return { target: 'body' };
  }

  return null;
}
