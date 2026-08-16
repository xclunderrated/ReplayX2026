import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  PrimitivePaneViewZOrder,
  Time,
  SeriesAttachedParameter,
  SeriesType,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

export type TradeLine = {
  id: string;
  type: 'buy' | 'sell';
  status: 'open' | 'pending';
  entryY?: number | null;
  slY?: number | null;
  tpY?: number | null;
  limitY?: number | null;
  entryPrice?: number;
  slPrice?: number;
  tpPrice?: number;
  limitPrice?: number;
  currentPnl?: number;
  slPnl?: number;
  tpPnl?: number;
  size?: number;
  isPreview?: boolean;
};

export class TradeLinesPrimitive implements ISeriesPrimitive<Time> {
  private _trades: TradeLine[] = [];
  private _paneView = new TradeLinesPaneView(() => this._trades);
  private _attachedParams: SeriesAttachedParameter<Time, SeriesType> | null = null;

  setTrades(trades: TradeLine[]): void {
    this._trades = trades;
    if (this._attachedParams) {
      this._attachedParams.requestUpdate();
    }
  }

  attached(params: SeriesAttachedParameter<Time, SeriesType>): void {
    this._attachedParams = params;
  }

  paneViews(): IPrimitivePaneView[] {
    return [this._paneView];
  }
}

class TradeLinesPaneView implements IPrimitivePaneView {
  constructor(private readonly getTrades: () => TradeLine[]) {}

  renderer(): IPrimitivePaneRenderer {
    return new TradeLinesRenderer(this.getTrades());
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }
}

class TradeLinesRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly trades: TradeLine[]) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      context.save();
      try {
        for (const trade of this.trades) {
          const isPreview = trade.isPreview ?? false;
          const entryY = trade.entryY ?? trade.limitY;
          
          if (isPreview && entryY != null) {
            // Draw gradient shading
            if (trade.tpY != null) {
              const tpGradient = context.createLinearGradient(0, Math.min(entryY, trade.tpY), 0, Math.max(entryY, trade.tpY));
              tpGradient.addColorStop(trade.type === 'buy' ? 1 : 0, 'rgba(34, 197, 94, 0.15)');
              tpGradient.addColorStop(trade.type === 'buy' ? 0 : 1, 'rgba(34, 197, 94, 0.02)');
              context.fillStyle = tpGradient;
              context.fillRect(0, Math.min(entryY, trade.tpY), mediaSize.width, Math.abs(entryY - trade.tpY));
            }
            if (trade.slY != null) {
              const slGradient = context.createLinearGradient(0, Math.min(entryY, trade.slY), 0, Math.max(entryY, trade.slY));
              slGradient.addColorStop(trade.type === 'buy' ? 0 : 1, 'rgba(239, 68, 68, 0.15)');
              slGradient.addColorStop(trade.type === 'buy' ? 1 : 0, 'rgba(239, 68, 68, 0.02)');
              context.fillStyle = slGradient;
              context.fillRect(0, Math.min(entryY, trade.slY), mediaSize.width, Math.abs(entryY - trade.slY));
            }
          }

          drawLine(context, mediaSize.width, trade.entryY, '#f59e0b', isPreview);
          drawLine(context, mediaSize.width, trade.limitY, '#f59e0b', isPreview);
          drawLine(context, mediaSize.width, trade.slY, '#ef4444', isPreview, isPreview ? 'SL' : undefined);
          drawLine(context, mediaSize.width, trade.tpY, '#22c55e', isPreview, isPreview ? 'TP' : undefined);
          
          if (!isPreview) {
            drawTradeUI(context, mediaSize.width, trade);
          }
        }
      } finally {
        context.restore();
      }
    });
  }
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  width: number,
  y?: number | null,
  color?: string,
  isPreview?: boolean,
  label?: string,
) {
  if (y == null) return;
  
  // Draw line
  ctx.beginPath();
  ctx.strokeStyle = color ?? '#f59e0b';
  ctx.lineWidth = 1;
  if (isPreview) {
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
  }
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw label tag for previews
  if (isPreview && label) {
    const isSL = label === 'SL';
    ctx.fillStyle = isSL ? 'rgba(239, 68, 68, 0.9)' : 'rgba(34, 197, 94, 0.9)';
    const textWidth = 32;
    const height = 18;
    const x = width - textWidth - 80; // Offset from right edge
    
    ctx.beginPath();
    ctx.roundRect(x, y - height/2, textWidth, height, 4);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + textWidth/2, y + 1);
  }
}

