import React from 'react';
import { clsx } from 'clsx';
import { motion } from 'motion/react';
import {
  Archive,
  BarChart3,
  BookOpenText,
  ChartCandlestick,
  ChevronLeft,
  ClipboardCheck,
  Cloud,
  Gauge,
  HardDrive,
  LineChart,
  ListFilter,
  Settings,
  Sparkles,
} from 'lucide-react';

interface AppSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onHide?: () => void;
  onOpenSettings?: () => void;
  onOpenArchive?: () => void;
  onOpenDriveModal?: () => void;
  onOpenLocalBackup?: () => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'sessions', label: 'Backtest', icon: ChartCandlestick },
  { id: 'trades', label: 'Trade Log', icon: ListFilter },
  { id: 'strategies', label: 'Strategies', icon: LineChart },
  { id: 'checklists', label: 'Checklists', icon: ClipboardCheck },
  { id: 'journal', label: 'Journal', icon: BookOpenText },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function AppSidebar({ activeTab, setActiveTab, onHide, onOpenSettings, onOpenArchive, onOpenDriveModal, onOpenLocalBackup }: AppSidebarProps) {
  return (
    <aside className="relative z-20 flex h-screen w-[220px] shrink-0 flex-col border-r border-[var(--border-soft)] bg-[var(--app-bg)] text-[var(--text-secondary)] shadow-sm select-none">
      {/* Brand Header */}
      <div className="flex h-13 items-center justify-between border-b border-[var(--border-soft)] px-3.5 bg-[var(--surface-ghost)]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-1)]/10 text-[var(--accent-1)] border border-[var(--accent-1)]/20 shadow-xs">
            <Sparkles size={14} />
          </div>
          <div className="flex items-center">
            <span className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
              Replay<span className="text-[var(--accent-1)] font-extrabold">X</span>
            </span>
          </div>
        </div>
        {onHide && (
          <button
            onClick={onHide}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] transition-colors"
            title="Collapse Sidebar"
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-0.5 p-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-[var(--surface-2)] text-[var(--text-primary)] font-semibold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-ghost)] hover:text-[var(--text-primary)]'
              )}
            >
              <Icon
                size={15}
                className={clsx(
                  'shrink-0 transition-colors',
                  isActive ? 'text-[var(--accent-1)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                )}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Clean Utility Footer */}
      <div className="border-t border-[var(--border-soft)] p-2 bg-[var(--surface-ghost)] space-y-0.5">
        <div className="grid grid-cols-2 gap-1 mb-1">
          <button
            onClick={onOpenLocalBackup}
            title="Local File Backup"
            className="flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-2 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors border border-[var(--border-soft)]"
          >
            <HardDrive size={12} />
            <span>Local</span>
          </button>

          <button
            onClick={onOpenDriveModal}
            title="Cloud Database Backup"
            className="flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-2 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors border border-[var(--border-soft)]"
          >
            <Cloud size={12} className="text-[#2962ff]" />
            <span>Cloud</span>
          </button>
        </div>

        <button
          onClick={onOpenArchive}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <Archive size={13} />
          <span>Archive</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <Settings size={13} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
