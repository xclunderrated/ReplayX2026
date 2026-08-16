import React, { useState } from 'react';
import { useSimulatorStore, type Trade } from '../store/useSimulatorStore';
import { getPipSize, getContractMultiplier, validateTradeUpdate } from '../lib/orders';
import { X, Edit3, Trash2, Check, AlertTriangle, ArrowUpRight, ArrowDownRight, Scale, ShieldCheck, Scissors, Gauge, Tag } from 'lucide-react';

export interface OverlayTrade extends Trade {
  slPrice?: number;
  tpPrice?: number;
  limitPrice?: number;
  slPnl?: number;
  tpPnl?: number;
  entryY?: number | null;
  slY?: number | null;
  tpY?: number | null;
  limitY?: number | null;
  currentPnl?: number;
}

interface OrderTooltipCardProps {
  trade: OverlayTrade;
  instrument: string;
  currentPrice: number;
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
  onCloseTooltip: () => void;
  onModifyTrade: (tradeId: string, updates: Partial<Trade>) => void;
  onCancelOrder: (tradeId: string) => void;
  onCloseTrade: (tradeId: string) => void;
}

function fmtPrice(v?: number, digits = 5) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '--';
}

function fmtPnl(v?: number) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '--';
  const sign = v >= 0 ? '+' : '';
  return `${sign}$${v.toFixed(2)}`;
}

const COMMON_SETUPS = ['Fair Value Gap (FVG)', 'Order Block', 'Liquidity Sweep', 'Break & Retest', 'Trend Continuation', 'Range Reversal'];
const COMMON_MISTAKES = ['FOMO / Chasing', 'Early Exit', 'Moved SL Wider', 'Over-leveraged', 'Revenge Trade', 'Ignored Higher TF'];

