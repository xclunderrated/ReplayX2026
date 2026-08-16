export interface RenderedNewsItem {
  id: string;
  kind: string;
  x: number;
  y: number;
  r?: number;
  color: string;
}

export interface RenderedTrade {
  id: string;
  status: string;
  type: string;
  entryY?: number | null;
  slY?: number | null;
  tpY?: number | null;
  limitY?: number | null;
  currentPnl?: number;
  slPnl?: number;
  tpPnl?: number;
}

export interface ChartOverlayData {
  newsItems: RenderedNewsItem[];
  trades: RenderedTrade[];
}
