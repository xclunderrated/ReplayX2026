import React, { useState } from 'react';
import { X, Target } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore';

interface CreateStrategyModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateStrategyModal: React.FC<CreateStrategyModalProps> = ({ onClose, onSuccess }) => {
  const addStrategy = useSimulatorStore((state) => state.addStrategy);
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    addStrategy({ name: name.trim(), color: '#9ca3af' });
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-bg)]/80 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-soft)] bg-[var(--app-bg)] shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-soft)]">
          <div className="flex items-center gap-3">
             <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-1)]">
                <Target size={18} strokeWidth={2.5} />
             </div>
             <div>
               <h2 className="text-sm font-semibold text-[var(--text-primary)]">New Strategy</h2>
               <p className="text-xs text-[var(--text-muted)]">Create a new execution checklist</p>
             </div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)] transition">
            <X size={15} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Strategy Name
              </label>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. London Sweep, NY Reversal..."
                className="w-full bg-[var(--surface-1)] border border-[var(--border-soft)] rounded-lg px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)] transition-colors placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>
          
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--accent-soft)] px-5 py-2 text-xs font-semibold text-[var(--accent-1)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--accent-1)]/20 transition-colors"
            >
              Create Strategy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
