import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import * as Drawings from 'lightweight-charts-drawing';
import type { Candle, OrderDraft, Trade } from '../store/useSimulatorStore';
import { getContractMultiplier } from '../lib/orders';
import { getReplayTime } from '../lib/trade-lines/chartTime';
import {
  draftToPositionDrawing,
  formatTradePnlNote,
  tradeToTradeLineDrawings,
} from '../lib/trade-lines/positions';
import { syncTradeDrawings } from '../lib/trade-lines/sync';
import { TradePnlLabel } from '../lib/trade-lines/tradeLineDrawing';
import type { OverlayTrade } from '../components/OrderTooltipCard';

const OVERLAY_COMMIT_INTERVAL_MS = 50;

interface UseTradeLinesSyncParams {
  managerRef: React.RefObject<Drawings.DrawingManager | null>;
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  chartApi: IChartApi | null;
  currentSessionId: string;
  trades: Trade[];
  orderDraft: OrderDraft;
  effectiveData: Candle[];
  effectiveCurrentIndex: number;
  instrument?: string;
  chartTimezone: string;
  compressGaps: boolean;
  renderedTradesRef: React.MutableRefObject<OverlayTrade[]>;
  setRenderedTrades: (trades: OverlayTrade[]) => void;
}

function isVisible(trade: Trade, currentTimestamp: number): boolean {
  if (trade.status === 'closed' && trade.exitTime) return trade.exitTime <= currentTimestamp;
  if (trade.status === 'open' && trade.entryTime) return trade.entryTime <= currentTimestamp;
  if (trade.status === 'pending') return trade.orderTime <= currentTimestamp;
  return false;
}

/**
 * Projects the session's open/pending trades onto the chart as two full-width
 * draggable SL/TP lines (the position box only exists while the order is
 * being drafted), and keeps the DOM badge state (entry pill + live PnL) in
 * sync with the replay position.
 *
 * The trade drawings are a pure projection of the store: they are never
 * persisted, and dragging a line writes the price back to the trade via
 * `modifyOrder`. PnL always reflects the replay bar (the current candle),
 * never the crosshair.
 */
