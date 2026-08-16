import * as Drawings from 'lightweight-charts-drawing';
import type { IPrimitivePaneRenderer, IPrimitivePaneView } from 'lightweight-charts';

export type TradeLineKind = 'entry' | 'sl' | 'tp';

interface BitmapCoordinateScope {
  context: CanvasRenderingContext2D;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
}

/** Structural subset of the fancy-canvas render target used by pane renderers. */
interface PaneRenderTarget {
  useBitmapCoordinateSpace(cb: (scope: BitmapCoordinateScope) => void): void;
}

const LINE_HIT_THRESHOLD = 8;
const ANCHOR_HIT_RADIUS = 6;
const CHIP_PADDING = 5;
const CHIP_RADIUS = 3;

/**
 * Full-width trade line rendered natively on the chart canvas, TradingView
 * style: a solid horizontal line at the trade price plus a rounded label
 * chip pinned to the right edge of the viewport.
 *
 * The chip text is updated live via `setText` (no drawing identity change),
 * so a recompute only repaints the canvas instead of recreating the drawing.
 */
export class TradeLineDrawing extends Drawings.Drawing {
  static readonly REQUIRED_ANCHORS = 1;

  readonly type = 'trade-line';
  readonly kind: TradeLineKind;
  private chipText: string;

  constructor(
    id: string,
    kind: TradeLineKind,
    chipText: string,
    anchors?: Drawings.Anchor[],
    style?: Partial<Drawings.DrawingStyle>,
    options?: Partial<Drawings.DrawingOptions>,
  ) {
    super(id, anchors, style, options);
    this.kind = kind;
    this.chipText = chipText;
  }

  static create(
    id: string,
    kind: TradeLineKind,
    price: number,
    time: number,
    chipText: string,
    style?: Partial<Drawings.DrawingStyle>,
    options?: Partial<Drawings.DrawingOptions>,
  ): TradeLineDrawing {
    return new TradeLineDrawing(id, kind, chipText, [{ time: time as any, price }], style, options);
  }

  getText(): string {
    return this.chipText;
  }

  setText(text: string): void {
    if (text === this.chipText) return;
    this.chipText = text;
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= TradeLineDrawing.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new TradeLinePaneView(this)];
  }

  computeGeometry(): Drawings.Geometry[] {
    return [];
  }

  testHit(point: Drawings.Point, viewport: Drawings.Viewport): boolean {
    const anchor = this._anchors[0];
    if (!anchor) return false;
    const yCoord = viewport.priceScale.priceToCoordinate(anchor.price);
    if (yCoord === null) return false;
    return Math.abs(point.y - yCoord) <= LINE_HIT_THRESHOLD;
  }

  getControlPoints(viewport: Drawings.Viewport): Drawings.ControlPoint[] {
    const anchor = this._anchors[0];
    if (!anchor) return [];
    const yCoord = viewport.priceScale.priceToCoordinate(anchor.price);
    return yCoord !== null ? [{ index: 0, x: viewport.width - 20, y: yCoord, radius: ANCHOR_HIT_RADIUS }] : [];
  }

  hitTestAnchor(point: Drawings.Point, viewport: Drawings.Viewport): number | null {
    for (const cp of this.getControlPoints(viewport)) {
      if (Math.hypot(point.x - cp.x, point.y - cp.y) <= cp.radius + 2) return cp.index;
    }
    return null;
  }

  clone(newId: string): Drawings.IDrawing {
    return new TradeLineDrawing(
      newId,
      this.kind,
      this.chipText,
      this._anchors.map((a) => ({ ...a })),
      { ...this._style },
      { ...this._options },
    );
  }
}

class TradeLinePaneView implements IPrimitivePaneView {
  private readonly _renderer: TradeLinePaneRenderer;

