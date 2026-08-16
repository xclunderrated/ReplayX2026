import React, { useState, useMemo } from 'react';
import { 
  FlaskConical, Camera, X, RefreshCw, Download, Maximize2, 
  ChevronLeft, ChevronRight, Check, CheckCircle2, ArrowUpRight, 
  Layers, ExternalLink, Image as ImageIcon, Sparkles, AlertCircle
} from 'lucide-react';
import { useSimulatorStore, Session, Trade } from '../../store/useSimulatorStore';
import { 
  captureTradeMultiTimeframeScreenshots, 
  formatTimeframeBadgeLabel,
  AutoScreenshotCapture 
} from '../../services/autoScreenshotService';
import { motion, AnimatePresence } from 'motion/react';

interface LastTradeScreenshotsTestPanelProps {
  session: Session;
  isOpen: boolean;
  onClose: () => void;
  onOpenJournal?: () => void;
}

export const LastTradeScreenshotsTestPanel: React.FC<LastTradeScreenshotsTestPanelProps> = ({
  session,
  isOpen,
  onClose,
  onOpenJournal,
}) => {
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [activeTfIndex, setActiveTfIndex] = useState<number>(0);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [lightboxUrl, setLightboxUrl] = useState<{ url: string; tf: string; title: string } | null>(null);

  // Panel Resizing State
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const saved = localStorage.getItem('last_trade_panel_width');
    return saved ? Math.max(300, Math.min(1000, parseInt(saved, 10))) : 420;
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX; // Moving left expands panel width
      const minW = 300;
      const maxW = Math.max(380, Math.min(window.innerWidth - 80, 1100));
      const newWidth = Math.max(minW, Math.min(maxW, startWidth + deltaX));
      setPanelWidth(newWidth);
      localStorage.setItem('last_trade_panel_width', newWidth.toString());
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const autoOpenLastTradeScreenshots = useSimulatorStore((state) => state.autoOpenLastTradeScreenshots);
  const setAutoOpenLastTradeScreenshots = useSimulatorStore((state) => state.setAutoOpenLastTradeScreenshots);

  // Get all closed trades sorted by exit time descending (most recent first)
  const closedTrades = useMemo(() => {
    return [...(session.trades || [])]
      .filter((t) => t.status === 'closed')
      .sort((a, b) => (b.exitTime ?? b.orderTime) - (a.exitTime ?? a.orderTime));
  }, [session.trades]);

  // Current target trade (either user selected or the most recent closed trade)
  const targetTrade = useMemo(() => {
    if (selectedTradeId) {
      return closedTrades.find((t) => t.id === selectedTradeId) || closedTrades[0] || null;
    }
    return closedTrades[0] || null;
  }, [closedTrades, selectedTradeId]);

  // Gather screenshots from trade.screenshots and session.journalEntries
  const currentScreenshots = useMemo(() => {
    if (!targetTrade) return [];

    const map = new Map<string, { id: string; timeframe: string; title: string; dataUrl: string; createdAt: number }>();

    // 1. From trade.screenshots
    if (targetTrade.screenshots && Array.isArray(targetTrade.screenshots)) {
      for (const shot of targetTrade.screenshots) {
        if (shot.dataUrl) {
          const normTf = formatTimeframeBadgeLabel(shot.timeframe);
          map.set(normTf, shot);
        }
      }
    }

    // 2. From session journal entries for this trade
    if (session.journalEntries && Array.isArray(session.journalEntries)) {
      for (const entry of session.journalEntries) {
        if (entry.tradeId === targetTrade.id && entry.imageDataUrl) {
          const normTf = formatTimeframeBadgeLabel(entry.timeframe || '1M');
          if (!map.has(normTf)) {
            map.set(normTf, {
              id: entry.id,
              timeframe: entry.timeframe || '1M',
              title: entry.title,
              dataUrl: entry.imageDataUrl,
              createdAt: entry.createdAt,
            });
          }
        }
      }
    }

    const list = Array.from(map.values());
    
    // Sort standard order: 5S, 15S, 30S, 1M, 5M, 15M, 30M, 1H, 4H, 1D, 1W
    const tfPriority: Record<string, number> = {
      '5S': 1, '15S': 2, '30S': 3,
      '1M': 4, '5M': 5, '15M': 6, '30M': 7,
      '1H': 8, '4H': 9, '1D': 10, '1W': 11
    };

    list.sort((a, b) => {
      const pA = tfPriority[formatTimeframeBadgeLabel(a.timeframe)] ?? 99;
      const pB = tfPriority[formatTimeframeBadgeLabel(b.timeframe)] ?? 99;
      return pA - pB;
    });

    return list;
  }, [targetTrade, session.journalEntries]);

  // Selected active screenshot
  const activeShot = currentScreenshots[Math.min(activeTfIndex, Math.max(0, currentScreenshots.length - 1))] || currentScreenshots[0] || null;

  // Manual Trigger Capture for testing
  const handleManualCapture = async () => {
    if (!targetTrade) return;
    setIsCapturing(true);
    try {
      await captureTradeMultiTimeframeScreenshots(targetTrade, session);
    } catch (err) {
      console.error('[TestPanel] Capture failed:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleDownload = (dataUrl: string, tf: string) => {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `Screenshot_${session.instrument}_${targetTrade?.type?.toUpperCase() || 'TRADE'}_${formatTimeframeBadgeLabel(tf)}_${Date.now()}.png`;
    link.click();
  };

  if (!isOpen) return null;

  return (
    <>
      <motion.aside
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: panelWidth, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={isDragging ? { duration: 0 } : { type: 'spring', damping: 26, stiffness: 240 }}
        className="relative flex flex-col h-full flex-shrink-0 border-l border-[var(--border-soft)] bg-[var(--surface-1)] z-40 overflow-hidden shadow-2xl"
        style={{ minWidth: 300, maxWidth: Math.max(380, Math.min(window.innerWidth - 80, 1100)) }}
      >
        {/* Resize Handle Bar on Left Edge */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute left-0 top-0 bottom-0 w-3 -translate-x-1/2 z-50 cursor-ew-resize group hover:bg-[var(--accent-1)]/40 transition-colors flex items-center justify-center"
          title="Click and drag to resize panel"
        >
          <div className="w-1 h-10 rounded-full bg-[var(--border-strong)] group-hover:bg-[var(--accent-1)] transition-colors opacity-50 group-hover:opacity-100 shadow-xs" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border-soft)] bg-[var(--surface-2)]/60 select-none">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-[var(--accent-1)]/15 border border-[var(--accent-1)]/30 text-[var(--accent-1)]">
              <Camera size={14} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-[var(--text-primary)] tracking-tight">
                  Last Trade Screenshots
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">Multi-Timeframe Capture Gallery</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleManualCapture}
              disabled={!targetTrade || isCapturing}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition ${
                isCapturing
                  ? 'bg-white/5 text-[var(--text-muted)] border-white/10'
                  : 'bg-[var(--accent-1)] text-[var(--accent-contrast)] hover:opacity-90 border-[var(--accent-1)] shadow-xs'
              }`}
              title="Re-generate screenshots for this trade"
            >
              <RefreshCw size={11} className={isCapturing ? 'animate-spin' : ''} />
              <span>{isCapturing ? 'Rendering...' : 'Re-Capture'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition"
              title="Close panel"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Auto-Open on Trade Close Preference Bar */}
        <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-[var(--border-soft)] bg-[var(--surface-1)]">
          <span className="text-[11px] text-[var(--text-secondary)] font-medium">
            Auto-open menu on trade close
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={autoOpenLastTradeScreenshots}
            onClick={() => setAutoOpenLastTradeScreenshots(!autoOpenLastTradeScreenshots)}
            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              autoOpenLastTradeScreenshots ? 'bg-[var(--accent-1)]' : 'bg-[var(--surface-3)]'
            }`}
            title={autoOpenLastTradeScreenshots ? 'Auto-open menu enabled on trade close (click to disable)' : 'Auto-open menu disabled on trade close (click to enable)'}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                autoOpenLastTradeScreenshots ? 'translate-x-3' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Trade Selector Bar (if multiple closed trades exist) */}
        {closedTrades.length > 1 && (
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-soft)] bg-[var(--surface-1)] text-xs">
            <span className="text-[11px] text-[var(--text-muted)]">Inspect Closed Trade:</span>
            <select
              value={targetTrade?.id || ''}
              onChange={(e) => {
                setSelectedTradeId(e.target.value);
                setActiveTfIndex(0);
              }}
              className="px-2 py-0.5 rounded text-[11px] font-mono bg-[var(--surface-2)] border border-[var(--border-soft)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-1)]"
            >
              {closedTrades.slice(0, 10).map((t, idx) => {
                const pnlStr = t.pnl != null ? (t.pnl >= 0 ? `+$${t.pnl.toFixed(2)}` : `-$${Math.abs(t.pnl).toFixed(2)}`) : '';
                return (
                  <option key={t.id} value={t.id}>
                    #{closedTrades.length - idx} {t.type.toUpperCase()} ({pnlStr}) • {new Date(t.exitTime || t.orderTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 scrollbar-none">
          {!targetTrade ? (
            <div className="flex flex-col items-center justify-center h-64 text-center p-4 rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-2)]/30">
              <Camera size={28} className="text-[var(--text-muted)] mb-2 opacity-50" />
              <h4 className="text-xs font-bold text-[var(--text-primary)]">No Closed Trades Yet</h4>
              <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-[240px]">
                Place and close a trade on the simulator. The system will automatically capture high-resolution multi-timeframe screenshots here.
              </p>
            </div>
          ) : (
            <>
              {/* Trade Summary Pill Card */}
              <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)]/50 p-2.5 space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      targetTrade.type === 'buy'
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    }`}>
                      {targetTrade.type === 'buy' ? 'Long' : 'Short'}
                    </span>
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {session.instrument.toUpperCase()}
                    </span>
                  </div>

                  <span className={`text-xs font-mono font-bold ${
                    (targetTrade.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {(targetTrade.pnl ?? 0) >= 0 ? '+' : '-'}${Math.abs(targetTrade.pnl ?? 0).toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-[var(--border-soft)] text-[10.5px] font-mono">
                  <div>
                    <span className="text-[var(--text-muted)] text-[9.5px] block">Entry</span>
                    <span className="text-[var(--text-primary)]">{targetTrade.entryPrice?.toFixed(5) ?? '--'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] text-[9.5px] block">Exit</span>
                    <span className="text-[var(--text-primary)]">{targetTrade.exitPrice?.toFixed(5) ?? '--'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] text-[9.5px] block">Closed At</span>
                    <span className="text-[var(--text-secondary)]">
                      {targetTrade.exitTime ? new Date(targetTrade.exitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timeframe Tabs Bar */}
              {currentScreenshots.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      Timeframe Captures ({currentScreenshots.length})
                    </span>
                    <span className="text-[10.5px] font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 size={11} />
                      Verified
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {currentScreenshots.map((shot, idx) => {
                      const isSelected = activeTfIndex === idx;
                      const badge = formatTimeframeBadgeLabel(shot.timeframe);
                      return (
                        <button
                          key={shot.id || idx}
                          onClick={() => setActiveTfIndex(idx)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all shrink-0 flex items-center gap-1 ${
                            isSelected
                              ? 'bg-[#2563eb] text-white shadow-sm ring-1 ring-white/30'
                              : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] border border-[var(--border-soft)]'
                          }`}
                        >
                          <span>{badge}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertCircle size={13} />
                    <span>No screenshots captured for this trade yet</span>
                  </div>
                  <p className="text-[11px] text-amber-300/80 leading-relaxed">
                    Click <strong>"Re-Capture"</strong> above to render chart images across all enabled timeframes right now.
                  </p>
                </div>
              )}

              {/* Main Screenshot Preview */}
              {activeShot && (
                <div className="space-y-2">
                  <div className="relative group rounded-xl overflow-hidden border border-[var(--border-soft)] bg-black/40 shadow-md">
                    <img
                      src={activeShot.dataUrl}
                      alt={activeShot.title}
                      className="w-full aspect-video object-contain bg-black/60 transition-transform duration-300 group-hover:scale-[1.01] cursor-pointer"
                      onClick={() => setLightboxUrl({
                        url: activeShot.dataUrl,
                        tf: activeShot.timeframe,
                        title: activeShot.title,
                      })}
                    />

                    {/* Timeframe Badge Overlay */}
                    <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-mono font-bold bg-[#2563eb] text-white shadow-md ring-1 ring-white/30 uppercase tracking-wider">
                        {formatTimeframeBadgeLabel(activeShot.timeframe)}
                      </span>
                    </div>

                    {/* Action Overlay Buttons */}
                    <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition">
                      <button
                        onClick={() => handleDownload(activeShot.dataUrl, activeShot.timeframe)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/80 text-zinc-300 hover:text-white hover:bg-black border border-white/20 shadow-md transition"
                        title="Download PNG"
                      >
                        <Download size={13} />
                      </button>
                      <button
                        onClick={() => setLightboxUrl({
                          url: activeShot.dataUrl,
                          tf: activeShot.timeframe,
                          title: activeShot.title,
                        })}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/80 text-zinc-300 hover:text-white hover:bg-black border border-white/20 shadow-md transition"
                        title="Open Fullscreen Zoom"
                      >
                        <Maximize2 size={13} />
                      </button>
                    </div>

                    {/* Bottom Metadata bar on image */}
                    <div className="absolute inset-x-0 bottom-0 py-1.5 px-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between text-[10px] text-zinc-300 font-mono">
                      <span>{activeShot.title}</span>
                      <span>{new Date(activeShot.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  {/* Thumbnail Strip (when multiple timeframes exist) */}
                  {currentScreenshots.length > 1 && (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {currentScreenshots.map((shot, idx) => {
                        const isSelected = activeTfIndex === idx;
                        return (
                          <button
                            key={shot.id || idx}
                            onClick={() => setActiveTfIndex(idx)}
                            className={`relative rounded-lg overflow-hidden border transition text-left ${
                              isSelected
                                ? 'border-[#2563eb] ring-2 ring-[#2563eb]/50'
                                : 'border-[var(--border-soft)] hover:border-[var(--border-strong)] opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img
                              src={shot.dataUrl}
                              alt={shot.title}
                              className="w-full h-14 object-cover"
                            />
                            <span className="absolute bottom-1 right-1 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-black/80 text-white border border-white/20">
                              {formatTimeframeBadgeLabel(shot.timeframe)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Journal Link Footer */}
              <div className="pt-2 border-t border-[var(--border-soft)] flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">
                  Captured screenshots automatically sync to Journal dossiers.
                </span>
                {onOpenJournal && (
                  <button
                    onClick={onOpenJournal}
                    className="flex items-center gap-1 text-xs font-semibold text-[var(--accent-1)] hover:underline shrink-0"
                  >
                    <span>View Journal</span>
                    <ArrowUpRight size={13} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </motion.aside>

      {/* Lightbox Modal for Full-Resolution Inspection */}
      <AnimatePresence>
        {lightboxUrl && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-6"
            onClick={() => setLightboxUrl(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-5xl w-full max-h-[90vh] bg-[var(--surface-1)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-soft)] bg-[var(--surface-2)]">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-[#2563eb] text-white">
                    {formatTimeframeBadgeLabel(lightboxUrl.tf)}
                  </span>
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {lightboxUrl.title}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownload(lightboxUrl.url, lightboxUrl.tf)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-3)] hover:bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border-soft)] transition"
                  >
                    <Download size={13} />
                    <span>Download Image</span>
                  </button>
                  <button
                    onClick={() => setLightboxUrl(null)}
                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="p-4 flex-1 flex items-center justify-center overflow-auto bg-black/50">
                <img
                  src={lightboxUrl.url}
                  alt={lightboxUrl.title}
                  className="max-h-[75vh] w-auto max-w-full rounded-lg shadow-xl object-contain"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
