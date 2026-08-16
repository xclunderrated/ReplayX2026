import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useSimulatorStore } from '../store/useSimulatorStore';
import {
  getCurrentSessionPrice,
  getOrderDraftMetrics,
  validateOrderDraft,
  getPipSize,
  getInstrumentSpec,
  formatTradePrice,
} from '../lib/orders';
import { GripVertical, X, Check, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface ChartOrderDraftOverlayProps {
  chartApi: IChartApi | null;
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

type DragKind = 'entry' | 'sl' | 'tp' | null;

export const ChartOrderDraftOverlay: React.FC<ChartOrderDraftOverlayProps> = ({
  chartApi,
  seriesRef,
  containerRef,
}) => {
  const orderDraft = useSimulatorStore((state) => state.orderDraft);
  const session = useSimulatorStore((state) =>
    state.sessions.find((s) => s.id === state.currentSessionId) || null
  );
  const updateOrderDraft = useSimulatorStore((state) => state.updateOrderDraft);
  const confirmOrderDraft = useSimulatorStore((state) => state.confirmOrderDraft);
  const cancelOrderDraft = useSimulatorStore((state) => state.cancelOrderDraft);

  const [coords, setCoords] = useState<{
    entryY: number | null;
    slY: number | null;
    tpY: number | null;
  }>({ entryY: null, slY: null, tpY: null });

  const [activeDrag, setActiveDrag] = useState<DragKind>(null);
  const [dragMousePos, setDragMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredLine, setHoveredLine] = useState<DragKind>(null);

  const activeDragRef = useRef<DragKind>(null);
  activeDragRef.current = activeDrag;

  const currentPrice = session ? getCurrentSessionPrice(session) : undefined;
  const spec = getInstrumentSpec(session?.instrument);

  // Compute exact metrics from math engine
  const metrics = orderDraft && session
    ? getOrderDraftMetrics(orderDraft, session.balance, session.instrument, currentPrice)
    : null;

  const validation = orderDraft
    ? validateOrderDraft(orderDraft, currentPrice)
    : { errors: [], warnings: [], canSubmit: false };

  // Calculate and sync Y pixel coordinates with chart price scale
  const updateCoordinates = useCallback(() => {
    const series = seriesRef.current;
    if (!series || !orderDraft) {
      setCoords({ entryY: null, slY: null, tpY: null });
      return;
    }

    const refEntry = orderDraft.orderType === 'market' && currentPrice ? currentPrice : orderDraft.entryPrice;
    const entryY = refEntry != null ? series.priceToCoordinate(refEntry) : null;
    const slY = orderDraft.sl != null ? series.priceToCoordinate(orderDraft.sl) : null;
    const tpY = orderDraft.tp != null ? series.priceToCoordinate(orderDraft.tp) : null;

    setCoords({ entryY, slY, tpY });
  }, [currentPrice, orderDraft, seriesRef]);

  // Subscribe to chart viewport changes (pan, zoom, scale) in realtime
  useEffect(() => {
    updateCoordinates();

    if (!chartApi) return;
    let rafId = 0;
    const scheduleUpdate = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        updateCoordinates();
      });
    };

    chartApi.timeScale().subscribeVisibleLogicalRangeChange(scheduleUpdate);
    chartApi.subscribeCrosshairMove(scheduleUpdate);

    const container = containerRef.current;
    let isTrackingInteraction = false;
    let interactionRafId = 0;

    const startInteractionLoop = () => {
      if (isTrackingInteraction) return;
      isTrackingInteraction = true;

      const loop = () => {
        if (!isTrackingInteraction) return;
        updateCoordinates();
        interactionRafId = requestAnimationFrame(loop);
      };
      interactionRafId = requestAnimationFrame(loop);
    };

    const stopInteractionLoop = () => {
      isTrackingInteraction = false;
      if (interactionRafId) {
        cancelAnimationFrame(interactionRafId);
        interactionRafId = 0;
      }
      updateCoordinates();
    };

    const handleMouseDown = () => {
      startInteractionLoop();
    };

    const handleMouseUp = () => {
      stopInteractionLoop();
    };

    const handleWheel = () => {
      scheduleUpdate();
      startInteractionLoop();
      setTimeout(stopInteractionLoop, 250);
    };

    if (container) {
      container.addEventListener('mousedown', handleMouseDown);
      container.addEventListener('wheel', handleWheel, { passive: true });
    }
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      chartApi.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleUpdate);
      chartApi.unsubscribeCrosshairMove(scheduleUpdate);
      if (rafId) cancelAnimationFrame(rafId);
      if (interactionRafId) cancelAnimationFrame(interactionRafId);
      if (container) {
        container.removeEventListener('mousedown', handleMouseDown);
        container.removeEventListener('wheel', handleWheel);
      }
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [chartApi, containerRef, updateCoordinates]);

  // Handle Dragging
  const handleDragStart = (kind: 'entry' | 'sl' | 'tp', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!chartApi || !containerRef.current) return;
    setActiveDrag(kind);
    setDragMousePos({ x: e.clientX, y: e.clientY });

    // Disable chart scroll & scale while dragging order lines
    chartApi.applyOptions({
      handleScroll: false,
      handleScale: false,
    });

    const onPointerMove = (moveEvent: PointerEvent) => {
      const container = containerRef.current;
      const series = seriesRef.current;
      if (!container || !series || !activeDragRef.current) return;

      const rect = container.getBoundingClientRect();
      const relativeY = moveEvent.clientY - rect.top;
      setDragMousePos({ x: moveEvent.clientX, y: moveEvent.clientY });

      const newPrice = series.coordinateToPrice(relativeY);
      if (newPrice !== null && Number.isFinite(newPrice) && newPrice > 0) {
        const roundedPrice = Number(newPrice.toFixed(spec.digits));

        if (activeDragRef.current === 'entry') {
          updateOrderDraft({ entryPrice: roundedPrice });
        } else if (activeDragRef.current === 'sl') {
          updateOrderDraft({ sl: roundedPrice });
        } else if (activeDragRef.current === 'tp') {
          updateOrderDraft({ tp: roundedPrice });
        }
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      setActiveDrag(null);
      setDragMousePos(null);

      // Re-enable chart scroll & scale
      if (chartApi) {
        chartApi.applyOptions({
          handleScroll: true,
          handleScale: true,
        });
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  if (!orderDraft || !session || !metrics) return null;

  const isBuy = orderDraft.type === 'buy';
  const isMarket = orderDraft.orderType === 'market';
  const { entryY, slY, tpY } = coords;

  const buyColor = '#089981';
  const sellColor = '#f23645';
  const entryThemeColor = isBuy ? buyColor : sellColor;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden select-none">
      {/* ── 1. Shaded Risk / Reward Area Bands ── */}
      {/* Take Profit Reward Area (Green Subtle Tint) */}
      {entryY !== null && tpY !== null && (
        <div
          className="absolute left-0 right-0 transition-opacity duration-150 pointer-events-none"
          style={{
            top: Math.min(entryY, tpY),
            height: Math.max(2, Math.abs(tpY - entryY)),
            backgroundColor: 'rgba(8, 153, 129, 0.07)',
            borderLeft: '2px solid #089981',
          }}
        />
      )}

      {/* Stop Loss Risk Area (Red Subtle Tint) */}
      {entryY !== null && slY !== null && (
        <div
          className="absolute left-0 right-0 transition-opacity duration-150 pointer-events-none"
          style={{
            top: Math.min(entryY, slY),
            height: Math.max(2, Math.abs(slY - entryY)),
            backgroundColor: 'rgba(242, 54, 69, 0.07)',
            borderLeft: '2px solid #f23645',
          }}
        />
      )}

      {/* ── 2. Take Profit Line & Draggable Badge ── */}
      {tpY !== null && (
        <div
          className="absolute left-0 right-0 pointer-events-auto flex items-center group cursor-ns-resize"
          style={{ top: `${tpY}px`, transform: 'translateY(-50%)' }}
          onMouseDown={(e) => handleDragStart('tp', e)}
          onMouseEnter={() => setHoveredLine('tp')}
          onMouseLeave={() => setHoveredLine(null)}
        >
          {/* Horizontal Line */}
          <div
            className={`w-full border-t border-dashed transition-all duration-150 ${
              hoveredLine === 'tp' || activeDrag === 'tp'
                ? 'border-[#089981] shadow-[0_0_8px_rgba(8,153,129,0.7)] opacity-100'
                : 'border-[#089981]/70 opacity-80'
            }`}
          />

          {/* Draggable TP Pill Badge */}
          <div className="absolute right-1.5 flex items-center rounded bg-[#131722] text-white border border-[#089981]/60 font-mono text-[10px] tracking-tight shadow-md hover:border-[#089981] transition-all">
            {/* Grip handle */}
            <div
              className="flex items-center px-1 py-0.5 text-[#089981]/70 hover:text-[#089981] transition-colors cursor-ns-resize"
              title="Drag to adjust Take Profit"
            >
              <GripVertical size={11} strokeWidth={2} />
            </div>

            {/* Label Content */}
            <div className="px-1.5 py-0.5 flex items-center gap-1.5 border-l border-[#2a2e39]">
              <span className="font-bold text-[#089981]">
                TP
              </span>
              <span className="text-white font-medium">
                {formatTradePrice(orderDraft.tp ?? 0)}
              </span>
              <span className="text-[#089981]/90">
                +{metrics.targetPips.toFixed(1)}p
              </span>
              <span className="text-emerald-400 font-medium">
                +${metrics.estimatedGain.toFixed(2)}
              </span>
              {metrics.rewardMultiple !== null && (
                <span className="text-[#089981] font-semibold">
                  ({metrics.rewardMultiple.toFixed(2)}R)
                </span>
              )}
            </div>

            {/* Remove button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                updateOrderDraft({ tp: undefined });
              }}
              className="px-1 py-0.5 hover:bg-rose-500/20 text-[#868993] hover:text-rose-400 transition-colors cursor-pointer border-l border-[#2a2e39]"
              title="Remove Take Profit"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {/* ── 3. Entry Line & Badge ── */}
      {entryY !== null && (
        <div
          className={`absolute left-0 right-0 pointer-events-auto flex items-center group ${
            !isMarket ? 'cursor-ns-resize' : ''
          }`}
          style={{ top: `${entryY}px`, transform: 'translateY(-50%)' }}
          onMouseDown={(e) => {
            if (!isMarket) handleDragStart('entry', e);
          }}
          onMouseEnter={() => setHoveredLine('entry')}
          onMouseLeave={() => setHoveredLine(null)}
        >
          {/* Solid Entry Line */}
          <div
            className={`w-full border-t transition-all duration-150 ${
              hoveredLine === 'entry' || activeDrag === 'entry'
                ? 'border-[#2962ff] shadow-[0_0_8px_rgba(41,98,255,0.7)] opacity-100'
                : 'border-[#2962ff]/80 opacity-80'
            }`}
          />

          {/* Entry Pill Badge */}
          <div className="absolute right-1.5 flex items-center rounded bg-[#131722] text-white border border-[#2962ff]/60 font-mono text-[10px] tracking-tight shadow-md hover:border-[#2962ff] transition-all">
            {!isMarket && (
              <div
                className="flex items-center px-1 py-0.5 text-[#2962ff]/70 hover:text-[#2962ff] transition-colors cursor-ns-resize"
                title="Drag to adjust Limit/Stop Entry price"
              >
                <GripVertical size={11} strokeWidth={2} />
              </div>
            )}
            <div className={`px-1.5 py-0.5 flex items-center gap-1.5 ${!isMarket ? 'border-l border-[#2a2e39]' : ''}`}>
              <span
                className={`font-bold ${
                  isBuy ? 'text-[#089981]' : 'text-[#f23645]'
                }`}
              >
                {orderDraft.orderType !== 'market' ? orderDraft.orderType.toUpperCase() : ''} {orderDraft.type.toUpperCase()}
              </span>
              <span className="text-white font-medium">
                {formatTradePrice(metrics.entryPrice)}
              </span>
              <span className="text-[#3b82f6] font-medium">
                {metrics.estimatedSize.toFixed(2)}L
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. Stop Loss Line & Draggable Badge ── */}
      {slY !== null && (
        <div
          className="absolute left-0 right-0 pointer-events-auto flex items-center group cursor-ns-resize"
          style={{ top: `${slY}px`, transform: 'translateY(-50%)' }}
          onMouseDown={(e) => handleDragStart('sl', e)}
          onMouseEnter={() => setHoveredLine('sl')}
          onMouseLeave={() => setHoveredLine(null)}
        >
          {/* Horizontal Line */}
          <div
            className={`w-full border-t border-dashed transition-all duration-150 ${
              hoveredLine === 'sl' || activeDrag === 'sl'
                ? 'border-[#f23645] shadow-[0_0_8px_rgba(242,54,69,0.7)] opacity-100'
                : 'border-[#f23645]/70 opacity-80'
            }`}
          />

          {/* Draggable SL Pill Badge */}
          <div className="absolute right-1.5 flex items-center rounded bg-[#131722] text-white border border-[#f23645]/60 font-mono text-[10px] tracking-tight shadow-md hover:border-[#f23645] transition-all">
            {/* Grip handle */}
            <div
              className="flex items-center px-1 py-0.5 text-[#f23645]/70 hover:text-[#f23645] transition-colors cursor-ns-resize"
              title="Drag to adjust Stop Loss"
            >
              <GripVertical size={11} strokeWidth={2} />
            </div>

            {/* Label Content */}
            <div className="px-1.5 py-0.5 flex items-center gap-1.5 border-l border-[#2a2e39]">
              <span className="font-bold text-[#f23645]">
                SL
              </span>
              <span className="text-white font-medium">
                {formatTradePrice(orderDraft.sl ?? 0)}
              </span>
              <span className="text-[#f23645]/90">
                -{metrics.stopPips.toFixed(1)}p
              </span>
              <span className="text-rose-400 font-medium">
                -${Math.abs(metrics.estimatedLoss).toFixed(2)}
              </span>
            </div>

            {/* Remove button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                updateOrderDraft({ sl: undefined });
              }}
              className="px-1 py-0.5 hover:bg-rose-500/20 text-[#868993] hover:text-rose-400 transition-colors cursor-pointer border-l border-[#2a2e39]"
              title="Remove Stop Loss"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {/* ── 5. Real-Time Dragging Floating HUD Tooltip ── */}
      {activeDrag && dragMousePos && containerRef.current && (
        <div
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-10 transition-transform duration-75 ease-out"
          style={{ left: `${dragMousePos.x}px`, top: `${dragMousePos.y}px` }}
        >
          <div className="flex items-center gap-2 rounded bg-[#131722]/95 px-2 py-1 text-white border border-[#2a2e39] shadow-lg font-mono text-[10px]">
            <span
              className={`font-bold ${
                activeDrag === 'tp'
                  ? 'text-[#089981]'
                  : activeDrag === 'sl'
                  ? 'text-[#f23645]'
                  : 'text-[#2962ff]'
              }`}
            >
              {activeDrag.toUpperCase()}
            </span>
            <span className="font-semibold text-white">
              {formatTradePrice(
                activeDrag === 'tp'
                  ? (orderDraft.tp ?? 0)
                  : activeDrag === 'sl'
                  ? (orderDraft.sl ?? 0)
                  : metrics.entryPrice,
              )}
            </span>
            {activeDrag === 'tp' && (
              <>
                <span className="text-[#089981]">+{metrics.targetPips.toFixed(1)}p</span>
                <span className="text-emerald-400">+${metrics.estimatedGain.toFixed(2)}</span>
                {metrics.rewardMultiple !== null && (
                  <span className="text-[#089981] font-bold">
                    ({metrics.rewardMultiple.toFixed(2)}R)
                  </span>
                )}
              </>
            )}
            {activeDrag === 'sl' && (
              <>
                <span className="text-[#f23645]">-{metrics.stopPips.toFixed(1)}p</span>
                <span className="text-rose-400">-${Math.abs(metrics.estimatedLoss).toFixed(2)}</span>
              </>
            )}
            {activeDrag === 'entry' && (
              <span className="text-[#3b82f6]">
                {metrics.estimatedSize.toFixed(2)}L
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