  constructor(drawing: TradeLineDrawing) {
    this._renderer = new TradeLinePaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class TradeLinePaneRenderer implements IPrimitivePaneRenderer {
  private readonly _drawing: TradeLineDrawing;

  constructor(drawing: TradeLineDrawing) {
    this._drawing = drawing;
  }

  draw(target: PaneRenderTarget): void {
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      const drawing = this._drawing;
      const viewport = drawing.getViewport();
      if (!viewport || !drawing.options.visible || !drawing.isValid()) return;
      const anchor = drawing.anchors[0];
      if (!anchor) return;
      const yCoord = viewport.priceScale.priceToCoordinate(anchor.price);
      if (yCoord === null) return;

      const style = drawing.style;
      const hRatio = horizontalPixelRatio;
      const vRatio = verticalPixelRatio;
      const lineWidth = (style.lineWidth ?? 1) * hRatio;
      const lineY = Math.round(yCoord * vRatio) + 0.5;
      const lineColor = style.lineColor;

      // Full-width line at the trade price.
      context.strokeStyle = lineColor;
      context.lineWidth = lineWidth;
      context.setLineDash(drawing.kind === 'entry' ? [] : [4 * hRatio, 4 * hRatio]);
      context.beginPath();
      context.moveTo(0, lineY);
      context.lineTo(viewport.width * hRatio, lineY);
      context.stroke();

      // Rounded label chip pinned to the right edge of the viewport.
      const text = drawing.getText();
      if (!text) return;
      context.save();

      const padX = 5 * hRatio;
      const padY = 2 * vRatio;
      const chipRadius = 2 * hRatio;
      const fontSize = Math.round(10 * hRatio);
      const font = style.labelFont ?? `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace`;
      context.font = font;
      const textWidth = context.measureText(text).width;

      const chipW = textWidth + padX * 2;
      const chipH = fontSize + padY * 2 + 2 * vRatio;
      const margin = 4 * hRatio;
      let chipX = viewport.width * hRatio - chipW - margin;
      let chipY = lineY - chipH / 2;
      chipY = Math.max(margin, Math.min(chipY, viewport.height * vRatio - chipH - margin));

      // 1. Draw solid minimal pill
      context.fillStyle = '#131722';
      context.beginPath();
      context.roundRect(chipX, chipY, chipW, chipH, chipRadius);
      context.fill();

      // 2. Draw 1px crisp outline in line color
      context.strokeStyle = lineColor;
      context.lineWidth = 1 * hRatio;
      context.beginPath();
      context.roundRect(chipX, chipY, chipW, chipH, chipRadius);
      context.stroke();

      // 3. Draw text cleanly centered
      context.fillStyle = '#d1d4dc';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, chipX + chipW / 2, chipY + chipH / 2 + 0.5 * vRatio);
      context.restore();
    });
  }
}

export interface TradePnlLabelOptions {
  fontSize?: number;
  chipColor?: string;
}

const DEFAULT_PNL_FONT_SIZE = 12;
const PNL_LABEL_HORIZONTAL_MARGIN = 8;
const PNL_LABEL_PADDING = 5;
const PNL_LABEL_RADIUS = 3;

/**
 * Canvas-native PnL position label (TradingView position-label style) painted
 * against the left edge of the chart at the entry price. Unlike a DOM badge it
 * rides the canvas so it never drifts from the price line; like the DOM pill it
 * sits on the left side of the chart. The live PnL text is refreshed via
 * `setNote` (canvas repaint only, no React commit).
 */
export class TradePnlLabel extends Drawings.Drawing {
  static readonly REQUIRED_ANCHORS = 1;

  readonly type = 'trade-pnl-label';
  private _note: string;
  private _labelOptions: Required<TradePnlLabelOptions>;

  constructor(
    id: string,
    note: string,
    anchors: Drawings.Anchor[],
    style: Partial<Drawings.DrawingStyle>,
    options: Partial<TradePnlLabelOptions>,
  ) {
    super(id, anchors, style, {});
    this._note = note;
    this._labelOptions = {
      fontSize: options?.fontSize ?? DEFAULT_PNL_FONT_SIZE,
      chipColor: options?.chipColor ?? '#089981',
    };
  }