export const OrderTooltipCard: React.FC<OrderTooltipCardProps> = ({
  trade,
  instrument,
  currentPrice,
  x,
  y,
  containerWidth,
  containerHeight,
  onCloseTooltip,
  onModifyTrade,
  onCancelOrder,
  onCloseTrade,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showInTradeTools, setShowInTradeTools] = useState(false);
  const [trailingStopPips, setTrailingStopPips] = useState<string>(trade.trailingStop?.distancePips ? String(trade.trailingStop.distancePips) : '');
  const [slInput, setSlInput] = useState<string>(trade.sl ? String(trade.sl) : '');
  const [tpInput, setTpInput] = useState<string>(trade.tp ? String(trade.tp) : '');
  const [limitInput, setLimitInput] = useState<string>(trade.limitPrice ? String(trade.limitPrice) : '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const moveToBreakEven = useSimulatorStore((s) => s.moveToBreakEven);
  const partialCloseTrade = useSimulatorStore((s) => s.partialCloseTrade);
  const setTrailingStop = useSimulatorStore((s) => s.setTrailingStop);
  const updateTradeMetadata = useSimulatorStore((s) => s.updateTradeMetadata);

  const isBuy = trade.type === 'buy';
  const isPending = trade.status === 'pending';
  const isOpen = trade.status === 'open';

  const pipSize = getPipSize(instrument);
  const multiplier = getContractMultiplier(instrument);
  const entry = trade.entryPrice ?? trade.limitPrice ?? currentPrice;

  // Calculate distances in pips
  const pnlPips = entry && currentPrice
    ? isBuy ? (currentPrice - entry) / pipSize : (entry - currentPrice) / pipSize
    : 0;

  const slPips = trade.sl && entry
    ? Math.abs(entry - trade.sl) / pipSize
    : null;

  const tpPips = trade.tp && entry
    ? Math.abs(trade.tp - entry) / pipSize
    : null;

  // Risk : Reward
  const rrRatio = slPips && tpPips && slPips > 0 ? (tpPips / slPips).toFixed(1) : null;

  // Smart Tooltip Placement Positioning
  const tooltipWidth = 320;
  const tooltipHeight = isEditing || showInTradeTools ? 420 : 280;

  let leftPos = x + 16;
  if (leftPos + tooltipWidth > containerWidth - 10) {
    leftPos = Math.max(10, x - tooltipWidth - 16);
  }

  let topPos = y - tooltipHeight / 2;
  if (topPos < 10) topPos = 10;
  if (topPos + tooltipHeight > containerHeight - 10) {
    topPos = Math.max(10, containerHeight - tooltipHeight - 10);
  }

  const handleNudge = (field: 'sl' | 'tp' | 'limit', deltaPips: number) => {
    if (field === 'sl') {
      const currentVal = slInput !== '' ? Number(slInput) : (trade.sl ?? entry);
      const nextVal = Number((currentVal + (isBuy ? -1 : 1) * deltaPips * pipSize).toFixed(5));
      setSlInput(String(nextVal));
    } else if (field === 'tp') {
      const currentVal = tpInput !== '' ? Number(tpInput) : (trade.tp ?? entry);
      const nextVal = Number((currentVal + (isBuy ? 1 : -1) * deltaPips * pipSize).toFixed(5));
      setTpInput(String(nextVal));
    } else if (field === 'limit') {
      const currentVal = limitInput !== '' ? Number(limitInput) : (trade.limitPrice ?? currentPrice);
      const nextVal = Number((currentVal + deltaPips * pipSize).toFixed(5));
      setLimitInput(String(nextVal));
    }
  };

  const handleApplyPreset = (field: 'sl' | 'tp', presetPips: number) => {
    if (field === 'sl') {
      const nextVal = Number((entry + (isBuy ? -1 : 1) * presetPips * pipSize).toFixed(5));
      setSlInput(String(nextVal));
    } else if (field === 'tp') {
      const nextVal = Number((entry + (isBuy ? 1 : -1) * presetPips * pipSize).toFixed(5));
      setTpInput(String(nextVal));
    }
  };

  const handleSave = () => {
    setErrorMsg(null);
    const updates: Partial<Trade> = {};

    if (isPending && limitInput.trim() !== '') {
      const nextLimit = Number(limitInput);
      if (!Number.isFinite(nextLimit) || nextLimit <= 0) {
        setErrorMsg('Invalid Limit Price');
        return;
      }
      updates.limitPrice = nextLimit;
    }

    if (slInput.trim() !== '') {
      const nextSl = Number(slInput);
      if (!Number.isFinite(nextSl) || nextSl <= 0) {
        setErrorMsg('Invalid Stop Loss');
        return;
      }
      updates.sl = nextSl;
    } else if (trade.sl !== undefined) {
      updates.sl = undefined;
    }

    if (tpInput.trim() !== '') {
      const nextTp = Number(tpInput);
      if (!Number.isFinite(nextTp) || nextTp <= 0) {
        setErrorMsg('Invalid Take Profit');
        return;
      }
      updates.tp = nextTp;
    } else if (trade.tp !== undefined) {
      updates.tp = undefined;
    }

    const validation = validateTradeUpdate(trade, updates, currentPrice);
    if (!validation.isValid) {
      setErrorMsg(validation.errors?.[0] || 'Invalid order parameters');
      return;
    }

    onModifyTrade(trade.id, updates);
    setIsEditing(false);
  };

  const effectiveRemaining = trade.remainingSize ?? trade.size;

  return (
    <div
      id={`order-tooltip-${trade.id}`}
      style={{ left: leftPos, top: topPos }}
      className="absolute z-50 w-[320px] select-none rounded-xl border border-[#2a2e39] bg-[#131722]/95 p-3 text-[#d1d4dc] shadow-2xl backdrop-blur-md font-sans animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-panel)] pb-2">
        <div className="flex items-center space-x-2">
          <span
            className={`flex items-center space-x-1 rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
              isBuy ? 'bg-[#089981]/20 text-[#089981]' : 'bg-[#f23645]/20 text-[#f23645]'
            }`}
          >
            {isBuy ? <ArrowUpRight size={12} strokeWidth={3} /> : <ArrowDownRight size={12} strokeWidth={3} />}
            <span>{isBuy ? 'BUY' : 'SELL'}</span>
          </span>

          <span className="font-mono text-xs font-bold text-white">
            {effectiveRemaining.toFixed(2)} lots {trade.remainingSize !== undefined && <span className="text-[10px] text-[#868993]">({trade.size} init)</span>}
          </span>

          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
              isOpen ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
            }`}
          >
            {isOpen ? 'FILLED' : 'PENDING'}
          </span>
        </div>

        <button
          onClick={onCloseTooltip}
          className="rounded p-1 text-[#868993] hover:bg-[var(--surface-chip)] hover:text-white transition cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      <div className="pt-2.5">
        {!isEditing && !showInTradeTools ? (
          <>
            {/* Live Metrics Grid */}
            <div className="space-y-1.5 mb-3">
              {isOpen && (
                <div className="flex items-center justify-between rounded-lg bg-[var(--surface-inset)] px-2.5 py-2 border border-[var(--border-panel)]">
                  <span className="text-[11px] font-semibold text-[#868993]">Unrealized P&L</span>
                  <div className="text-right font-mono">
                    <span
                      className={`text-sm font-extrabold ${
                        (trade.currentPnl ?? 0) >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                      }`}
                    >
                      {fmtPnl(trade.currentPnl)}
                    </span>
                    <span className="ml-1.5 text-[10px] text-[#868993]">
                      ({pnlPips >= 0 ? '+' : ''}{pnlPips.toFixed(1)}p)
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="rounded bg-[var(--surface-inset)] p-2 border border-[var(--border-panel)]">
                  <div className="text-[9px] uppercase tracking-wide text-[#868993]">ENTRY / LIMIT</div>
                  <div className="font-mono font-bold text-white mt-0.5">{fmtPrice(entry)}</div>
                </div>

                <div className="rounded bg-[var(--surface-inset)] p-2 border border-[var(--border-panel)]">
                  <div className="text-[9px] uppercase tracking-wide text-[#868993]">CURRENT PRICE</div>
                  <div className="font-mono font-bold text-white mt-0.5">{fmtPrice(currentPrice)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="rounded bg-[var(--surface-inset)] p-2 border border-[var(--border-panel)]">
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-[#f23645]">
                    <span>STOP LOSS</span>
                    <span className="font-mono">{slPips ? `${slPips.toFixed(1)}p` : '--'}</span>
                  </div>
                  <div className="font-mono font-bold text-[#f23645] mt-0.5">{fmtPrice(trade.sl)}</div>
                </div>

                <div className="rounded bg-[var(--surface-inset)] p-2 border border-[var(--border-panel)]">
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-[#089981]">
                    <span>TAKE PROFIT</span>
                    <span className="font-mono">{tpPips ? `${tpPips.toFixed(1)}p` : '--'}</span>
                  </div>
                  <div className="font-mono font-bold text-[#089981] mt-0.5">{fmtPrice(trade.tp)}</div>
                </div>
              </div>

              {rrRatio && (
                <div className="flex items-center justify-between rounded bg-[var(--surface-inset)] px-2.5 py-1 border border-[var(--border-panel)] text-[10px]">
                  <span className="text-[#868993]">Risk : Reward Ratio</span>
                  <span className="font-mono font-extrabold text-[#089981]">1 : {rrRatio}</span>
                </div>
              )}
            </div>

            {/* In-Trade Management Row for Open Trades */}
            {isOpen && (
              <div className="mb-3 space-y-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-amber-300">
                  <span className="flex items-center gap-1"><Gauge size={11} /> In-Trade Controls</span>
                  <button
                    onClick={() => setShowInTradeTools(true)}
                    className="text-[9px] uppercase tracking-wider text-[var(--accent-1)] hover:underline"
                  >
                    Advanced Tag / Scale
                  </button>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => moveToBreakEven(trade.id)}
                    className="flex-1 rounded border border-emerald-500/30 bg-emerald-500/10 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition flex items-center justify-center gap-1"
                    title="Move Stop Loss to Entry Price (Break Even)"
                  >
                    <ShieldCheck size={11} />
                    <span>Move BE</span>
                  </button>

                  <button
                    onClick={() => partialCloseTrade(trade.id, 50)}
                    className="flex-1 rounded border border-blue-500/30 bg-blue-500/10 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/20 transition flex items-center justify-center gap-1"
                    title="Scale Out / Take 50% Profit Now"
                  >
                    <Scissors size={11} />
                    <span>Close 50%</span>
                  </button>
                </div>
              </div>
            )}

            {/* Quick Action Buttons */}
            <div className="flex space-x-2 border-t border-[var(--border-panel)] pt-2.5">
              <button
                onClick={() => setIsEditing(true)}
                className="flex flex-1 items-center justify-center space-x-1.5 rounded-lg border border-[var(--border-panel-strong)] bg-[var(--surface-chip)] py-2 text-[11px] font-bold text-white hover:bg-[var(--border-panel)] transition cursor-pointer"
              >
                <Edit3 size={12} className="text-[var(--accent-1)]" />
                <span>Modify Order</span>
              </button>

              <button
                onClick={() => {
                  if (isPending) onCancelOrder(trade.id);
                  else onCloseTrade(trade.id);
                  onCloseTooltip();
                }}
                className="flex flex-1 items-center justify-center space-x-1.5 rounded-lg bg-[#f23645]/20 border border-[#f23645]/50 py-2 text-[11px] font-bold text-[#f23645] hover:bg-[#f23645] hover:text-white transition cursor-pointer"
              >
                <Trash2 size={12} />
                <span>{isPending ? 'Cancel Order' : 'Close Position'}</span>
              </button>
            </div>
          </>
        ) : showInTradeTools ? (
          /* ── In-Trade Tools & Tagging View ── */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wide text-white">
              <span>In-Trade Scale & Strategy Tagging</span>
              <button
                onClick={() => setShowInTradeTools(false)}
                className="text-[10px] text-[#868993] hover:text-white"
              >
                Back
              </button>
            </div>

            {/* Scale Out Options */}
            <div className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] p-2">
              <div className="mb-1.5 text-[10px] font-bold text-[#868993] flex items-center gap-1">
                <Scissors size={11} /> Partial Scale-Out at Market
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[25, 50, 75].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => {
                      partialCloseTrade(trade.id, pct);
                      setShowInTradeTools(false);
                    }}
                    className="rounded border border-blue-500/30 bg-blue-500/10 py-1.5 font-mono text-[10px] font-bold text-blue-300 hover:bg-blue-500/25 transition"
                  >
                    Close {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Trailing Stop */}
            <div className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] p-2">
              <div className="mb-1 text-[10px] font-bold text-[#868993] flex items-center justify-between">
                <span>Trailing Stop Distance (Pips)</span>
                {trade.trailingStop?.active && <span className="text-[#089981] font-mono">Active</span>}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  placeholder="Distance in pips (e.g. 15)"
                  value={trailingStopPips}
                  onChange={(e) => setTrailingStopPips(e.target.value)}
                  className="h-7 flex-1 rounded border border-[var(--border-panel-strong)] bg-[var(--surface-panel)] px-2 font-mono text-[11px] text-white outline-none focus:border-[var(--accent-1)]"
                />
                <button
                  onClick={() => {
                    const dist = Number(trailingStopPips);
                    if (Number.isFinite(dist) && dist > 0) {
                      setTrailingStop(trade.id, dist);
                      setShowInTradeTools(false);
                    }
                  }}
                  className="rounded bg-[var(--accent-1)] px-3 text-[10px] font-bold text-[var(--accent-contrast)] hover:opacity-90"
                >
                  Set
                </button>
              </div>
            </div>

            {/* Strategy Setup Tagging */}
            <div className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] p-2">
              <div className="mb-1 text-[10px] font-bold text-[#868993] flex items-center gap-1">
                <Tag size={11} /> Strategy Setup Model
              </div>
              <select
                value={trade.setupTag || ''}
                onChange={(e) => updateTradeMetadata(trade.id, { setupTag: e.target.value })}
                className="w-full h-7 rounded border border-[var(--border-panel-strong)] bg-[var(--surface-panel)] px-2 text-[11px] text-white outline-none"
              >
                <option value="">Select Setup...</option>
                {COMMON_SETUPS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Mistake Tagging */}
            <div className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] p-2">
              <div className="mb-1 text-[10px] font-bold text-[#868993] flex items-center gap-1">
                <AlertTriangle size={11} /> Rule Violation / Mistake Tag
              </div>
              <select
                value={trade.mistakeTag || ''}
                onChange={(e) => updateTradeMetadata(trade.id, { mistakeTag: e.target.value })}
                className="w-full h-7 rounded border border-[var(--border-panel-strong)] bg-[var(--surface-panel)] px-2 text-[11px] text-white outline-none"
              >
                <option value="">None (Followed Plan)</option>
                {COMMON_MISTAKES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="pt-1">
              <button
                onClick={() => setShowInTradeTools(false)}
                className="w-full rounded-lg bg-[var(--surface-chip)] py-1.5 text-[11px] font-bold text-white hover:bg-[var(--border-panel)] transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ── Inline Editing View ── */
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wide text-white">
              <span>Quick Modify Trade</span>
              <span className="font-mono text-[10px] text-[#868993]">Entry: {fmtPrice(entry)}</span>
            </div>

            {errorMsg && (
              <div className="flex items-center space-x-1 rounded bg-red-500/10 p-1.5 border border-red-500/30 text-[10px] text-red-400">
                <AlertTriangle size={12} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Pending Limit Price Field */}
            {isPending && (
              <div className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] p-2">
                <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-[#868993]">
                  <span>LIMIT PRICE</span>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleNudge('limit', -5)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border-panel-strong)] bg-[var(--surface-chip)] text-[10px] font-mono font-bold text-[#868993] hover:text-white transition cursor-pointer"
                  >
                    -5p
                  </button>
                  <input
                    type="number"
                    value={limitInput}
                    onChange={(e) => setLimitInput(e.target.value)}
                    step="0.00001"
                    className="h-7 flex-1 rounded border border-[var(--border-panel-strong)] bg-[var(--surface-panel)] px-2 text-right font-mono text-[11px] font-bold text-white outline-none focus:border-[var(--accent-1)]"
                  />
                  <button
                    onClick={() => handleNudge('limit', 5)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border-panel-strong)] bg-[var(--surface-chip)] text-[10px] font-mono font-bold text-[#868993] hover:text-white transition cursor-pointer"
                  >
                    +5p
                  </button>
                </div>
              </div>
            )}

            {/* Stop Loss Field */}
            <div className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] p-2">
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-[#f23645]">
                <span>STOP LOSS</span>
                <span className="font-mono text-[9px] text-[#868993]">
                  {slInput ? `${Math.abs((Number(slInput) - entry) / pipSize).toFixed(1)} pips` : 'None'}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handleNudge('sl', 5)}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border-panel-strong)] bg-[var(--surface-chip)] text-[10px] font-mono font-bold text-[#868993] hover:text-white transition cursor-pointer"
                  title="Move SL wider"
                >
                  -5p
                </button>
                <input
                  type="number"
                  value={slInput}
                  onChange={(e) => setSlInput(e.target.value)}
                  placeholder="Optional"
                  step="0.00001"
                  className="h-7 flex-1 rounded border border-red-500/30 bg-[var(--surface-panel)] px-2 text-right font-mono text-[11px] font-bold text-[#f23645] outline-none focus:border-[#f23645]"
                />
                <button
                  onClick={() => handleNudge('sl', -5)}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border-panel-strong)] bg-[var(--surface-chip)] text-[10px] font-mono font-bold text-[#868993] hover:text-white transition cursor-pointer"
                  title="Move SL tighter"
                >
                  +5p
                </button>
              </div>
              {/* Presets */}
              <div className="mt-1 flex gap-1">
                {[10, 15, 25, 50].map((p) => (
                  <button
                    key={p}
                    onClick={() => handleApplyPreset('sl', p)}
                    className="flex-1 rounded border border-[var(--border-panel-strong)] bg-[var(--surface-chip)] py-0.5 font-mono text-[9px] text-[#868993] hover:border-red-500/50 hover:text-[#f23645] transition cursor-pointer"
                  >
                    {p}p
                  </button>
                ))}
              </div>
            </div>

            {/* Take Profit Field */}
            <div className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] p-2">
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-[#089981]">
                <span>TAKE PROFIT</span>
                <span className="font-mono text-[9px] text-[#868993]">
                  {tpInput ? `${Math.abs((Number(tpInput) - entry) / pipSize).toFixed(1)} pips` : 'None'}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handleNudge('tp', -5)}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border-panel-strong)] bg-[var(--surface-chip)] text-[10px] font-mono font-bold text-[#868993] hover:text-white transition cursor-pointer"
                >
                  -5p
                </button>
                <input
                  type="number"
                  value={tpInput}
                  onChange={(e) => setTpInput(e.target.value)}
                  placeholder="Optional"
                  step="0.00001"
                  className="h-7 flex-1 rounded border border-emerald-500/30 bg-[var(--surface-panel)] px-2 text-right font-mono text-[11px] font-bold text-[#089981] outline-none focus:border-[#089981]"
                />
                <button
                  onClick={() => handleNudge('tp', 5)}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border-panel-strong)] bg-[var(--surface-chip)] text-[10px] font-mono font-bold text-[#868993] hover:text-white transition cursor-pointer"
                >
                  +5p
                </button>
              </div>
              {/* Presets */}
              <div className="mt-1 flex gap-1">
                {[15, 30, 50, 100].map((p) => (
                  <button
                    key={p}
                    onClick={() => handleApplyPreset('tp', p)}
                    className="flex-1 rounded border border-[var(--border-panel-strong)] bg-[var(--surface-chip)] py-0.5 font-mono text-[9px] text-[#868993] hover:border-emerald-500/50 hover:text-[#089981] transition cursor-pointer"
                  >
                    {p}p
                  </button>
                ))}
              </div>
            </div>

            {/* Edit Action Buttons */}
            <div className="flex space-x-2 border-t border-[var(--border-panel)] pt-2">
              <button
                onClick={() => setIsEditing(false)}
                className="rounded-lg border border-[var(--border-panel-strong)] bg-[var(--surface-chip)] px-3 py-1.5 text-[11px] font-bold text-[#868993] hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                onClick={handleSave}
                className="flex-1 rounded-lg bg-[var(--accent-1)] py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--accent-contrast)] hover:bg-[var(--accent-1)]/90 transition shadow-md cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
