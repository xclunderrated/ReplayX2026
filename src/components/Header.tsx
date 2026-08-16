import React, { useState } from "react";
import { InstrumentMeta } from "../types";
import { Download, RefreshCw, Calendar, Database, ShieldAlert, Cloud, CloudCheck, CloudUpload, CloudOff } from "lucide-react";
import { useDriveSync } from "../hooks/useDriveSync";

interface HeaderProps {
  instruments: InstrumentMeta[];
  selectedInstrument: string;
  onSelectInstrument: (id: string) => void;
  fromDate: string;
  toDate: string;
  onDatesChange: (from: string, to: string) => void;
  onDownload: () => void;
  isLoading: boolean;
  activeInstrumentMeta?: InstrumentMeta;
  totalCandles?: number;
  errorMsg?: string | null;
  onOpenDriveModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  instruments,
  selectedInstrument,
  onSelectInstrument,
  fromDate,
  toDate,
  onDatesChange,
  onDownload,
  isLoading,
  activeInstrumentMeta,
  totalCandles = 0,
  errorMsg,
  onOpenDriveModal,
}) => {
  const [preset, setPreset] = useState<string>("5d");
  const { isConnected, syncState } = useDriveSync();

  const applyPreset = (daysBack: number, key: string) => {
    setPreset(key);
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - daysBack);

    const fromStr = start.toISOString().split("T")[0];
    const toStr = end.toISOString().split("T")[0];
    onDatesChange(fromStr, toStr);
  };

  const categories = [
    { key: "forex_major", label: "Forex Majors" },
    { key: "forex_cross", label: "Forex Crosses" },
    { key: "forex_exotic", label: "Forex Exotics" },
    { key: "commodities", label: "Commodities & Metals" },
    { key: "crypto", label: "Crypto" },
    { key: "indices", label: "Indices" },
    { key: "stocks", label: "Stocks" },
  ];

  return (
    <header id="main-header" className="bg-[#131722] border-b border-[#1e222d] text-[#d1d4dc] p-3 sm:p-3.5 transition-colors">
      <div className="max-w-7xl mx-auto space-y-2.5">
        {/* Top Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1e222d] pb-2.5">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className="text-[#2962ff] font-extrabold text-lg tracking-tight">DUKAS</span>
              <span className="text-[10px] bg-[#2962ff20] text-[#2962ff] px-1.5 py-0.5 rounded font-bold tracking-wider">REPLAY</span>
            </div>
            <div className="h-4 w-[1px] bg-[#363a45] hidden sm:block" />
            <p className="text-xs text-[#868993] hidden md:block">
              Tick-precision Dukascopy market data bar replay
            </p>
          </div>

          {/* Quick Badges */}
          <div className="flex items-center gap-2 text-[11px] text-[#868993]">
            {/* Google Drive Badge */}
            <button
              type="button"
              onClick={onOpenDriveModal}
              className="flex items-center gap-1.5 bg-[#0c0d10] hover:bg-[#1a1e29] px-2.5 py-1 rounded border border-[#1e222d] text-[#d1d4dc] transition-colors cursor-pointer"
              title="Google Drive Cloud Sync"
            >
              {!isConnected ? (
                <>
                  <CloudOff className="w-3.5 h-3.5 text-[#868993]" />
                  <span className="text-[11px]">Drive: <strong className="text-[#868993]">Off</strong></span>
                </>
              ) : syncState === "synced" ? (
                <>
                  <CloudCheck className="w-3.5 h-3.5 text-[#089981]" />
                  <span className="text-[11px]">Drive: <strong className="text-[#089981]">Synced</strong></span>
                </>
              ) : syncState === "syncing" ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-[#2962ff] animate-spin" />
                  <span className="text-[11px]">Drive: <strong className="text-[#2962ff]">Syncing</strong></span>
                </>
              ) : syncState === "pending" ? (
                <>
                  <CloudUpload className="w-3.5 h-3.5 text-[#eab308]" />
                  <span className="text-[11px]">Drive: <strong className="text-[#eab308]">Pending</strong></span>
                </>
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5 text-[#f23645]" />
                  <span className="text-[11px]">Drive: <strong className="text-[#f23645]">Error</strong></span>
                </>
              )}
            </button>

            <span className="flex items-center gap-1.5 bg-[#0c0d10] px-2.5 py-1 rounded border border-[#1e222d]">
              <Database className="w-3.5 h-3.5 text-[#2962ff]" />
              Source: <strong className="text-[#d1d4dc] font-medium">Dukascopy API</strong>
            </span>
            {totalCandles > 0 && (
              <span className="bg-[#0c0d10] px-2.5 py-1 rounded border border-[#1e222d] text-[#d1d4dc]">
                Cache: <strong className="text-[#089981] font-medium">{totalCandles.toLocaleString()}</strong> 1m candles
              </span>
            )}
          </div>
        </div>

        {/* Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Instrument Selector */}
          <div className="md:col-span-4 flex flex-col space-y-1">
            <label className="text-[10px] font-bold text-[#868993] uppercase tracking-wider">Instrument</label>
            <select
              value={selectedInstrument}
              onChange={(e) => onSelectInstrument(e.target.value)}
              disabled={isLoading}
              className="bg-[#0c0d10] border border-[#363a45] hover:border-[#2962ff] rounded px-3 py-1.5 text-xs font-semibold text-[#d1d4dc] focus:outline-none focus:border-[#2962ff] transition-all disabled:opacity-50"
            >
              {categories.map((cat) => {
                const group = instruments.filter((i) => i.category === cat.key);
                if (group.length === 0) return null;
                return (
                  <optgroup key={cat.key} label={cat.label} className="bg-[#131722] text-[#868993] font-bold">
                    {group.map((inst) => (
                      <option key={inst.id} value={inst.id} className="bg-[#0c0d10] text-[#d1d4dc] font-normal">
                        {inst.symbol} - {inst.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          {/* Date Selector & Presets */}
          <div className="md:col-span-5 flex flex-col space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-[#868993] uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3 text-[#868993]" /> Date Range
              </label>
              <div className="flex items-center space-x-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => applyPreset(2, "2d")}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    preset === "2d" ? "bg-[#2962ff20] text-[#2962ff] font-bold border border-[#2962ff30]" : "text-[#868993] hover:text-[#d1d4dc]"
                  }`}
                >
                  2D
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(5, "5d")}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    preset === "5d" ? "bg-[#2962ff20] text-[#2962ff] font-bold border border-[#2962ff30]" : "text-[#868993] hover:text-[#d1d4dc]"
                  }`}
                >
                  5D
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(14, "14d")}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    preset === "14d" ? "bg-[#2962ff20] text-[#2962ff] font-bold border border-[#2962ff30]" : "text-[#868993] hover:text-[#d1d4dc]"
                  }`}
                >
                  14D
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setPreset("custom");
                  onDatesChange(e.target.value, toDate);
                }}
                disabled={isLoading}
                className="bg-[#0c0d10] border border-[#363a45] hover:border-[#2962ff] rounded px-2.5 py-1.5 text-xs text-[#d1d4dc] w-full focus:outline-none focus:border-[#2962ff] transition-all disabled:opacity-50"
              />
              <span className="text-[#868993] text-xs">—</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setPreset("custom");
                  onDatesChange(fromDate, e.target.value);
                }}
                disabled={isLoading}
                className="bg-[#0c0d10] border border-[#363a45] hover:border-[#2962ff] rounded px-2.5 py-1.5 text-xs text-[#d1d4dc] w-full focus:outline-none focus:border-[#2962ff] transition-all disabled:opacity-50"
              />
            </div>
          </div>

          {/* Download Action Button */}
          <div className="md:col-span-3 flex items-end">
            <button
              id="fetch-data-btn"
              type="button"
              onClick={onDownload}
              disabled={isLoading}
              className="w-full h-[32px] bg-[#2962ff] hover:bg-[#1e4bd8] active:bg-[#153bb5] text-white font-bold text-xs px-4 rounded transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>FETCHING DATA...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>DOWNLOAD DATA</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Alert Box if any */}
        {errorMsg && (
          <div className="bg-[#2a1318] border border-[#f2364580] rounded p-2.5 flex items-start space-x-2 text-[#f23645] text-xs animate-fadeIn">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="font-bold text-[#f23645]">Data Notice: </strong>
              <span>{errorMsg}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
