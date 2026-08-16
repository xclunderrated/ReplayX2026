import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  UTCTimestamp,
} from "lightweight-charts";
import { InstrumentMeta, OHLCCandle, TimeframeId } from "../types";
import { formatUTCTimestamp } from "../utils/timeframe";

interface TradingChartProps {
  candles: OHLCCandle[];
  instrument?: InstrumentMeta;
  timeframe: TimeframeId;
  onChartClickTimestamp?: (timeSec: number) => void;
  replayTimeSec?: number;
}

export const TradingChart: React.FC<TradingChartProps> = ({
  candles,
  instrument,
  timeframe,
  onChartClickTimestamp,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // Hover/Active Legend State
  const [legendCandle, setLegendCandle] = useState<OHLCCandle | null>(null);

  const decimals = instrument?.decimalPlaces ?? (instrument?.symbol.includes("JPY") ? 3 : 5);
  const pipSize = instrument?.pipSize ?? (instrument?.symbol.includes("JPY") ? 0.01 : 0.0001);

  // Initialize TradingView Chart on mount
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 500,
      layout: {
        background: { type: ColorType.Solid, color: "#0c0d10" },
        textColor: "#868993",
        fontSize: 12,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
      },
      grid: {
        vertLines: { color: "#1e222d", style: 1 },
        horzLines: { color: "#1e222d", style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#2962ff",
          width: 1,
          style: 2,
          labelBackgroundColor: "#1e222d",
        },
        horzLine: {
          color: "#2962ff",
          width: 1,
          style: 2,
          labelBackgroundColor: "#2962ff",
        },
      },
      timeScale: {
        borderColor: "#1e222d",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
      },
      rightPriceScale: {
        borderColor: "#1e222d",
        autoScale: true,
      },
    });

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#089981",
      downColor: "#f23645",
      borderVisible: false,
      wickUpColor: "#089981",
      wickDownColor: "#f23645",
      priceFormat: {
        type: "price",
        precision: decimals,
        minMove: 1 / Math.pow(10, decimals),
      },
    });

    // Volume Histogram Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#2962ff",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Chart click handler to seek replay timestamp
    chart.subscribeClick((param) => {
      if (param.time && onChartClickTimestamp) {
        onChartClickTimestamp(param.time as number);
      }
    });

    // Crosshair hover legend handler
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || param.point === undefined || param.point.x < 0 || param.point.y < 0) {
        setLegendCandle(null);
        return;
      }

      const candleData = param.seriesData.get(candleSeries) as unknown as OHLCCandle | undefined;
      if (candleData) {
        setLegendCandle(candleData);
      } else {
        setLegendCandle(null);
      }
    });

    // ResizeObserver
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Update decimal precision when instrument changes
  useEffect(() => {
    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({
        priceFormat: {
          type: "price",
          precision: decimals,
          minMove: 1 / Math.pow(10, decimals),
        },
      });
    }
  }, [decimals]);

  // Update candles
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    if (!candles || candles.length === 0) {
      candleSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
      return;
    }

    const formattedCandles = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const formattedVolume = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? "rgba(8, 153, 129, 0.35)" : "rgba(242, 54, 69, 0.35)",
    }));

    candleSeriesRef.current.setData(formattedCandles);
    volumeSeriesRef.current.setData(formattedVolume);

    // Scroll to latest candle
    if (chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime();
    }
  }, [candles]);

  // Display legend candle details
  const activeCandle = legendCandle || (candles.length > 0 ? candles[candles.length - 1] : null);

  // Calculate Net Pips & Change %
  let pipChange = 0;
  let percentChange = 0;
  let isPositive = true;

  if (activeCandle) {
    const diff = activeCandle.close - activeCandle.open;
    pipChange = diff / pipSize;
    percentChange = (diff / activeCandle.open) * 100;
    isPositive = diff >= 0;
  }

  return (
    <div id="chart-wrapper" className="relative w-full h-full min-h-[450px] bg-[#0c0d10] flex flex-col select-none">
      {/* Top Left Floating Legend Panel */}
      <div className="absolute top-3 left-3 z-10 bg-[#131722]/90 backdrop-blur-sm border border-[#1e222d] rounded-lg p-2.5 shadow-xl text-xs space-y-1 max-w-lg pointer-events-none">
        <div className="flex items-center space-x-2">
          <span className="font-extrabold text-[#d1d4dc] text-sm tracking-tight">{instrument?.symbol || "EUR/USD"}</span>
          <span className="bg-[#2962ff20] border border-[#2962ff30] text-[#2962ff] font-bold px-1.5 py-0.2 text-[10px] rounded">
            {timeframe}
          </span>
          <span className="text-[#868993] text-[11px]">Dukascopy Data</span>
        </div>

        {activeCandle ? (
          <div className="space-y-1">
            <div className="text-[#868993] font-mono text-[11px]">{formatUTCTimestamp(activeCandle.time)}</div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
              <span>
                <strong className="text-[#868993]">O:</strong>{" "}
                <span className="text-[#d1d4dc]">{activeCandle.open.toFixed(decimals)}</span>
              </span>
              <span>
                <strong className="text-[#868993]">H:</strong>{" "}
                <span className="text-[#089981]">{activeCandle.high.toFixed(decimals)}</span>
              </span>
              <span>
                <strong className="text-[#868993]">L:</strong>{" "}
                <span className="text-[#f23645]">{activeCandle.low.toFixed(decimals)}</span>
              </span>
              <span>
                <strong className="text-[#868993]">C:</strong>{" "}
                <span className="text-[#d1d4dc]">{activeCandle.close.toFixed(decimals)}</span>
              </span>
            </div>

            <div className="flex items-center space-x-3 font-mono text-xs pt-0.5">
              <span className={`font-bold ${isPositive ? "text-[#089981]" : "text-[#f23645]"}`}>
                {isPositive ? "+" : ""}
                {pipChange.toFixed(1)} pips ({isPositive ? "+" : ""}
                {percentChange.toFixed(2)}%)
              </span>
              <span className="text-[#868993]">
                Vol: <strong className="text-[#d1d4dc]">{Math.round(activeCandle.volume).toLocaleString()}</strong>
              </span>
            </div>
          </div>
        ) : (
          <div className="text-[#868993] text-xs italic">No candle selected</div>
        )}
      </div>

      {/* Main Lightweight Charts Container */}
      <div ref={chartContainerRef} className="w-full h-full flex-1" />
    </div>
  );
};
