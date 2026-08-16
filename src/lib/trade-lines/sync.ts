import * as Drawings from 'lightweight-charts-drawing';
import { isTradeLineDragging } from './dragGuard';
import { isTradeDrawing } from './ids';

function anchorsSignature(anchors: Drawings.Anchor[]): string {
  let sig = '';
  for (const p of anchors) {
    if (!p) {
      sig += 'null;';
      continue;
    }
    sig += `${typeof p.time === 'number' ? p.time : String(p.time)}:${typeof p.price === 'number' && Number.isFinite(p.price) ? p.price.toPrecision(12) : String(p.price)};`;
  }
  return sig;
}

/**
 * Project the desired trade drawings onto the manager. Only trade drawings
 * (`trade:`-prefixed ids) are ever added/updated/removed here; store-owned
 * drawings are left untouched. Trade drawings are a runtime projection of the
 * session's trades, so a drawing whose trade disappeared is removed.
 */
export function syncTradeDrawings(
  manager: Drawings.DrawingManager,
  desired: Drawings.IDrawing[],
): void {
  // Skip the whole diff while a line is being body-dragged — the dragged
  // drawing is updated directly and the store commit happens on mouse-up.
  if (isTradeLineDragging()) return;

  const desiredIds = new Set(desired.map((d) => d.id));

  for (const drawing of desired) {
    const existing = manager.getDrawing(drawing.id);
    if (!existing) {
      manager.addDrawing(drawing);
      continue;
    }
    if (anchorsSignature(existing.anchors) !== anchorsSignature(drawing.anchors)) {
      (existing as Drawings.Drawing).setAnchors(drawing.anchors as Drawings.Anchor[]);
    }
  }

  for (const drawing of manager.getAllDrawings()) {
    if (isTradeDrawing(drawing.id) && !desiredIds.has(drawing.id)) {
      manager.removeDrawing(drawing.id);
    }
  }
}
