/**
 * Module-level flag set while a trade SL/TP line is being dragged by the
 * custom full-width body drag. While set, syncTradeDrawings skips its diff so
 * the dragged line is never yanked back to the committed store price
 * mid-drag (the store is only written on mouse-up).
 */
let dragging = false;

export function setTradeLineDragging(value: boolean): void {
  dragging = value;
}

export function isTradeLineDragging(): boolean {
  return dragging;
}