function drawPill(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, text: string, bgColor: string, textColor: string = 'white', isButton: boolean = false) {
  const height = 22;
  ctx.beginPath();
  ctx.roundRect(x, y - height/2, width, height, 4);
  ctx.fillStyle = bgColor;
  ctx.fill();
  
  if (isButton) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.stroke();
  }

  ctx.fillStyle = textColor;
  ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + width/2, y + 1);
}

function drawRightLabel(ctx: CanvasRenderingContext2D, screenWidth: number, y: number, label: string, bgColor: string) {
  const textWidth = 32;
  const height = 18;
  const x = screenWidth - textWidth - 80; // Offset from right edge
  ctx.beginPath();
  ctx.roundRect(x, y - height/2, textWidth, height, 4);
  ctx.fillStyle = bgColor;
  ctx.fill();
  
  ctx.fillStyle = 'white';
  ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + textWidth/2, y + 1);
}

function drawTradeUI(ctx: CanvasRenderingContext2D, width: number, trade: TradeLine) {
  const entryY = trade.entryY ?? trade.limitY;
  if (entryY != null) {
     let currentX = 85;
     
     // 1. Position Label ("Buy 1.00")
     const posText = `${trade.type === 'buy' ? 'Buy' : 'Sell'} ${trade.size || 1}`;
     drawPill(ctx, 5, entryY, 75, posText, trade.type === 'buy' ? '#22c55e' : '#ef4444');

     // 2. Add SL Button
     if (!trade.slY) {
         drawPill(ctx, currentX, entryY, 30, '+SL', 'rgba(43, 43, 67, 0.9)', 'white', true);
         currentX += 35;
     }

     // 3. Add TP Button
     if (!trade.tpY) {
         drawPill(ctx, currentX, entryY, 30, '+TP', 'rgba(43, 43, 67, 0.9)', 'white', true);
         currentX += 35;
     }

     // 4. Close Button (X)
     drawPill(ctx, currentX, entryY, 20, 'x', 'rgba(43, 43, 67, 0.9)', 'white', true);
     currentX += 25;

     // 5. Live PnL Box
     if (trade.currentPnl !== undefined) {
         const isProfitable = trade.currentPnl >= 0;
         const pnlText = `${isProfitable ? '+' : ''}$${Math.abs(trade.currentPnl).toFixed(2)}`;
         const pnlColor = isProfitable ? '#22c55e' : '#ef4444';
         ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
         const textWidth = ctx.measureText(pnlText).width;
         drawPill(ctx, currentX, entryY, textWidth + 12, pnlText, pnlColor);
     }
  }

  // SL Line UI
  if (trade.slY != null) {
      drawRightLabel(ctx, width, trade.slY, 'SL', '#ef4444');
      if (trade.slPnl !== undefined) {
          const slPnlText = `-$${Math.abs(trade.slPnl).toFixed(2)}`;
          ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
          const textWidth = ctx.measureText(slPnlText).width;
          drawPill(ctx, 5, trade.slY, textWidth + 12, slPnlText, '#ef4444');
      }
  }

  // TP Line UI
  if (trade.tpY != null) {
      drawRightLabel(ctx, width, trade.tpY, 'TP', '#22c55e');
      if (trade.tpPnl !== undefined) {
          const tpPnlText = `+$${Math.abs(trade.tpPnl).toFixed(2)}`;
          ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
          const textWidth = ctx.measureText(tpPnlText).width;
          drawPill(ctx, 5, trade.tpY, textWidth + 12, tpPnlText, '#22c55e');
      }
  }
}
