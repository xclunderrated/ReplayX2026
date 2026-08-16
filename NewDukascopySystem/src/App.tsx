import React, { useEffect, useState, useCallback } from "react";
import { DownloadResponse, InstrumentMeta, TimeframeId } from "./types";
import { fetchInstruments, downloadMarketData } from "./services/api";
import { aggregateCandles, findIndexForTimestamp } from "./utils/timeframe";
import { Header } from "./components/Header";
import { TimeframeBar } from "./components/TimeframeBar";
import { ReplayControls } from "./components/ReplayControls";
import { TradingChart } from "./components/TradingChart";
import { HotkeysModal } from "./components/HotkeysModal";

export default function App() {
  const [instruments, setInstruments] = useState<InstrumentMeta[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<string>("eurusd");

  // Default dates: recent business days range
  const getDefaultDates = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 5);
    return {
      from: start.toISOString().split("T")[0],
      to: end.toISOString().split("T")[0],
    };
  };

  const defaultDates = getDefaultDates();
  const [fromDate, setFromDate] = useState<string>(defaultDates.from);
  const [toDate, setToDate] = useState<string>(defaultDates.to);

  // Market Data State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dataset, setDataset] = useState<DownloadResponse | null>(null);

  // Replay State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(1); // 1x multiplier
  const [currentTimeframe, setCurrentTimeframe] = useState<TimeframeId>("15m");

  // Hotkeys Modal
  const [isHotkeysOpen, setIsHotkeysOpen] = useState<boolean>(false);

  // Handle Download Request
  const handleDownload = useCallback(async (instToFetch = selectedInstrument) => {
    try {
      setIsPlaying(false);
      setIsLoading(true);
      setErrorMsg(null);

      const data = await downloadMarketData(instToFetch, fromDate, toDate);
      setDataset(data);

      const initIdx = data.candles.length > 50 ? Math.floor(data.candles.length * 0.15) : 0;
      setCurrentIndex(initIdx);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to download market data from Dukascopy.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedInstrument, fromDate, toDate]);

  // Auto-download instruments list & initial Dukascopy dataset on mount
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        setIsLoading(true);
        setErrorMsg(null);

        const list = await fetchInstruments();
        if (isMounted) setInstruments(list);

        // Fetch initial market data for EURUSD
        const data = await downloadMarketData("eurusd", defaultDates.from, defaultDates.to);
        if (isMounted) {
          setDataset(data);
          const initIdx = data.candles.length > 50 ? Math.floor(data.candles.length * 0.15) : 0;
          setCurrentIndex(initIdx);
        }

        // Silent background prefetch for other top instruments
        setTimeout(() => {
          downloadMarketData("gbpusd", defaultDates.from, defaultDates.to).catch(() => {});
          downloadMarketData("xauusd", defaultDates.from, defaultDates.to).catch(() => {});
        }, 1000);
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err?.message || "Failed to download market data from Dukascopy.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-fetch when user selects a different instrument
  const handleSelectInstrument = (instId: string) => {
    setSelectedInstrument(instId);
    handleDownload(instId);
  };


  const baseCandles = dataset?.candles || [];
  const currentReplayCandle = baseCandles[currentIndex] || null;
  const activeMeta = dataset?.instrument;

  // Replay Timer Hook
  useEffect(() => {
    if (!isPlaying || !dataset || dataset.candles.length === 0) return;

    const intervalMs = Math.max(20, Math.floor(1000 / speed));

    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= dataset.candles.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, speed, dataset]);

  // Replay Controls Handlers
  const handleTogglePlay = useCallback(() => {
    if (!dataset || dataset.candles.length === 0) return;
    setIsPlaying((prev) => !prev);
  }, [dataset]);

  const handleStepForward = useCallback(() => {
    if (!dataset || dataset.candles.length === 0) return;
    setIsPlaying(false);
    setCurrentIndex((prev) => Math.min(prev + 1, dataset.candles.length - 1));
  }, [dataset]);

  const handleStepBackward = useCallback(() => {
    if (!dataset || dataset.candles.length === 0) return;
    setIsPlaying(false);
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, [dataset]);

  const handleResetStart = useCallback(() => {
    setIsPlaying(false);
    setCurrentIndex(0);
  }, []);

  const handleJumpEnd = useCallback(() => {
    if (!dataset || dataset.candles.length === 0) return;
    setIsPlaying(false);
    setCurrentIndex(dataset.candles.length - 1);
  }, [dataset]);

  const handleSeekIndex = (idx: number) => {
    setIsPlaying(false);
    setCurrentIndex(idx);
  };

  const handleChartClickTimestamp = (timeSec: number) => {
    if (!dataset || dataset.candles.length === 0) return;
    const matchIdx = findIndexForTimestamp(dataset.candles, timeSec);
    setIsPlaying(false);
    setCurrentIndex(matchIdx);
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "SELECT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleStepForward();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handleStepBackward();
      } else if (e.code === "Home") {
        e.preventDefault();
        handleResetStart();
      } else if (e.code === "End") {
        e.preventDefault();
        handleJumpEnd();
      } else if (e.key === "1") {
        setCurrentTimeframe("5s");
      } else if (e.key === "2") {
        setCurrentTimeframe("15s");
      } else if (e.key === "3") {
        setCurrentTimeframe("30s");
      } else if (e.key === "4") {
        setCurrentTimeframe("1m");
      } else if (e.key === "5") {
        setCurrentTimeframe("5m");
      } else if (e.key === "6") {
        setCurrentTimeframe("15m");
      } else if (e.key === "7") {
        setCurrentTimeframe("30m");
      } else if (e.key === "8") {
        setCurrentTimeframe("1h");
      } else if (e.key === "9") {
        setCurrentTimeframe("4h");
      } else if (e.key === "0") {
        setCurrentTimeframe("1D");
      } else if (e.key.toLowerCase() === "w") {
        setCurrentTimeframe("1W");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTogglePlay, handleStepForward, handleStepBackward, handleResetStart, handleJumpEnd]);

  // Aggregate candles for selected timeframe
  const currentCandlesToRender = aggregateCandles(baseCandles, currentIndex, currentTimeframe);

  return (
    <div id="app-root" className="min-h-screen bg-[#0c0d10] text-[#d1d4dc] flex flex-col font-sans antialiased selection:bg-[#2962ff30] selection:text-[#2962ff]">
      {/* Top Header Controls Panel */}
      <Header
        instruments={instruments}
        selectedInstrument={selectedInstrument}
        onSelectInstrument={handleSelectInstrument}
        fromDate={fromDate}
        toDate={toDate}
        onDatesChange={(from, to) => {
          setFromDate(from);
          setToDate(to);
        }}
        onDownload={handleDownload}
        isLoading={isLoading}
        activeInstrumentMeta={activeMeta}
        totalCandles={baseCandles.length}
        errorMsg={errorMsg}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Timeframe Bar */}
        <div className="bg-[#131722] border-b border-[#1e222d] px-4 py-1.5 flex items-center justify-between">
          <TimeframeBar
            currentTimeframe={currentTimeframe}
            onSelectTimeframe={setCurrentTimeframe}
            disabled={isLoading || baseCandles.length === 0}
          />

          <div className="text-xs text-[#868993] font-medium hidden md:flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[#089981] animate-pulse" />
            <span>Click any candle on the chart to jump replay | Space: Play/Pause | Arrow keys: Step</span>
          </div>
        </div>

        {/* Chart Stage */}
        <div className="flex-1 relative min-h-[450px]">
          <TradingChart
            candles={currentCandlesToRender}
            instrument={activeMeta}
            timeframe={currentTimeframe}
            onChartClickTimestamp={handleChartClickTimestamp}
            replayTimeSec={currentReplayCandle?.time}
          />

          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-[#0c0d10]/90 backdrop-blur-xs flex flex-col items-center justify-center z-30 space-y-3">
              <div className="w-10 h-10 border-3 border-[#2962ff] border-t-transparent rounded-full animate-spin" />
              <div className="text-sm font-bold text-[#d1d4dc]">Fetching Dukascopy Market Data...</div>
              <p className="text-xs text-[#868993] max-w-sm text-center">
                Decompressing binary Dukascopy archives and building OHLC candles
              </p>
            </div>
          )}
        </div>

        {/* Replay Controls Footer */}
        <ReplayControls
          isPlaying={isPlaying}
          onTogglePlay={handleTogglePlay}
          onStepForward={handleStepForward}
          onStepBackward={handleStepBackward}
          onResetStart={handleResetStart}
          onJumpEnd={handleJumpEnd}
          currentIndex={currentIndex}
          totalCount={baseCandles.length}
          onSeekIndex={handleSeekIndex}
          speed={speed}
          onSpeedChange={setSpeed}
          currentTimestampSec={currentReplayCandle?.time}
          onOpenHotkeysModal={() => setIsHotkeysOpen(true)}
          disabled={isLoading}
        />
      </main>

      {/* Keyboard Shortcuts Modal */}
      <HotkeysModal isOpen={isHotkeysOpen} onClose={() => setIsHotkeysOpen(false)} />
    </div>
  );
}
