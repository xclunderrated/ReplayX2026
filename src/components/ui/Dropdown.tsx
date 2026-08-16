import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';

interface DropdownProps<T> {
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
  className?: string;
  align?: 'left' | 'right' | 'center';
  renderValue?: (value: T) => React.ReactNode;
}

export function Dropdown<T extends string | number>({ 
  value, 
  options, 
  onChange, 
  className = '', 
  align = 'left',
  renderValue
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const alignmentClasses = {
    left: 'left-0',
    right: 'right-0',
    center: 'left-1/2 -translate-x-1/2'
  };

  const selectedOption = options.find(o => o.value === value) || options[0];

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 px-3 h-8 rounded-md border border-[var(--border-soft)] bg-[var(--app-bg)] hover:bg-[var(--surface-1)] transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--accent-1)] text-sm text-[var(--text-primary)] min-w-[60px]"
      >
        <span>{renderValue ? renderValue(value) : selectedOption?.label}</span>
        <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`absolute top-full mt-1 py-1 bg-[var(--app-bg)] border border-[var(--border-soft)] rounded-lg shadow-md z-50 min-w-full max-h-60 overflow-y-auto ${alignmentClasses[align]}`}
          >
            {options.map((option) => (
              <button
                key={String(option.value)}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface-1)] ${
                  value === option.value ? 'text-[var(--accent-1)] bg-[var(--surface-1)]' : 'text-[var(--text-primary)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