export function useTradeLinesSync({
  managerRef,
  seriesRef,
  chartApi,
  currentSessionId,
  trades,
  orderDraft,
  effectiveData,
  effectiveCurrentIndex,
  instrument,
  chartTimezone,
  compressGaps,
  renderedTradesRef,
  setRenderedTrades,
}: UseTradeLinesSyncParams): void {
  const lastCommitTimeRef = useRef(0);
  const lastCommittedSignatureRef = useRef('');
  const recomputeRef = useRef<() => void>(() => {});

  useEffect(() => {
    const manager = managerRef.current;
    const series = seriesRef.current;
    if (!manager || !series) return;

    if (!currentSessionId) {
      renderedTradesRef.current = [];
      lastCommittedSignatureRef.current = '';
      setRenderedTrades([]);
      syncTradeDrawings(manager, []);
      return;
    }

    const recompute = () => {
      const { chartTime, currentTimestamp } = getReplayTime({
        effectiveData,
        effectiveCurrentIndex,
        compressGaps,
        chartTimezone,
      });
      const currentIndex = Math.min(
        Math.max(effectiveCurrentIndex, 0),
        Math.max(effectiveData.length - 1, 0),
      );
      const currentBar = effectiveData[currentIndex];
      const currentPrice = currentBar?.close ?? 0;

      const desired: Drawings.IDrawing[] = [];
      const badges: OverlayTrade[] = [];
      const multiplier = getContractMultiplier(instrument);

      for (const trade of trades) {
        if (!isVisible(trade, currentTimestamp)) continue;
        if (trade.status !== 'open' && trade.status !== 'pending') continue;

        const pnlLabelColor = trade.type === 'buy' ? '#089981' : '#f23645';
        desired.push(
          ...tradeToTradeLineDrawings(
            trade,
            chartTime,
            formatTradePnlNote(trade, currentPrice, multiplier),
            pnlLabelColor,
          ),
        );

        const entryPrice = trade.entryPrice ?? trade.limitPrice;
        const entryY = entryPrice != null ? series.priceToCoordinate(entryPrice) : null;
        const slY = trade.sl != null ? series.priceToCoordinate(trade.sl) : null;
        const tpY = trade.tp != null ? series.priceToCoordinate(trade.tp) : null;
        const limitY = trade.limitPrice != null ? series.priceToCoordinate(trade.limitPrice) : null;

        const effectiveSize = trade.remainingSize ?? trade.size;
        let currentPnl = 0;
        if (trade.status === 'open' && trade.entryPrice && currentPrice !== undefined) {
          currentPnl = trade.type === 'buy'
            ? (currentPrice - trade.entryPrice) * effectiveSize * multiplier
            : (trade.entryPrice - currentPrice) * effectiveSize * multiplier;
        }

        let slPnl: number | undefined;
        const basePrice = entryPrice;
        if (trade.sl != null && basePrice != null) {
          slPnl = trade.type === 'buy'
            ? (trade.sl - basePrice) * effectiveSize * multiplier
            : (basePrice - trade.sl) * effectiveSize * multiplier;
        }

        let tpPnl: number | undefined;
        if (trade.tp != null && basePrice != null) {
          tpPnl = trade.type === 'buy'
            ? (trade.tp - basePrice) * effectiveSize * multiplier
            : (basePrice - trade.tp) * effectiveSize * multiplier;
        }

        badges.push({
          ...trade,
          entryY,
          slY,
          tpY,
          limitY,
          slPrice: trade.sl,
          tpPrice: trade.tp,
          limitPrice: trade.limitPrice,
          currentPnl,
          slPnl,
          tpPnl,
        });
      }

      syncTradeDrawings(manager, desired);

      // The PnL note text changes every tick, so push it onto the existing
      // canvas labels directly instead of recreating the drawings.
      for (const d of desired) {
        if (!(d instanceof TradePnlLabel)) continue;
        const existing = manager.getDrawing(d.id) as TradePnlLabel | undefined;
        if (existing && existing.getNote() !== d.getNote()) {
          existing.setNote(d.getNote());
        }
      }

      renderedTradesRef.current = badges;

      const signature = badges
        .map((b) => `${b.id}|${b.entryY}|${b.slY}|${b.tpY}|${b.limitY}|${b.currentPnl?.toFixed(2)}`)
        .join(';');
      const commitNow = performance.now();
      if (commitNow - lastCommitTimeRef.current >= OVERLAY_COMMIT_INTERVAL_MS) {
        lastCommitTimeRef.current = commitNow;
        if (signature !== lastCommittedSignatureRef.current) {
          lastCommittedSignatureRef.current = signature;
          setRenderedTrades(badges);
        }
      }
    };

    recompute();
    recomputeRef.current = recompute;
  }, [
    managerRef,
    seriesRef,
    currentSessionId,
    trades,
    orderDraft,
    effectiveData,
    effectiveCurrentIndex,
    instrument,
    chartTimezone,
    compressGaps,
    renderedTradesRef,
    setRenderedTrades,
  ]);

  // Recompute on chart viewport movement (pan/zoom/crosshair) so badge positions and
  // the lines follow the price scale immediately in realtime.
  useEffect(() => {
    if (!chartApi) return;
    let rafId = 0;
    const scheduleRecompute = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        recomputeRef.current();
      });
    };

    chartApi.timeScale().subscribeVisibleLogicalRangeChange(scheduleRecompute);
    chartApi.subscribeCrosshairMove(scheduleRecompute);

    let isInteracting = false;
    let interactionRafId = 0;

    const startInteraction = () => {
      if (isInteracting) return;
      isInteracting = true;
      const loop = () => {
        if (!isInteracting) return;
        recomputeRef.current();
        interactionRafId = requestAnimationFrame(loop);
      };
      interactionRafId = requestAnimationFrame(loop);
    };

    const stopInteraction = () => {
      isInteracting = false;
      if (interactionRafId) {
        cancelAnimationFrame(interactionRafId);
        interactionRafId = 0;
      }
      recomputeRef.current();
    };

    const handleWheel = () => {
      scheduleRecompute();
      startInteraction();
      setTimeout(stopInteraction, 200);
    };

    window.addEventListener('mousedown', startInteraction);
    window.addEventListener('mouseup', stopInteraction);
    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      chartApi.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleRecompute);
      chartApi.unsubscribeCrosshairMove(scheduleRecompute);
      if (rafId) cancelAnimationFrame(rafId);
      if (interactionRafId) cancelAnimationFrame(interactionRafId);
      window.removeEventListener('mousedown', startInteraction);
      window.removeEventListener('mouseup', stopInteraction);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [chartApi]);
}
