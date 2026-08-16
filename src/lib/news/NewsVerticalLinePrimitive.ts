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

export interface NewsVerticalLineEvent {
  x: number;
  color: string;
  label: string;
}

export class NewsVerticalLinePrimitive implements ISeriesPrimitive<Time> {
  private _events: NewsVerticalLineEvent[] = [];
  private _paneView = new NewsVerticalLinePaneView(() => this._events);
  private _attachedParams: SeriesAttachedParameter<Time, SeriesType> | null = null;

  setEvents(events: NewsVerticalLineEvent[]): void {
    this._events = events;
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

class NewsVerticalLinePaneView implements IPrimitivePaneView {
  constructor(private readonly getEvents: () => NewsVerticalLineEvent[]) {}

  renderer(): IPrimitivePaneRenderer {
    return new NewsVerticalLineRenderer(this.getEvents());
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }
}

class NewsVerticalLineRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly events: NewsVerticalLineEvent[]) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      context.save();
      try {
        for (const event of this.events) {
          if (event.x < 0 || event.x > mediaSize.width) continue;

          context.beginPath();
          context.strokeStyle = event.color;
          context.lineWidth = 1;
          context.setLineDash([4, 4]);
          context.globalAlpha = 0.6;
          context.moveTo(event.x, 0);
          context.lineTo(event.x, mediaSize.height);
          context.stroke();
          context.setLineDash([]);
          context.globalAlpha = 1;

          if (event.label) {
            context.font = 'bold 10px system-ui, -apple-system, sans-serif';
            const labelWidth = context.measureText(event.label).width;
            const padding = 4;
            const labelHeight = 16;
            const labelX = Math.max(2, Math.min(event.x - labelWidth / 2 - padding, mediaSize.width - labelWidth - padding * 2 - 2));

            context.fillStyle = event.color;
            context.globalAlpha = 0.85;
            context.beginPath();
            context.roundRect(labelX, 2, labelWidth + padding * 2, labelHeight, 3);
            context.fill();
            context.globalAlpha = 1;

            context.fillStyle = '#ffffff';
            context.textAlign = 'left';
            context.textBaseline = 'top';
            context.fillText(event.label, labelX + padding, 3);
          }
        }
      } finally {
        context.restore();
      }
    });
  }
}
