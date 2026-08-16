import { useSimulatorStore, Candle, Session, Trade } from '../store/useSimulatorStore';
import {
  aggregateCandles,
  expandSubMinuteCandlesFromM1,
  getTimeframeSeconds,
  auraTimeframeToDukascopy,
} from '../lib/timeframe';
import { generateCandlestickChartDataUrl } from './pdfChartRenderer';
import { enrichTrade, EnrichedTrade } from './math/tradeMetrics';
import { extractTradeReplayData } from '../components/analytics/analyticsEngine';
import { fetchTradeM1Candles } from '../lib/replayDataFetcher';

export interface AutoScreenshotCapture {
  id: string;
  timeframe: string;
  title: string;
  dataUrl: string;
  createdAt: number;
  tradeId: string;
}

/**
 * Normalizes a timeframe string into a clean uppercase presentation format (e.g., '15M', '1H', '1D').
 */
export function formatTimeframeBadgeLabel(tf: string): string {
  if (!tf) return '1M';
  const clean = tf.trim().toUpperCase();
  if (clean === 'D1' || clean === '1D') return '1D';
  if (clean === 'W1' || clean === '1W' || clean === 'MN1') return '1W';
  if (clean === 'H1' || clean === '1H') return '1H';
  if (clean === 'H4' || clean === '4H') return '4H';
  if (clean === 'M1' || clean === '1M') return '1M';
  if (clean === 'M5' || clean === '5M') return '5M';
  if (clean === 'M15' || clean === '15M') return '15M';
  if (clean === 'M30' || clean === '30M') return '30M';
  if (clean === 'S5' || clean === '5S') return '5S';
  if (clean === 'S15' || clean === '15S') return '15S';
  if (clean === 'S30' || clean === '30S') return '30S';
  return clean;
}

/**
 * Automatically captures real, multi-timeframe candlestick chart screenshots
 * for a closed trade according to the user's enabled timeframes in Settings.
 */
export async function captureTradeMultiTimeframeScreenshots(
  trade: Trade,
  session: Session
): Promise<AutoScreenshotCapture[]> {
  const store = useSimulatorStore.getState();
  if (!store.autoScreenshotEnabled) {
    return [];
  }

  const enabledTfs = Object.entries(store.autoScreenshotTimeframes || {})
    .filter(([_, enabled]) => Boolean(enabled))
    .map(([tf]) => tf);

  if (enabledTfs.length === 0) {
    return [];
  }

  // Create enriched trade structure for chart rendering
  const enriched: EnrichedTrade = enrichTrade(trade, {
    id: session.id,
    name: session.name,
    instrument: session.instrument || trade.instrument || 'EURUSD',
    timeframe: session.timeframe || '1m',
    balance: session.balance,
  });

  // 1. Ensure true baseline 1-minute candle data spanning the trade context
  let m1Candles: Candle[] = [];

  // Check if trade already has full 1m candles cached
  if (trade.candles && trade.candles.length >= 300) {
    const gap = Math.abs((trade.candles[1]?.timestamp || 0) - (trade.candles[0]?.timestamp || 0));
    if (gap <= 65_000) {
      m1Candles = trade.candles;
    }
  }

  // Check if session.data is 1m data with sufficient history
  if (m1Candles.length === 0 && session.data && session.data.length >= 300) {
    const sTf = (session.timeframe || '1m').toLowerCase();
    if (sTf === '1m' || sTf === 'm1') {
      m1Candles = session.data;
    }
  }

  // If missing or small dataset (< 300 bars), fetch true multi-day Dukascopy M1 data so 1H/4H/1D have rich context
  if (m1Candles.length < 300) {
    try {
      const fetched = await fetchTradeM1Candles({
        ...enriched,
        openedAt: trade.entryTime || trade.orderTime || Date.now(),
        closedAt: trade.exitTime || (trade as any).closedAt || Date.now(),
        holdingMs: Math.max(0, (trade.exitTime || (trade as any).closedAt || 0) - (trade.entryTime || trade.orderTime || 0)),
        pnlValue: trade.pnl ?? 0,
      } as any);
      if (fetched && fetched.length > 0) {
        m1Candles = fetched;
        // Persist to trade for future replay/autopsy
        store.setTradeCandles(session.id, trade.id, m1Candles);
      }
    } catch (e) {
      console.warn('[AutoScreenshot] Fetch M1 baseline notice:', e);
    }
  }

  // Fallback if network offline
  if (m1Candles.length === 0) {
    m1Candles = trade.candles || session.data || [];
  }

  const captures: AutoScreenshotCapture[] = [];

  for (const tf of enabledTfs) {
    try {
      const badgeLabel = formatTimeframeBadgeLabel(tf);

      // Extract high-resolution replay data specifically structured for this timeframe
      const replayData = extractTradeReplayData(
        {
          ...enriched,
          candles: m1Candles,
          openedAt: trade.entryTime || trade.orderTime || Date.now(),
          closedAt: trade.exitTime || (trade as any).closedAt || Date.now(),
          holdingMs: Math.max(0, (trade.exitTime || (trade as any).closedAt || 0) - (trade.entryTime || trade.orderTime || 0)),
          pnlValue: trade.pnl ?? 0,
        } as any,
        [session],
        tf,
        { fullDay: true }
      );

      const enrichedForTf: EnrichedTrade = {
        ...enriched,
        timeframe: tf,
      };

      const dataUrl = generateCandlestickChartDataUrl(
        enrichedForTf,
        replayData,
        replayData ? replayData.candles : undefined,
        { timeframeLabel: badgeLabel }
      );

      if (dataUrl && dataUrl.startsWith('data:image/')) {
        const title = `${enriched.instrument.toUpperCase()} ${trade.type.toUpperCase()} • ${badgeLabel}`;
        const captureItem: AutoScreenshotCapture = {
          id: `shot_${trade.id}_${tf}_${Date.now()}`,
          timeframe: tf,
          title,
          dataUrl,
          createdAt: Date.now(),
          tradeId: trade.id,
        };

        captures.push(captureItem);

        // Optionally add to the Journal tab
        if (store.autoScreenshotSaveToJournal) {
          const pnlText = trade.pnl != null
            ? (trade.pnl >= 0 ? '+$' : '-$') + Math.abs(trade.pnl).toFixed(2)
            : 'N/A';

          store.addJournalEntry({
            title,
            note: `Auto-screenshot captured on trade close (${badgeLabel} Timeframe). Exit: ${trade.exitPrice?.toFixed(5) ?? 'N/A'}, PnL: ${pnlText}.`,
            imageDataUrl: dataUrl,
            instrument: enriched.instrument,
            timeframe: tf,
            candleTimestamp: trade.exitTime ?? trade.entryTime ?? trade.orderTime,
            tradeId: trade.id,
            tradeType: trade.type,
            pnl: trade.pnl,
            tags: ['Auto-Screenshot', badgeLabel, trade.type.toUpperCase()],
          }, session.id);
        }
      }
    } catch (err) {
      console.warn(`[AutoScreenshot] Failed to capture timeframe ${tf}:`, err);
    }
  }

  // Attach screenshot collection directly to the trade if metadata updater is available
  if (captures.length > 0) {
    store.updateTradeMetadata(trade.id, {
      screenshots: captures,
    } as any);
  }

  return captures;
}
