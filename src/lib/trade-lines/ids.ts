export const TRADE_DRAWING_PREFIX = 'trade:';
export const DRAFT_TRADE_DRAWING_ID = `${TRADE_DRAWING_PREFIX}draft`;
export const TRADE_ENTRY_SUFFIX = ':entry';
export const TRADE_SL_SUFFIX = ':sl';
export const TRADE_TP_SUFFIX = ':tp';
export const TRADE_PNL_SUFFIX = ':pnl';

export function isTradeDrawing(id: string): boolean {
  return id.startsWith(TRADE_DRAWING_PREFIX);
}

export function tradeDrawingId(tradeId: string): string {
  return `${TRADE_DRAWING_PREFIX}${tradeId}`;
}

/** Id of the full-width entry line drawing for a trade. */
export function tradeEntryLineId(tradeId: string): string {
  return `${TRADE_DRAWING_PREFIX}${tradeId}${TRADE_ENTRY_SUFFIX}`;
}

/** Id of the full-width stop-loss line drawing for a trade. */
export function tradeSlLineId(tradeId: string): string {
  return `${TRADE_DRAWING_PREFIX}${tradeId}${TRADE_SL_SUFFIX}`;
}

/** Id of the full-width take-profit line drawing for a trade. */
export function tradeTpLineId(tradeId: string): string {
  return `${TRADE_DRAWING_PREFIX}${tradeId}${TRADE_TP_SUFFIX}`;
}

/** Id of the live PnL label drawing (canvas-native position label) for a trade. */
export function tradePnlLabelId(tradeId: string): string {
  return `${TRADE_DRAWING_PREFIX}${tradeId}${TRADE_PNL_SUFFIX}`;
}

/** 'entry' | 'sl' | 'tp' | 'pnl' when the drawing is a trade overlay, null otherwise. */
export function tradeLineKind(drawingId: string): 'entry' | 'sl' | 'tp' | 'pnl' | null {
  if (drawingId.endsWith(TRADE_ENTRY_SUFFIX)) return 'entry';
  if (drawingId.endsWith(TRADE_SL_SUFFIX)) return 'sl';
  if (drawingId.endsWith(TRADE_TP_SUFFIX)) return 'tp';
  if (drawingId.endsWith(TRADE_PNL_SUFFIX)) return 'pnl';
  return null;
}

export function tradeIdFromDrawing(drawingId: string): string {
  const rest = drawingId.slice(TRADE_DRAWING_PREFIX.length);
  const colon = rest.indexOf(':');
  return colon === -1 ? rest : rest.slice(0, colon);
}
