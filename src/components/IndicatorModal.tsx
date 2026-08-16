import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, Settings, Check, Plus, Trash2 } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore';
import indicatorsList from '../indicatorsList.json';
import { IndicatorSettingsModal } from './IndicatorSettingsModal';

interface IndicatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'trend', label: 'Trend' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'volatility', label: 'Volatility' },
  { id: 'volume', label: 'Volume' },
];

interface IndicatorRegistryEntryLike {
  id?: string;
  shortName?: string;
  category?: string;
}

export const IndicatorModal: React.FC<IndicatorModalProps> = ({ isOpen, onClose }) => {
  const { addIndicator, currentSessionId, sessions, removeIndicator } = useSimulatorStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [availableIndicatorIds, setAvailableIndicatorIds] = useState<Set<string>>(new Set());
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [settingsIndicatorId, setSettingsIndicatorId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    import('lightweight-charts-indicators').then((module) => {
      const registry = (module as unknown as { indicatorRegistry?: IndicatorRegistryEntryLike[] }).indicatorRegistry;
      if (registry) {
        const ids = new Set<string>();
        const catMap: Record<string, string> = {};
        registry.forEach((entry) => {
          if (!entry.id) return;
          ids.add(entry.id);
          if (entry.shortName) {
            ids.add(entry.shortName.toUpperCase());
            ids.add(entry.shortName.toLowerCase());
          }
          if (entry.id) {
            catMap[entry.id.toLowerCase()] = entry.category?.toLowerCase() || 'trend';
          }
        });
        Object.keys(module).forEach(key => {
          if (typeof module[key] === 'object' && module[key]?.calculate) {
            ids.add(key.toUpperCase());
            ids.add(key.toLowerCase());
          }
        });
        setAvailableIndicatorIds(ids);
        setCategoryMap(catMap);
      }
    }).catch(console.error);
  }, [isOpen]);

  const session = sessions.find(s => s.id === currentSessionId);
  const activeIndicators = session?.indicators || [];

  const filteredIndicators = useMemo(() => {
    let list = indicatorsList;
    if (availableIndicatorIds.size > 0) {
      list = list.filter(ind => 
        availableIndicatorIds.has(ind.id) ||
        availableIndicatorIds.has(ind.id.toUpperCase()) ||
        availableIndicatorIds.has(ind.id.toLowerCase()) ||
        availableIndicatorIds.has(ind.shortTitle) ||
        availableIndicatorIds.has(ind.shortTitle?.toUpperCase()) ||
        availableIndicatorIds.has(ind.shortTitle?.toLowerCase())
      );
    }
    
    if (category !== 'all') {
      list = list.filter(ind => {
        const indCategory = categoryMap[ind.id.toLowerCase()] || 'trend';
        return indCategory === category || indCategory.includes(category);
      });
    }
    
    if (!searchQuery) return list;
    const lowerQuery = searchQuery.toLowerCase();
    return list.filter(
      ind => 
        ind.title.toLowerCase().includes(lowerQuery) || 
        ind.shortTitle.toLowerCase().includes(lowerQuery)
    );
  }, [searchQuery, availableIndicatorIds, category, categoryMap]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-[var(--app-bg)]/80 flex items-center justify-center z-50">
        <div className="bg-[var(--app-bg)] border border-[var(--border-soft)] w-full max-w-3xl flex flex-col h-[75vh] rounded-xl shadow-lg">
          <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border-soft)] shrink-0">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">Indicators</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Browse and manage technical analysis tools</p>
            </div>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)] transition">
              <X size={16} />
            </button>
          </div>

          <div className="px-5 py-3 border-b border-[var(--border-soft)] shrink-0 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name or symbol..."
                className="w-full bg-[var(--surface-1)] border border-[var(--border-soft)] rounded-lg py-2 pl-9 pr-4 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)] transition-colors placeholder:text-[var(--text-muted)]"
              />
            </div>
            
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    category === cat.id
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-1)] border border-[var(--border-strong)]'
                      : 'text-[var(--text-muted)] border border-transparent hover:text-[var(--text-secondary)] hover:bg-[var(--surface-1)]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex">
            <div className="w-2/5 border-r border-[var(--border-soft)] flex flex-col">
              <div className="px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--border-soft)]">
                Active ({activeIndicators.length})
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {activeIndicators.map(ind => (
                  <div key={ind.id} className="group flex items-center gap-1.5 rounded-lg px-3 py-2 border border-transparent hover:border-[var(--border-soft)] hover:bg-[var(--surface-1)] transition">
                    <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{ind.name}</span>
                    <button 
                      onClick={() => setSettingsIndicatorId(ind.id)}
                      className="opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--accent-1)] hover:bg-[var(--surface-2)] transition"
                      title="Settings"
                    >
                      <Settings size={13} />
                    </button>
                    <button 
                      onClick={() => removeIndicator(ind.id)}
                      className="opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--negative)] hover:bg-[var(--surface-2)] transition"
                      title="Remove"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {activeIndicators.length === 0 && (
                  <div className="text-xs text-[var(--text-muted)] p-4 text-center">
                    No active indicators
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <div className="px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--border-soft)]">
                Available ({filteredIndicators.length})
              </div>
              <div className="flex-1 overflow-y-auto p-1">
                {filteredIndicators.map(ind => {
                  const isActive = activeIndicators.some(a => a.id === ind.id);
                  return (
                    <button
                      key={ind.id}
                      onClick={() => !isActive && addIndicator(ind.id, ind.title)}
                      disabled={isActive}
                      className={`w-full text-left rounded-lg px-3 py-2.5 flex items-center justify-between transition-colors group ${
                        isActive 
                          ? 'opacity-40 cursor-not-allowed' 
                          : 'hover:bg-[var(--surface-1)] cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[var(--text-primary)] truncate">{ind.title}</div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{ind.shortTitle}</div>
                      </div>
                      {isActive ? (
                        <span className="flex items-center gap-1 text-[11px] text-[var(--positive)] shrink-0">
                          <Check size={12} />
                          Active
                        </span>
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] opacity-0 group-hover:opacity-100 group-hover:text-[var(--accent-1)] transition shrink-0">
                          <Plus size={14} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {settingsIndicatorId && (
        <IndicatorSettingsModal
          indicatorId={settingsIndicatorId}
          isOpen={true}
          onClose={() => setSettingsIndicatorId(null)}
        />
      )}
    </>
  );
};
