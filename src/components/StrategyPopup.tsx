import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { useShallow } from 'zustand/react/shallow';
import { X, Check } from 'lucide-react';

interface StrategyPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StrategyPopup: React.FC<StrategyPopupProps> = ({ isOpen, onClose }) => {
  const { session, strategies, activeStrategyId, toggleSessionChecklistItem } = useSimulatorStore(useShallow((state) => ({
    session: state.sessions.find(s => s.id === state.currentSessionId) || null,
    strategies: state.strategies,
    activeStrategyId: state.activeStrategyId,
    toggleSessionChecklistItem: state.toggleSessionChecklistItem,
  })));

  const activeStrategy = strategies.find(s => s.id === activeStrategyId);

  if (!isOpen || !activeStrategy) return null;

  const checklists = activeStrategy.checklists || [];
  const checkedItems = session?.checklistCheckedItems || {};

  return (
    <AnimatePresence>
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0}
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ duration: 0.15 }}
        className="absolute top-16 right-4 z-50 w-80 rounded-lg border border-[var(--border-soft)] bg-[var(--app-bg)] shadow-lg overflow-hidden"
        style={{ cursor: 'grab' }}
        whileDrag={{ cursor: 'grabbing' }}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] bg-[var(--surface-1)] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text-primary)]">{activeStrategy.name}</span>
            <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded bg-[var(--accent-soft)] text-[var(--accent-1)]">Checklist</span>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }} 
            onPointerDown={(e) => e.stopPropagation()}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] transition"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-2 max-h-[60vh] overflow-y-auto" onPointerDown={(e) => e.stopPropagation()}>
          {checklists.length === 0 ? (
            <div className="text-center text-[var(--text-muted)] py-6 text-xs">
              No rules defined for this strategy
            </div>
          ) : (
            <div className="space-y-0.5">
              {checklists.map(item => {
                const isChecked = !!checkedItems[item.id];
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleSessionChecklistItem(item.id)}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      isChecked ? 'opacity-60' : 'hover:bg-[var(--surface-1)]'
                    }`}
                  >
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      isChecked 
                        ? 'border-[var(--accent-1)] bg-[var(--accent-1)] text-[var(--accent-contrast)]' 
                        : 'border-[var(--border-soft)] bg-[var(--surface-1)]'
                    }`}>
                      {isChecked && <Check size={12} strokeWidth={3} />}
                    </div>
                    <span className={`flex-1 text-sm ${isChecked ? 'text-[var(--text-secondary)] line-through' : 'text-[var(--text-primary)]'}`}>
                      {item.text}
                    </span>
                    {item.isRequired && (
                      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--negative)] border border-[var(--negative)]/30" title="Required Rule">
                        Req
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
