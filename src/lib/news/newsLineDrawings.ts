import * as Drawings from 'lightweight-charts-drawing';
import { type NewsEvent, getImpactColor, getImpactWeight } from '../news';
import { type ChartTimezone, formatTimestampInTimeZone, timestampMsToChartTime } from '../timezone';
import { getNewsWhitespaceTimestamps } from '../chartMarkers';

export const NEWS_LINE_PREFIX = 'news:';

/** Ids of the projected future-news vertical lines (never persisted). */
export function isNewsDrawing(id: string): boolean {
  return id.startsWith(NEWS_LINE_PREFIX);
}

export function newsLineDrawingId(eventId: string): string {
  return `${NEWS_LINE_PREFIX}${eventId}`;
}

export interface FutureNewsLinesInput {
  visibleNews: NewsEvent[];
  currentReplayTimestamp: number | undefined;
  lastVisibleTimestamp: number | undefined;
  lastVisiblePrice: number | undefined;
  intervalMs: number;
  chartTimezone: ChartTimezone;
  opacity?: number;
  endTimestamp?: number;
}

/** Convert a #rrggbb color to an 8-digit #rrggbbaa hex (valid canvas CSS). */
export function hexToAlphaHex(hex: string, opacity: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${match[1]}${alpha}`;
}

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

function lineStyleSignature(style: Drawings.DrawingStyle | undefined): string {
  if (!style) return '';
  const lineColor = style.lineColor ?? '';
  const lineWidth = style.lineWidth ?? 0;
  const lineDash = style.lineDash ? style.lineDash.join(',') : '';
  return `${String(lineColor)}|${String(lineWidth)}|${lineDash}`;
}

/**
 * Build one full-height VerticalLine drawing per upcoming visible news event,
 * pinned to the exact chart-time of the event. The lines are only created for
 * timestamps covered by the hidden whitespace series — the same set the chart
 * feeds into `buildNewsWhitespacePoints` — because the drawing plugin renders
 * via timeToCoordinate, which only resolves timestamps that exist verbatim on
 * the shared time scale.
 */
export function buildFutureNewsLineDrawings({
  visibleNews,
  currentReplayTimestamp,
  lastVisibleTimestamp,
  lastVisiblePrice,
  intervalMs,
  chartTimezone,
  opacity = 1,
  endTimestamp,
}: FutureNewsLinesInput): Drawings.IDrawing[] {
  if (!currentReplayTimestamp
    || !Number.isFinite(currentReplayTimestamp)
    || !lastVisibleTimestamp
    || !Number.isFinite(lastVisibleTimestamp)
    || !lastVisiblePrice
    || !Number.isFinite(lastVisiblePrice)) {
    return [];
  }

  const covered = new Set(
    getNewsWhitespaceTimestamps({
      visibleNews,
      currentReplayTimestamp,
      lastVisibleTimestamp,
      intervalMs,
      endTimestamp,
    }),
  );

  const drawings: Drawings.IDrawing[] = [];
  for (const event of visibleNews) {
    if (event.timestamp <= currentReplayTimestamp) continue;
    if (event.timestamp <= lastVisibleTimestamp) continue;
    const msKey = Math.floor(event.timestamp / 1000) * 1000;
    if (!covered.has(msKey)) continue;

    const isHigh = getImpactWeight(event.impact) === 3;
    const color = opacity >= 1 ? getImpactColor(event.impact) : hexToAlphaHex(getImpactColor(event.impact), opacity);
    const style: Partial<Drawings.DrawingStyle> = {
      lineColor: color,
      lineWidth: 1,
      lineDash: isHigh ? [] : [4, 4],
    };
    const options: Partial<Drawings.VerticalLineOptions> = {
      visible: true,
      locked: true,
      zIndex: 500,
      showTime: true,
      showLabel: false,
      labelText: formatTimestampInTimeZone(event.timestamp, chartTimezone, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    };

    drawings.push(
      Drawings.VerticalLine.create(
        newsLineDrawingId(event.id),
        timestampMsToChartTime(event.timestamp, chartTimezone) as any,
        lastVisiblePrice,
        style,
        options,
      ),
    );
  }
  return drawings;
}

/**
 * Reconcile the projected news vertical lines onto the manager. Only
 * `news:`-prefixed drawings are added/updated/removed here; store-owned and
 * trade drawings are left untouched.
 */
export function syncNewsLineDrawings(
  manager: Drawings.DrawingManager,
  desired: Drawings.IDrawing[],
): void {
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
    if (lineStyleSignature(existing.style) !== lineStyleSignature(drawing.style)) {
      (existing as Drawings.Drawing).style = drawing.style;
    }
  }

  for (const drawing of manager.getAllDrawings()) {
    if (isNewsDrawing(drawing.id) && !desiredIds.has(drawing.id)) {
      manager.removeDrawing(drawing.id);
    }
  }
}
