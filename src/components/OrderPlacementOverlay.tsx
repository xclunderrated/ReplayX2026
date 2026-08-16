import React, { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSimulatorStore, type OrderDraft } from '../store/useSimulatorStore';
import {
  getCurrentSessionPrice,
  getOrderDraftMetrics,
  validateOrderDraft,
  getPipSize,
  formatTradePrice,
  getOrderReferencePrice,
} from '../lib/orders';
import {
  X,
  Check,
  Minus,
  Plus,
  CheckSquare,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const OrderPlacementOverlay: React.FC = () => {
  const {
    orderDraft,
    session,
    activeStrategyId,
    strategies,
    setActiveStrategy,
    addChecklistItem,
    checkAllSessionChecklistItems,
    clearSessionChecklistItems,
    updateOrderDraft,
    confirmOrderDraft,
    cancelOrderDraft,
    toggleSessionChecklistItem,
  } = useSimulatorStore(useShallow((state) => ({
    orderDraft: state.orderDraft,
    session: state.sessions.find((s) => s.id === state.currentSessionId) || null,
    activeStrategyId: state.activeStrategyId,
    strategies: state.strategies,
    setActiveStrategy: state.setActiveStrategy,
    addChecklistItem: state.addChecklistItem,
    checkAllSessionChecklistItems: state.checkAllSessionChecklistItems,
    clearSessionChecklistItems: state.clearSessionChecklistItems,
    updateOrderDraft: state.updateOrderDraft,
    confirmOrderDraft: state.confirmOrderDraft,
    cancelOrderDraft: state.cancelOrderDraft,
    toggleSessionChecklistItem: state.toggleSessionChecklistItem,
  })));

  const [showChecklist, setShowChecklist] = useState(false);
  const [newRuleText, setNewRuleText] = useState('');
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [newRuleRequired, setNewRuleRequired] = useState(true);

  const activeStrategy = strategies.find((s) => s.id === activeStrategyId) || strategies[0];
  const checklists = activeStrategy?.checklists || [];
  const checkedItems = session?.checklistCheckedItems || {};
  const mandatoryItems = checklists.filter((item) => item.isRequired);
  const uncheckedMandatoryItems = mandatoryItems.filter((item) => !checkedItems[item.id]);
  const allMandatoryChecked = uncheckedMandatoryItems.length === 0;
  const currentPrice = session ? getCurrentSessionPrice(session) : undefined;

  const totalCheckedCount = checklists.filter((item) => checkedItems[item.id]).length;

  const metrics = orderDraft && session
    ? getOrderDraftMetrics(orderDraft, session.balance, session.instrument, currentPrice)
    : null;

  const validation = orderDraft
    ? validateOrderDraft(orderDraft, currentPrice)
    : { errors: [], warnings: [], canSubmit: false };

  const isBuy = orderDraft?.type === 'buy';
  const canConfirm = Boolean(validation.canSubmit && allMandatoryChecked);

  useEffect(() => {
    if (!orderDraft || !session) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if (e.key === 'Escape') {
        e.preventDefault();
        cancelOrderDraft();
      }
      if (e.key === 'Enter' && canConfirm && !isInput) {
        e.preventDefault();
        confirmOrderDraft();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canConfirm, cancelOrderDraft, confirmOrderDraft, orderDraft, session]);

  if (!orderDraft || !session || !metrics) return null;

  const pipSize = getPipSize(session.instrument);

  const setField = <K extends 'entryPrice' | 'sl' | 'tp' | 'riskValue'>(
    field: K,
    value: NonNullable<OrderDraft>[K] | undefined,
  ) => updateOrderDraft({ [field]: value } as Pick<NonNullable<OrderDraft>, K>);

  const handleNumericInput = (field: 'entryPrice' | 'sl' | 'tp' | 'riskValue', raw: string) => {
    if (raw.trim() === '') {
      setField(field, undefined);
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) {
      setField(field, n as NonNullable<OrderDraft>[typeof field]);
    }
  };

  const nudge = (field: 'entryPrice' | 'sl' | 'tp', pipsDelta: number) => {
    const base = orderDraft[field] ?? getOrderReferencePrice(orderDraft, currentPrice);
    if (base) {
      setField(field, Number((base + pipsDelta * pipSize).toFixed(5)));
    }
  };

  const handleAddNewRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleText.trim() || !activeStrategy) return;
    addChecklistItem(activeStrategy.id, {
      text: newRuleText.trim(),
      isRequired: newRuleRequired,
    });
    setNewRuleText('');
    setIsAddingRule(false);
  };

  const handleCheckAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (checklists.length > 0) {
      checkAllSessionChecklistItems(checklists.map((c) => c.id));
    }
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearSessionChecklistItems();
  };

  const quickRiskPercentages = [0.5, 1.0, 2.0];
  const quickRiskDollars = [50, 100, 250];

  return (
    <div
      id="tradingview-order-ticket"
      className="absolute left-3 bottom-3 z-40 w-[260px] select-none rounded-xl border border-[var(--border-soft)] bg-[#0e121b]/95 p-3 text-[#d1d4dc] shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150 font-sans"
    >
      {/* ── 1. Header: Minimal Side Switcher & Live Close ── */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center rounded-lg bg-[#141824] p-0.5 border border-[#1f2433] flex-1">
          <button
            type="button"
            onClick={() => updateOrderDraft({ type: 'buy' })}
            className={`flex-1 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition cursor-pointer text-center ${
              isBuy
                ? 'bg-[#089981] text-white shadow-xs'
                : 'text-[#868993] hover:text-white'
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => updateOrderDraft({ type: 'sell' })}
            className={`flex-1 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition cursor-pointer text-center ${
              !isBuy
                ? 'bg-[#f23645] text-white shadow-xs'
                : 'text-[#868993] hover:text-white'
            }`}
          >
            Sell
          </button>
        </div>

        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] text-[#868993] px-1">
            {formatTradePrice(currentPrice ?? 0)}
          </span>
          <button
            type="button"
            onClick={cancelOrderDraft}
            className="rounded-lg p-1 text-[#868993] hover:bg-[#1f2433] hover:text-white transition cursor-pointer"
            title="Cancel Order (Esc)"
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ── 2. Order Type (Market | Limit | Stop) ── */}
      <div className="mb-2.5 grid grid-cols-3 gap-1 rounded-lg bg-[#141824] p-0.5 border border-[#1f2433]">
        {(['market', 'limit', 'stop'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => updateOrderDraft({ orderType: t })}
            className={`py-0.8 rounded-md text-[9px] font-semibold uppercase transition cursor-pointer ${
              orderDraft.orderType === t
                ? 'bg-[#2962ff] text-white shadow-xs font-bold'
                : 'text-[#868993] hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── 3. Limit/Stop Entry Price Field (if not market) ── */}
      {orderDraft.orderType !== 'market' && (
        <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg bg-[#141824] px-2 py-1 border border-[#1f2433]">
          <span className="text-[9px] font-semibold uppercase text-[#868993]">Entry</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => nudge('entryPrice', -5)}
              className="flex h-4 w-4 items-center justify-center rounded text-[#868993] hover:bg-[#1f2433] hover:text-white transition cursor-pointer"
              title="-5 pips"
            >
              <Minus size={9} strokeWidth={2.5} />
            </button>
            <input
              type="number"
              value={orderDraft.entryPrice}
              onChange={(e) => handleNumericInput('entryPrice', e.target.value)}
              step="0.00001"
              min="0"
              className="w-16 bg-transparent text-right font-mono text-[11px] font-bold text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => nudge('entryPrice', 5)}
              className="flex h-4 w-4 items-center justify-center rounded text-[#868993] hover:bg-[#1f2433] hover:text-white transition cursor-pointer"
              title="+5 pips"
            >
              <Plus size={9} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {/* ── 4. Risk Sizing Controls ── */}
      <div className="mb-2.5 flex items-center justify-between gap-1.5 rounded-lg bg-[#141824] p-1.5 border border-[#1f2433]">
        <div className="flex items-center gap-1">
          <div className="flex rounded bg-[#0c0e15] p-0.5 border border-[#1f2433]">
            <button
              type="button"
              onClick={() => updateOrderDraft({ riskType: 'percent' })}
              className={`px-1.5 py-0.2 rounded text-[8px] font-bold transition cursor-pointer ${
                orderDraft.riskType === 'percent'
                  ? 'bg-[#2962ff] text-white'
                  : 'text-[#868993] hover:text-white'
              }`}
            >
              %
            </button>
            <button
              type="button"
              onClick={() => updateOrderDraft({ riskType: 'dollar' })}
              className={`px-1.5 py-0.2 rounded text-[8px] font-bold transition cursor-pointer ${
                orderDraft.riskType === 'dollar'
                  ? 'bg-[#2962ff] text-white'
                  : 'text-[#868993] hover:text-white'
              }`}
            >
              $
            </button>
          </div>
          <input
            type="number"
            value={orderDraft.riskValue}
            onChange={(e) => handleNumericInput('riskValue', e.target.value)}
            step={orderDraft.riskType === 'percent' ? '0.25' : '10'}
            min="0.01"
            className="w-12 bg-transparent px-1 font-mono text-[11px] font-bold text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        <div className="flex gap-1">
          {(orderDraft.riskType === 'percent' ? quickRiskPercentages : quickRiskDollars).map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => updateOrderDraft({ riskValue: val })}
              className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-medium transition cursor-pointer ${
                orderDraft.riskValue === val
                  ? 'bg-[#2962ff]/25 text-[#3b82f6] font-bold border border-[#2962ff]/40'
                  : 'bg-[#1a1f2e] text-[#868993] hover:text-white'
              }`}
            >
              {orderDraft.riskType === 'percent' ? `${val}%` : `$${val}`}
            </button>
          ))}
        </div>
      </div>

      {/* ── 5. Minimal Metrics Strip ── */}
      <div className="mb-2.5 grid grid-cols-4 gap-1 rounded-lg bg-[#141824] p-1.5 font-mono text-center border border-[#1f2433]">
        <div className="flex flex-col">
          <span className="text-[8px] uppercase font-sans text-[#868993]">Size</span>
          <span className="text-[10px] font-bold text-white">{metrics.estimatedSize.toFixed(2)}L</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] uppercase font-sans text-[#868993]">Risk</span>
          <span className="text-[10px] font-bold text-[#f23645]">-${Math.abs(metrics.estimatedLoss).toFixed(0)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] uppercase font-sans text-[#868993]">Gain</span>
          <span className="text-[10px] font-bold text-[#089981]">
            {metrics.estimatedGain > 0 ? `+$${metrics.estimatedGain.toFixed(0)}` : '--'}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] uppercase font-sans text-[#868993]">R:R</span>
          <span className="text-[10px] font-bold text-[#3b82f6]">
            {metrics.riskRewardRatio !== null ? `${metrics.riskRewardRatio.toFixed(2)}R` : '--'}
          </span>
        </div>
      </div>

      {/* ── 6. Checklists Discipline (Minimal Accordion) ── */}
      {checklists.length > 0 && (
        <div className="mb-2.5 rounded-lg bg-[#141824] p-1.5 border border-[#1f2433]">
          <div
            onClick={() => setShowChecklist(!showChecklist)}
            className="flex items-center justify-between cursor-pointer py-0.5"
          >
            <div className="flex items-center gap-1.5">
              <CheckSquare
                size={11}
                className={allMandatoryChecked ? 'text-[#089981]' : 'text-amber-400'}
              />
              <span className="text-[9px] font-semibold text-[#d1d4dc]">
                {allMandatoryChecked
                  ? `Rules Verified (${totalCheckedCount}/${checklists.length})`
                  : `${uncheckedMandatoryItems.length} Rule(s) Pending`}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {!allMandatoryChecked && (
                <button
                  type="button"
                  onClick={handleCheckAll}
                  className="text-[8px] text-[#2962ff] hover:underline font-semibold"
                >
                  Check All
                </button>
              )}
              {showChecklist ? <ChevronUp size={10} className="text-[#868993]" /> : <ChevronDown size={10} className="text-[#868993]" />}
            </div>
          </div>

          {/* Checklist Expanded Panel */}
          {showChecklist && (
            <div className="pt-2 space-y-1.5 border-t border-[#1f2433] mt-1.5">
              <div className="max-h-28 overflow-y-auto space-y-1 pr-0.5">
                {checklists.map((item) => {
                  const isChecked = Boolean(checkedItems[item.id]);
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleSessionChecklistItem(item.id)}
                      className={`group flex items-start gap-1.5 rounded p-1 text-[9px] transition cursor-pointer ${
                        isChecked
                          ? 'bg-[#089981]/10 text-white'
                          : 'bg-[#0e121b] hover:bg-[#1a1f2e] text-[#868993]'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isChecked ? (
                          <div className="flex h-2.5 w-2.5 items-center justify-center rounded bg-[#089981] text-white">
                            <Check size={7} strokeWidth={3} />
                          </div>
                        ) : (
                          <div
                            className={`h-2.5 w-2.5 rounded border ${
                              item.isRequired ? 'border-amber-400/80 bg-[#0c0e15]' : 'border-[#2a2e39] bg-[#0c0e15]'
                            }`}
                          />
                        )}
                      </div>

                      <div className="flex-1 leading-tight select-none">
                        <span className={isChecked ? 'line-through text-[#868993]' : 'font-medium'}>
                          {item.text}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 7. Validation Errors ── */}
      {validation.errors.length > 0 && (
        <div className="mb-2 rounded bg-red-500/10 p-1.5 text-[9px] text-red-400 font-medium border border-red-500/20">
          <div className="flex items-center gap-1 font-bold">
            <ShieldAlert size={10} />
            <span>{validation.errors[0]}</span>
          </div>
        </div>
      )}

      {/* ── 8. Clean Action Button: Confirm ── */}
      <button
        type="button"
        onClick={() => {
          if (!allMandatoryChecked) {
            setShowChecklist(true);
          } else {
            confirmOrderDraft();
          }
        }}
        disabled={!canConfirm && allMandatoryChecked}
        className={`w-full py-2 rounded-lg font-bold text-[11px] uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md ${
          canConfirm
            ? isBuy
              ? 'bg-[#089981] hover:bg-[#089981]/90 text-white active:scale-[0.99]'
              : 'bg-[#f23645] hover:bg-[#f23645]/90 text-white active:scale-[0.99]'
            : !allMandatoryChecked
            ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
            : 'bg-[#1a1f2e] text-[#868993] cursor-not-allowed border border-[#1f2433]'
        }`}
      >
        {canConfirm ? (
          <>
            <Check size={12} strokeWidth={3} />
            <span>
              {orderDraft.orderType === 'market'
                ? `${orderDraft.type.toUpperCase()} ${metrics.estimatedSize.toFixed(2)} Lots`
                : `${orderDraft.orderType.toUpperCase()} ${metrics.estimatedSize.toFixed(2)} Lots`}
            </span>
          </>
        ) : !allMandatoryChecked ? (
          <span>Verify Checklist ({uncheckedMandatoryItems.length} left)</span>
        ) : (
          <span>Invalid Order Levels</span>
        )}
      </button>
    </div>
  );
};
