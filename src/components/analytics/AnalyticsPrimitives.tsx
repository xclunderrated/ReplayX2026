import React, { useState, useRef } from 'react';
import { HelpCircle } from 'lucide-react';

export function InfoTooltip({ text }: { text: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number; placeAbove: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const placeAbove = rect.top > 140;
    setCoords({
      x: Math.max(140, Math.min(window.innerWidth - 140, rect.left + rect.width / 2)),
      y: placeAbove ? rect.top - 8 : rect.bottom + 8,
      placeAbove,
    });
  };

  const handleMouseEnter = () => {
    updatePosition();
    setIsOpen(true);
  };

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          updatePosition();
          setIsOpen((prev) => !prev);
        }}
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5 rounded-full cursor-help focus:outline-none"
        aria-label="Info"
      >
        <HelpCircle size={12} className="opacity-70 hover:opacity-100" />
      </button>
      {isOpen && coords && (
        <div
          style={{
            position: 'fixed',
            left: `${coords.x}px`,
            top: `${coords.y}px`,
            transform: coords.placeAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            zIndex: 99999,
          }}
          className="w-64 max-w-[280px] rounded-xl border border-[var(--border-panel-strong)] bg-[#18191d] p-3 text-xs font-normal leading-relaxed text-[#f4f4f5] shadow-2xl pointer-events-none"
        >
          {text}
        </div>
      )}
    </span>
  );
}

export function StatCell({
  label,
  value,
  subtext,
  colorClass = 'text-[var(--text-primary)]',
  tooltip,
}: {
  label: string;
  value: string;
  subtext?: string;
  colorClass?: string;
  tooltip?: string;
}) {
  return (
    <div className="flex flex-col justify-center px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
        <span>{label}</span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className={`mt-1.5 text-xl sm:text-2xl font-bold font-mono tracking-tight ${colorClass}`}>
        {value}
      </div>
      {subtext && (
        <div className="mt-1 text-[11px] text-[var(--text-muted)] font-medium truncate">
          {subtext}
        </div>
      )}
    </div>
  );
}

export function MetricBox({
  label,
  value,
  subtext,
  colorClass = 'text-[var(--text-primary)]',
  tooltip,
}: {
  label: string;
  value: string;
  subtext?: string;
  icon?: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  colorClass?: string;
  large?: boolean;
  tooltip?: string;
  badge?: { text: string; colorClass?: string };
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] p-5 transition-all duration-150 hover:border-[var(--border-strong)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className={`mt-2 text-xl font-bold font-mono ${colorClass}`}>
        {value}
      </div>
      {subtext && (
        <div className="mt-1 text-[11px] text-[var(--text-muted)] truncate">{subtext}</div>
      )}
    </div>
  );
}

export function DataBlock({
  title,
  subtitle,
  children,
  className = '',
  noPadding = false,
  headerAction,
  tooltip,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  headerAction?: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <div className={`rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] ${className}`}>
      <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-4 bg-[var(--surface-ghost)] rounded-t-2xl">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">{title}</h3>
            {tooltip && <InfoTooltip text={tooltip} />}
          </div>
          {subtitle && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{subtitle}</p>}
        </div>
        {headerAction && <div className="flex items-center gap-2">{headerAction}</div>}
      </div>
      <div className={noPadding ? '' : 'p-5 sm:p-6'}>{children}</div>
    </div>
  );
}

export function SectionHeader({ title }: { title: string; description?: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{title}</div>
    </div>
  );
}

export type TabItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  count?: number | string;
};

export function TabBar({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-[var(--border-soft)] pb-px scrollbar-none">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-xs font-semibold border-b-2 transition-all duration-150 ${
              isActive
                ? 'border-[var(--accent-1)] text-[var(--text-primary)] font-bold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon size={14} strokeWidth={2} className={isActive ? 'text-[var(--accent-1)]' : 'opacity-60'} />
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isActive ? 'bg-[var(--accent-1)]/15 text-[var(--accent-1)]' : 'text-[var(--text-muted)]'}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function MiniStat({
  label,
  value,
  colorClass = 'text-[var(--text-primary)]',
  tooltip,
}: {
  label: string;
  value: string;
  colorClass?: string;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--border-soft)] last:border-0 text-xs">
      <span className="text-[var(--text-muted)] flex items-center gap-1.5 text-[11px]">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
      <span className={`font-semibold font-mono ${colorClass}`}>{value}</span>
    </div>
  );
}

export function GradeBadge({ grade, reason }: { grade: string | null; reason?: string }) {
  const colorMap: Record<string, string> = {
    A: 'bg-[#089981]/15 text-[#089981] border-[#089981]/30',
    B: 'bg-[#2962ff]/15 text-[#2962ff] border-[#2962ff]/30',
    C: 'bg-[#eab308]/15 text-[#eab308] border-[#eab308]/30',
    D: 'bg-[var(--accent-1)]/15 text-[var(--accent-1)] border-[var(--accent-1)]/30',
    F: 'bg-[#f23645]/15 text-[#f23645] border-[#f23645]/30',
  };
  const isGraded = grade !== null && colorMap[grade] !== undefined;
  const style = isGraded
    ? colorMap[grade]
    : 'bg-[var(--surface-ghost)] text-[var(--text-muted)] border-[var(--border-soft)]';
  return (
    <span
      title={reason}
      className={`inline-flex items-center justify-center h-5 w-5 rounded text-[10px] font-bold border cursor-help ${style}`}
    >
      {isGraded ? grade : '–'}
    </span>
  );
}

export function HeatmapCell({
  value,
  maxAbs,
  label,
  sublabel,
}: {
  value: number;
  maxAbs: number;
  label?: string;
  sublabel?: string;
}) {
  const intensity = maxAbs > 0 ? Math.min(1, Math.abs(value) / maxAbs) : 0;
  const isPositive = value >= 0;
  const bg = value === 0
    ? 'var(--surface-ghost)'
    : isPositive
      ? `rgba(8,153,129,${0.08 + intensity * 0.45})`
      : `rgba(242,54,69,${0.08 + intensity * 0.45})`;

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[48px] rounded-xl p-1 text-center transition-all duration-150 hover:scale-[1.02] cursor-default border border-[var(--border-soft)]"
      style={{ background: bg }}
    >
      {label && (
        <div className={`text-[10px] font-medium ${isPositive ? 'text-[#089981]' : value === 0 ? 'text-[var(--text-muted)]' : 'text-[#f23645]'}`}>
          {label}
        </div>
      )}
      {sublabel && <div className="text-[11px] font-semibold text-[var(--text-primary)] font-mono tracking-tight">{sublabel}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  colorClass = 'bg-[var(--accent-1)]',
  height = 4,
}: {
  value: number;
  max?: number;
  colorClass?: string;
  height?: number;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full rounded-full bg-[var(--surface-3)] overflow-hidden" style={{ height }}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ScoreGauge({
  score,
  label,
  description,
}: {
  score: number;
  label: string;
  description: string;
}) {
  const color = score >= 70 ? '#089981' : score >= 40 ? '#eab308' : '#f23645';
  return (
    <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] p-5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">{label}</div>
      <div className="flex items-end gap-1.5">
        <span className="text-3xl font-bold font-mono" style={{ color }}>{Math.round(score)}</span>
        <span className="text-xs text-[var(--text-muted)] mb-1">/ 100</span>
      </div>
      <div className="mt-3">
        <ProgressBar value={score} colorClass={score >= 70 ? 'bg-[#089981]' : score >= 40 ? 'bg-[#eab308]' : 'bg-[#f23645]'} height={5} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">{description}</p>
    </div>
  );
}
