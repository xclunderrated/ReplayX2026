import type { DrawingPoint } from './types';

export interface Point2D {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function translatePoints(points: DrawingPoint[], delta: { timeDelta: number; priceDelta: number }): DrawingPoint[] {
  return points.map((point) => ({
    time: point.time + delta.timeDelta,
    price: point.price + delta.priceDelta,
  }));
}

export function getLineBoundingBox(p1: Point2D, p2: Point2D): BoundingBox {
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function constrainTrendlineAngle(start: DrawingPoint, current: DrawingPoint): DrawingPoint {
  const deltaTime = current.time - start.time;
  const deltaPrice = current.price - start.price;

  if (deltaTime === 0 && deltaPrice === 0) {
    return { ...current };
  }

  // Calculate slope angle in normalized space
  const angle = Math.atan2(deltaPrice, deltaTime);
  const step = Math.PI / 4; // 45 degrees
  const snappedAngle = Math.round(angle / step) * step;

  // Horizontal snap (0 or 180 deg)
  if (Math.abs(snappedAngle) < 1e-5 || Math.abs(Math.abs(snappedAngle) - Math.PI) < 1e-5) {
    return {
      time: current.time,
      price: start.price,
    };
  }

  // Vertical snap (90 or -90 deg)
  if (Math.abs(Math.abs(snappedAngle) - Math.PI / 2) < 1e-5) {
    return {
      time: start.time,
      price: current.price,
    };
  }

  // Diagonal snap (45, 135, -45, -135 deg)
  const signX = Math.sign(deltaTime) || 1;
  const signY = Math.sign(Math.tan(snappedAngle)) || 1;
  const absDelta = Math.abs(deltaTime);
  return {
    time: current.time,
    price: start.price + absDelta * signX * signY,
  };
}

export function distanceToSegment(point: Point2D, p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.hypot(point.x - p1.x, point.y - p1.y);
  }

  let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = p1.x + t * dx;
  const projY = p1.y + t * dy;

  return Math.hypot(point.x - projX, point.y - projY);
}
