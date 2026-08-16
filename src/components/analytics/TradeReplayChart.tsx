import React, { useCallback, useEffect, useRef } from 'react';
import {
  createChart,
  createSeriesMarkers,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
} from 'lightweight-charts';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import { timestampMsToChartTime } from '../../lib/timezone';
import type { TradeReplayData } from './analyticsEngine';

const GRADIENT_BG_RE = /^linear-gradient\(\s*180deg\s*,\s*(.*?)\s*,\s*(.*?)\s*\)$/i;

function parseGradientBackground(value: string):
  | { type: ColorType.VerticalGradient; topColor: string; bottomColor: string }
  | { type: ColorType.Solid; color: string } {
  const m = (value || '').trim().match(GRADIENT_BG_RE);
  if (m) {
    return { type: ColorType.VerticalGradient, topColor: m[1].trim(), bottomColor: m[2].trim() };
  }
  return { type: ColorType.Solid, color: value };
}

interface TradeReplayChartProps {
  replayData: TradeReplayData;
  visibleUpTo: number;
}

export const TradeReplayChart: React.FC<TradeReplayChartProps> = ({ replayData, visibleUpTo }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ReturnType<typeof createSeriesMarkers> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const lastRenderedUpToRef = useRef(-1);

  const chartColors = useSimulatorStore((s) => s.chartColors);
  const gridVertLinesVisible = useSimulatorStore((s) => s.gridVertLinesVisible);
  const gridHorzLinesVisible = useSimulatorStore((s) => s.gridHorzLinesVisible);
  const chartTimezone = useSimulatorStore((s) => s.chartTimezone);

  const clearPriceLines = useCallback(() => {
    const series = seriesRef.current;
    if (series && priceLinesRef.current.length > 0) {
      for (const line of priceLinesRef.current) {
        try {
          series.removePriceLine(line);
        } catch {
          // ignore
        }
      }
    }
    priceLinesRef.current = [];
  }, []);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: parseGradientBackground(chartColors.background),
        textColor: chartColors.text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: chartColors.gridVert, style: 1, visible: gridVertLinesVisible },
        horzLines: { color: chartColors.gridHorz, style: 1, visible: gridHorzLinesVisible },
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: chartColors.timeScaleBorder,
        rightOffset: 12,
      },
      rightPriceScale: {
        borderColor: chartColors.priceScaleBorder,
        autoScale: true,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: chartColors.crosshairVert,
          width: 1,
          style: 3,
          labelBackgroundColor: '#9a4f20',
        },
        horzLine: {
          color: chartColors.crosshairHorz,
          width: 1,
          style: 3,
          labelBackgroundColor: '#9a4f20',
        },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: chartColors.upColor,
      downColor: chartColors.downColor,
      borderUpColor: chartColors.borderUpColor,
      borderDownColor: chartColors.borderDownColor,
      wickUpColor: chartColors.wickUpColor,
      wickDownColor: chartColors.wickDownColor,
      priceFormat: {
        type: 'price',
        precision: 5,
        minMove: 0.00001,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);
    priceLinesRef.current = [];
    lastRenderedUpToRef.current = -1;

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      clearPriceLines();
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
    };
  }, [chartColors, gridVertLinesVisible, gridHorzLinesVisible, clearPriceLines]);

  // Update candle data when visibleUpTo changes
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const markersHandle = markersRef.current;
    if (!series || !chart || !markersHandle) return;

    const { candles, entryIndex, exitIndex, entryPrice, exitPrice, sl, tp, tradeType } = replayData;
    const showUpTo = Math.min(visibleUpTo, candles.length - 1);

    if (showUpTo === lastRenderedUpToRef.current && priceLinesRef.current.length > 0) return;

    // Build visible candle data
    const visibleCandles = candles.slice(0, showUpTo + 1).map((c) => ({
      time: timestampMsToChartTime(c.timestamp, chartTimezone) as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    series.setData(visibleCandles);

    // Build markers
    const markers: any[] = [];

    if (showUpTo >= entryIndex) {
      const entryCandle = candles[entryIndex];
      markers.push({
        time: timestampMsToChartTime(entryCandle.timestamp, chartTimezone),
        position: tradeType === 'buy' ? 'belowBar' : 'aboveBar',
        color: tradeType === 'buy' ? '#089981' : '#f23645',
        shape: tradeType === 'buy' ? 'arrowUp' : 'arrowDown',
        text: `${tradeType === 'buy' ? 'BUY' : 'SELL'} @ ${entryPrice.toFixed(5)}`,
      });
    }

    if (showUpTo >= exitIndex) {
      const exitCandle = candles[exitIndex];
      markers.push({
        time: timestampMsToChartTime(exitCandle.timestamp, chartTimezone),
        position: tradeType === 'buy' ? 'aboveBar' : 'belowBar',
        color: '#35bad4',
        shape: 'circle',
        text: `EXIT @ ${exitPrice.toFixed(5)}`,
      });
    }

    markersHandle.setMarkers(markers);

    // Manage SL/TP/Entry price lines - ensure exactly 1 set exists when past entryIndex
    if (showUpTo >= entryIndex) {
      if (priceLinesRef.current.length === 0) {
        clearPriceLines();
        const lines: IPriceLine[] = [];

        if (sl) {
          lines.push(
            series.createPriceLine({
              price: sl,
              color: '#ef4444',
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: 'SL',
              lineVisible: true,
            })
          );
        }
        if (tp) {
          lines.push(
            series.createPriceLine({
              price: tp,
              color: '#10b981',
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: 'TP',
              lineVisible: true,
            })
          );
        }
        lines.push(
          series.createPriceLine({
            price: entryPrice,
            color: tradeType === 'buy' ? '#089981' : '#f23645',
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: true,
            title: 'Entry',
            lineVisible: true,
          })
        );
        priceLinesRef.current = lines;
      }
    } else {
      // If rewound before entryIndex, clear price lines
      clearPriceLines();
    }

    // Scroll to show the latest candle
    chart.timeScale().scrollToPosition(8, false);

    lastRenderedUpToRef.current = showUpTo;
  }, [visibleUpTo, replayData, chartTimezone, clearPriceLines]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: 300 }}
    />
  );
};
