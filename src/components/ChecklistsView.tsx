import React, { useState } from 'react';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { useShallow } from 'zustand/react/shallow';
import { ShieldAlert, ShieldCheck, Plus, Trash2 } from 'lucide-react';
import { CreateStrategyModal } from './CreateStrategyModal';

export const ChecklistsView: React.FC = () => {
  const { strategies, activeStrategyId, addStrategy, updateStrategy, deleteStrategy, setActiveStrategy, addChecklistItem, updateChecklistItem, deleteChecklistItem } = useSimulatorStore(useShallow((state) => ({
    strategies: state.strategies,
    activeStrategyId: state.activeStrategyId,
    addStrategy: state.addStrategy,
    updateStrategy: state.updateStrategy,
    deleteStrategy: state.deleteStrategy,
    setActiveStrategy: state.setActiveStrategy,
    addChecklistItem: state.addChecklistItem,
    updateChecklistItem: state.updateChecklistItem,
    deleteChecklistItem: state.deleteChecklistItem,
  })));

  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(activeStrategyId || strategies[0]?.id || null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  
  const selectedStrategy = strategies.find(s => s.id === selectedStrategyId) || strategies[0];

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim() || !selectedStrategy) return;
    addChecklistItem(selectedStrategy.id, { text: newItemText.trim(), isRequired: false });
    setNewItemText('');
  };

  if (strategies.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-transparent text-[var(--text-primary)] p-6 z-10">
        <div className="max-w-md text-center">
          <div className="mb-8 flex h-20 w-20 mx-auto items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] text-[var(--accent-1)]">
            <ShieldCheck size={40} strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-3">Trading Discipline, Enforced.</h2>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)] mb-8">
            Trading with a checklist removes emotion and enforces consistency. Define your setup rules, and AuraEngine will physically prevent you from taking impulsive trades that don't meet your criteria.
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg border border-[var(--border-strong)] bg-[var(--accent-soft)] text-[var(--accent-1)] hover:bg-[var(--accent-1)]/20 transition-colors"
          >
            <Plus size={18} strokeWidth={2.5} />
            Create Your First Strategy
          </button>
        </div>
        
        {isCreateModalOpen && (
          <CreateStrategyModal 
            onClose={() => setIsCreateModalOpen(false)} 
            onSuccess={() => {}}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-transparent text-[var(--text-primary)]">
      <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-8 py-4 shrink-0 bg-transparent z-20">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Checklists</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Manage trading strategies and execution rules</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition"
        >
          <Plus size={15} /> New Strategy
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 flex flex-col border-r border-[var(--border-soft)] bg-[var(--surface-1)] z-10 shrink-0">
          <div className="px-4 py-3 border-b border-[var(--border-soft)]">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Strategies</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {strategies.map(strategy => {
              const isActive = activeStrategyId === strategy.id;
              const isSelected = selectedStrategy?.id === strategy.id;
              
              return (
                <div 
                  key={strategy.id} 
                  onClick={() => setSelectedStrategyId(strategy.id)}
                  className={`group relative flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors ${isSelected ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]'}`}
                >
                  <div className="flex items-center gap-2.5 truncate pr-6">
                    {isActive ? (
                      <div className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent-1)] opacity-40"></span>
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent-1)]"></span>
                      </div>
                    ) : (
                      <div className="h-1.5 w-1.5 rounded-full shrink-0 bg-[var(--text-muted)]" />
                    )}
                    <span className={`text-sm truncate ${isSelected ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                      {strategy.name}
                    </span>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete ${strategy.name}?`)) {
                        deleteStrategy(strategy.id);
                        if (isSelected) setSelectedStrategyId(null);
                      }
                    }}
                    className="absolute right-1 opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--negative)] hover:bg-[var(--surface-3)] transition"
                    title="Delete strategy"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-transparent relative">
          {selectedStrategy ? (
            <div className="relative flex-1 flex flex-col z-10 h-full overflow-hidden">
              <div className="border-b border-[var(--border-soft)] px-8 py-6 bg-[var(--surface-1)] flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-3 mb-1.5">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">
                      {selectedStrategy.name}
                    </h2>
                    {activeStrategyId === selectedStrategy.id && (
                      <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-[var(--accent-soft)] rounded-full text-[11px] font-semibold text-[var(--accent-1)] border border-[var(--border-strong)]">
                        <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent-1)]" />
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {selectedStrategy.checklists.length} trading rule{selectedStrategy.checklists.length !== 1 ? 's' : ''} configured
                  </p>
                </div>
                
                <button
                  onClick={() => setActiveStrategy(activeStrategyId === selectedStrategy.id ? null : selectedStrategy.id)}
                  className={
                    activeStrategyId === selectedStrategy.id 
                      ? 'rounded-lg border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:border-[var(--negative)] hover:text-[var(--negative)] transition-colors' 
                      : 'rounded-lg border border-[var(--border-strong)] bg-[var(--accent-soft)] px-4 py-2 text-xs font-semibold text-[var(--accent-1)] hover:bg-[var(--accent-1)]/20 transition-colors'
                  }
                >
                  {activeStrategyId === selectedStrategy.id ? 'Deactivate' : 'Set as Active'}
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto px-8 py-6">
                <div className="max-w-3xl mx-auto space-y-6 pb-8">
                  <div className="flex items-start gap-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-1)] p-4">
                    <div className="shrink-0 text-[var(--accent-1)] mt-0.5">
                      <ShieldAlert size={18} strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="mb-0.5 font-semibold text-[var(--text-primary)] text-sm">Discipline Enforcer</h3>
                      <p className="leading-relaxed text-[var(--text-secondary)] text-xs">
                        Rules marked as <strong className="font-semibold text-[var(--accent-1)]">Required</strong> will block order placement until completed.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {selectedStrategy.checklists.map(item => (
                      <div key={item.id} className="group flex items-center gap-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-3 transition-colors hover:border-[var(--border-strong)]">
                        <input
                          type="text"
                          value={item.text}
                          onChange={(e) => updateChecklistItem(selectedStrategy.id, item.id, { text: e.target.value })}
                          placeholder="Describe your setup rule..."
                          className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-primary)] focus:ring-0 px-0 placeholder-[var(--text-muted)]"
                        />
                        <div className="flex items-center gap-2 pl-3 border-l border-[var(--border-soft)] shrink-0">
                          <button
                            onClick={() => updateChecklistItem(selectedStrategy.id, item.id, { isRequired: !item.isRequired })}
                            className="flex items-center gap-1.5 text-xs font-medium focus:outline-none"
                            title={item.isRequired ? "Mark as Optional" : "Mark as Required"}
                          >
                            <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${item.isRequired ? 'bg-[var(--accent-1)]' : 'bg-[var(--surface-3)] border border-[var(--border-soft)]'}`}>
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${item.isRequired ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                            </div>
                            <span className={`w-[52px] text-left text-xs transition-colors ${item.isRequired ? 'text-[var(--accent-1)] font-medium' : 'text-[var(--text-muted)]'}`}>
                              {item.isRequired ? 'Required' : 'Optional'}
                            </span>
                          </button>

                          <button
                            onClick={() => deleteChecklistItem(selectedStrategy.id, item.id)}
                            className="opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--negative)] hover:bg-[var(--surface-2)] transition"
                            title="Delete rule"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    <form onSubmit={handleAddItem} className="flex gap-2 pt-4">
                      <input
                        type="text"
                        value={newItemText}
                        onChange={(e) => setNewItemText(e.target.value)}
                        placeholder="Add a new trading rule..."
                        className="flex-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)] transition-colors placeholder:text-[var(--text-muted)]"
                      />
                      <button
                        type="submit"
                        disabled={!newItemText.trim()}
                        className="flex items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--accent-soft)] px-5 py-2.5 text-xs font-semibold text-[var(--accent-1)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--accent-1)]/20 transition-colors shrink-0"
                      >
                        Add Rule
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      
      {isCreateModalOpen && (
        <CreateStrategyModal 
          onClose={() => setIsCreateModalOpen(false)} 
          onSuccess={() => {}}
        />
      )}
    </div>
  );
};