  static create(
    id: string,
    position: Drawings.Anchor,
    note: string,
    style: Partial<Drawings.DrawingStyle>,
    options?: Partial<TradePnlLabelOptions>,
  ): TradePnlLabel {
    return new TradePnlLabel(id, note, [position], style, options ?? {});
  }

  get labelOptions(): Required<TradePnlLabelOptions> {
    return this._labelOptions;
  }

  setNote(note: string): void {
    if (note === this._note) return;
    this._note = note;
    this.requestUpdate();
  }

  getNote(): string {
    return this._note;
  }

  isValid(): boolean {
    return this._anchors.length >= TradePnlLabel.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new TradePnlLabelPaneView(this)];
  }

  computeGeometry(): Drawings.Geometry[] {
    return [];
  }

  testHit(point: Drawings.Point, viewport: Drawings.Viewport): boolean {
    const anchor = this._anchors[0];
    if (!anchor) return false;
    const yCoord = viewport.priceScale.priceToCoordinate(anchor.price);
    if (yCoord === null) return false;
    const pad = PNL_LABEL_PADDING;
    const textWidth = this._note.length * 7;
    const chipW = textWidth + pad * 4;
    const chipH = 12 + pad * 2;
    return (
      point.x >= PNL_LABEL_HORIZONTAL_MARGIN &&
      point.x <= PNL_LABEL_HORIZONTAL_MARGIN + chipW &&
      point.y >= yCoord - chipH / 2 &&
      point.y <= yCoord + chipH / 2
    );
  }

  clone(newId: string): Drawings.IDrawing {
    return new TradePnlLabel(
      newId,
      this._note,
      this._anchors.map((a) => ({ ...a })),
      { ...this._style },
      { ...this._labelOptions },
    );
  }
}

class TradePnlLabelPaneView implements IPrimitivePaneView {
  private readonly _renderer: TradePnlLabelPaneRenderer;

  constructor(drawing: TradePnlLabel) {
    this._renderer = new TradePnlLabelPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class TradePnlLabelPaneRenderer implements IPrimitivePaneRenderer {
  private readonly _drawing: TradePnlLabel;

  constructor(drawing: TradePnlLabel) {
    this._drawing = drawing;
  }

  draw(target: PaneRenderTarget): void {
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      const drawing = this._drawing;
      const viewport = drawing.getViewport();
      if (!viewport || !drawing.options.visible || !drawing.isValid()) return;

      const anchor = drawing.anchors[0];
      if (!anchor) return;
      const yCoord = viewport.priceScale.priceToCoordinate(anchor.price);
      if (yCoord === null) return;

      const opts = drawing.labelOptions;
      const hx = horizontalPixelRatio;
      const vx = verticalPixelRatio;
      const fontSize = Math.round(opts.fontSize * hx);
      const font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace`;
      context.save();
      context.font = font;

      const textWidth = context.measureText(drawing.getNote()).width;
      const padX = 5 * hx;
      const padY = 2 * vx;
      const radius = 2 * hx;
      const margin = 6 * hx;

      const chipW = textWidth + padX * 2;
      const chipH = fontSize + padY * 2 + 2 * vx;
      const chipX = margin;
      let chipY = yCoord * vx - chipH / 2;
      chipY = Math.max(margin, Math.min(chipY, viewport.height * vx - chipH - margin));

      // 1. Minimal solid dark container
      context.fillStyle = '#131722';
      context.beginPath();
      context.roundRect(chipX, chipY, chipW, chipH, radius);
      context.fill();

      // 2. Subtle 1px border in accent color
      context.strokeStyle = opts.chipColor;
      context.lineWidth = 1 * hx;
      context.beginPath();
      context.roundRect(chipX, chipY, chipW, chipH, radius);
      context.stroke();

      // 3. Crisp typography
      context.fillStyle = '#d1d4dc';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(drawing.getNote(), chipX + chipW / 2, chipY + chipH / 2 + 0.5 * vx);
      context.restore();
    });
  }
}
