import React, { useState, useEffect } from 'react';
import { X, Settings } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore';

interface IndicatorSettingsModalProps {
  indicatorId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface InputConfig {
  name: string;
  type: string;
  default: string | number | boolean | null;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string | number | boolean }[];
}

type IndicatorOptionValue = string | number | boolean | null;

interface IndicatorRegistryEntryLike {
  id?: string;
  shortName?: string;
  inputConfig?: InputConfig[];
}

export const IndicatorSettingsModal: React.FC<IndicatorSettingsModalProps> = ({
  indicatorId,
  isOpen,
  onClose,
}) => {
  const { currentSessionId, sessions, updateIndicator } = useSimulatorStore();
  const [inputConfig, setInputConfig] = useState<InputConfig[]>([]);
  const [formValues, setFormValues] = useState<Record<string, IndicatorOptionValue>>({});
  const [loading, setLoading] = useState(true);

  const session = sessions.find(s => s.id === currentSessionId);
  const indicator = session?.indicators.find(i => i.id === indicatorId);

  useEffect(() => {
    if (!isOpen || !indicatorId) return;

    setLoading(true);
    import('lightweight-charts-indicators')
      .then((module) => {
        const registry = (module as unknown as { indicatorRegistry?: IndicatorRegistryEntryLike[] }).indicatorRegistry;
        if (registry) {
          const lowerId = indicatorId.toLowerCase();
          const entry = registry.find(
            (entryItem) => entryItem.id?.toLowerCase() === lowerId || entryItem.shortName?.toLowerCase() === lowerId
          );
          
          if (entry?.inputConfig) {
            const configs = Array.isArray(entry.inputConfig) ? entry.inputConfig : [];
            setInputConfig(configs);
            
            const defaults: Record<string, IndicatorOptionValue> = {};
            configs.forEach((config) => {
              if (config.name) {
                defaults[config.name] = (indicator?.options?.[config.name] as IndicatorOptionValue | undefined) ?? config.default;
              }
            });
            setFormValues(defaults);
          } else {
            setInputConfig([]);
          }
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load indicator metadata:', err);
        setLoading(false);
      });
  }, [isOpen, indicatorId, indicator?.options]);

  const handleSave = () => {
    updateIndicator(indicatorId, formValues);
    onClose();
  };

  const handleChange = (name: string, value: IndicatorOptionValue) => {
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const parseOptionValue = (config: InputConfig, rawValue: string): IndicatorOptionValue => {
    const matched = config.options?.find((option) => String(option.value) === rawValue);
    if (matched) {
      return matched.value;
    }

    return rawValue;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[var(--app-bg)]/80 flex items-center justify-center z-[60]">
      <div className="bg-[var(--app-bg)] border border-[var(--border-soft)] w-full max-w-md rounded-xl shadow-lg">
        <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border-soft)]">
          <div className="flex items-center gap-2.5">
            <Settings size={16} className="text-[var(--accent-1)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{indicator?.name || indicatorId}</h2>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)] transition">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="text-center text-[var(--text-muted)] py-8 text-sm">Loading settings...</div>
          ) : inputConfig.length === 0 ? (
            <div className="text-center text-[var(--text-muted)] py-8 text-sm">
              No configurable settings available for this indicator.
            </div>
          ) : (
            <div className="space-y-4">
              {inputConfig.filter(c => c.name).map((config, idx) => (
                <div key={config.name || idx}>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    {(config.name || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </label>
                  
                  {config.type === 'number' || config.type === 'integer' ? (
                    <input
                      type="number"
                      value={Number(formValues[config.name] ?? config.default)}
                      onChange={e => handleChange(config.name, parseFloat(e.target.value))}
                      min={config.min}
                      max={config.max}
                      step={config.step || 1}
                      className="w-full bg-[var(--surface-1)] border border-[var(--border-soft)] rounded-lg py-2 px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)] transition-colors"
                    />
                  ) : config.type === 'boolean' ? (
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(formValues[config.name] ?? config.default)}
                        onChange={e => handleChange(config.name, e.target.checked)}
                        className="w-4 h-4 rounded border-[var(--border-soft)] bg-[var(--surface-1)] text-[var(--accent-1)] focus:ring-[var(--accent-1)]"
                      />
                      <span className="text-sm text-[var(--text-muted)]">
                        {Boolean(formValues[config.name] ?? config.default) ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  ) : config.options ? (
                    <select
                      value={String(formValues[config.name] ?? config.default)}
                      onChange={e => handleChange(config.name, parseOptionValue(config, e.target.value))}
                      className="w-full bg-[var(--surface-1)] border border-[var(--border-soft)] rounded-lg py-2 px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)] transition-colors"
                    >
                      {config.options.map((opt) => (
                        <option key={String(opt.value)} value={String(opt.value)}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={String(formValues[config.name] ?? config.default)}
                      onChange={e => handleChange(config.name, e.target.value)}
                      className="w-full bg-[var(--surface-1)] border border-[var(--border-soft)] rounded-lg py-2 px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)] transition-colors"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-[var(--border-soft)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium bg-[var(--accent-1)]/15 text-[var(--accent-1)] border border-[var(--border-strong)] rounded-lg hover:bg-[var(--accent-1)]/25 transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
