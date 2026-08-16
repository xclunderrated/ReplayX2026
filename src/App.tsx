import React, { Suspense, lazy, useEffect, useState } from 'react';
import AppSidebar from './components/AppSidebar';
import DashboardViewNew from './components/DashboardViewNew';
import { SettingsModal } from './components/SettingsModal';
import { CloudBackupModal } from './components/CloudBackupModal';
import { LocalBackupModal } from './components/LocalBackupModal';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';
import { useSimulatorStore } from './store/useSimulatorStore';
import { useShallow } from 'zustand/react/shallow';
import { useSessionLoader } from './hooks/useSessionLoader';
import { advanceAndRender, forceReactSync, resetSyncTimer } from './lib/PlaybackController';
import { ChevronRight, LoaderCircle, X } from 'lucide-react';

function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<any>,
  namedExport?: string
) {
  return lazy(async () => {
    try {
      const module = await factory();
      if (namedExport && module[namedExport]) {
        return { default: module[namedExport] };
      }
      if (module.default) {
        return { default: module.default };
      }
      const firstComponent = Object.values(module).find((v) => typeof v === 'function');
      if (firstComponent) {
        return { default: firstComponent as T };
      }
      return module;
    } catch (err) {
      console.warn('Lazy module load encountered an error, retrying...', err);
      await new Promise((res) => setTimeout(res, 400));
      const module = await factory();
      if (namedExport && module[namedExport]) {
        return { default: module[namedExport] };
      }
      if (module.default) {
        return { default: module.default };
      }
      const firstComponent = Object.values(module).find((v) => typeof v === 'function');
      if (firstComponent) {
        return { default: firstComponent as T };
      }
      return module;
    }
  });
}

const SessionView = lazyWithRetry(() => import('./components/SessionView'), 'SessionView');
const AnalyticsView = lazyWithRetry(() => import('./components/AnalyticsView'), 'AnalyticsView');
const JournalView = lazyWithRetry(() => import('./components/JournalView'), 'JournalView');
const ChecklistsView = lazyWithRetry(() => import('./components/ChecklistsView'), 'ChecklistsView');
const TradeLogView = lazyWithRetry(() => import('./components/TradeLogView'));

export function App() {
  const { tick, currentSessionId, currentSession, isFullScreen, setFullScreen, hasCompletedOnboarding, completeOnboarding, replayOnboarding, theme, activeTab, setActiveTab, setJournalViewMode } = useSimulatorStore(useShallow((state) => ({
    tick: state.tick,
    currentSessionId: state.currentSessionId,
    currentSession: state.sessions.find((session) => session.id === state.currentSessionId) || null,
    isFullScreen: state.isFullScreen,
    setFullScreen: state.setFullScreen,
    hasCompletedOnboarding: state.hasCompletedOnboarding,
    completeOnboarding: state.completeOnboarding,
    replayOnboarding: state.replayOnboarding,
    theme: state.theme,
    activeTab: state.mainActiveTab,
    setActiveTab: state.setMainActiveTab,
    setJournalViewMode: state.setJournalViewMode,
  })));
  const { isLoading, progress, error, userMessage, isInteractive, retry, cancelLoad } = useSessionLoader();
  
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [localBackupOpen, setLocalBackupOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [journalArchiveNonce, setJournalArchiveNonce] = useState(0);
  const [storeHydrated, setStoreHydrated] = useState(useSimulatorStore.persist.hasHydrated());

  const handleTabChange = (tab: string) => {
    if (activeTab === 'sessions' && tab !== 'sessions') {
      useSimulatorStore.getState().pause();
    }
    setActiveTab(tab);
  };

  const handleOpenArchive = () => {
    setJournalViewMode('archive');
    handleTabChange('journal');
    setJournalArchiveNonce((n) => n + 1);
  };

  useEffect(() => {
    const unsubscribe = useSimulatorStore.persist.onFinishHydration(() => {
      setStoreHydrated(true);
    });

    if (useSimulatorStore.persist.hasHydrated()) {
      setStoreHydrated(true);
    }

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!storeHydrated) return;
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [theme, storeHydrated]);

  useEffect(() => {
    if (!storeHydrated || hasCompletedOnboarding || onboardingOpen) return;
    setOnboardingOpen(true);
  }, [storeHydrated, hasCompletedOnboarding, onboardingOpen]);

  const getLoadLabel = () => {
    switch (currentSession?.dataState?.activeLoadKind) {
      case 'switch':
        return 'Switching timeframe';
      case 'hydrate':
        return 'Hydrating session';
      case 'edge-before':
        return 'Loading older candles';
      case 'edge-after':
        return 'Loading next candles';
      case 'viewport':
        return 'Backfilling chart history';
      case 'initial':
        return 'Loading session';
      case 'manual':
        return 'Refreshing data';
      default:
        return 'Downloading data';
    }
  };

  // High-performance playback loop - bypasses React for individual ticks.
  // Uses PlaybackController to push candles directly to the chart series.
  // React state only syncs every ~500ms for UI elements (balance, trades, etc.).
  useEffect(() => {
    let rafId: number | null = null;
    let lastFrameTime = 0;
    let tickAccumulator = 0;

    const loop = (now: number) => {
      const store = useSimulatorStore.getState();
      const sessionIndex = store.sessions.findIndex((s) => s.id === store.currentSessionId);
      if (sessionIndex === -1) {
        rafId = null;
        return;
      }
      const session = store.sessions[sessionIndex];
      if (!session?.isPlaying) {
        // Sync one last time when paused so React has final state
        if (lastFrameTime > 0) {
          forceReactSync(store.sessions, useSimulatorStore.setState);
        }
        rafId = null;
        lastFrameTime = 0;
        tickAccumulator = 0;
        return;
      }

      if (lastFrameTime === 0) {
        lastFrameTime = now;
        resetSyncTimer();
        rafId = requestAnimationFrame(loop);
        return;
      }

      const elapsed = Math.min(now - lastFrameTime, 100);
      lastFrameTime = now;

      const tickIntervalMs = 1000 / session.playbackSpeed;
      tickAccumulator += elapsed;

      // Batch ticks: at high speeds, multiple ticks per frame
      const maxTicksPerFrame = Math.min(Math.ceil(session.playbackSpeed / 10) + 1, 8);
      let ticksThisFrame = 0;

      while (tickAccumulator >= tickIntervalMs && ticksThisFrame < maxTicksPerFrame) {
        const res = advanceAndRender(
          store.sessions,
          sessionIndex,
          useSimulatorStore.setState,
          now,
        );
        tickAccumulator -= tickIntervalMs;
        ticksThisFrame++;

        if (!res.advanced) {
          if (res.reachedEnd && !res.mayHaveMore) {
            // End of data - pause playback
            const nextSessions = store.sessions.slice();
            nextSessions[sessionIndex] = { ...nextSessions[sessionIndex], isPlaying: false };
            forceReactSync(nextSessions, useSimulatorStore.setState);
          }
          break;
        }
      }

      if (tickAccumulator > tickIntervalMs * 3) {
        tickAccumulator = tickIntervalMs;
      }

      rafId = requestAnimationFrame(loop);
    };

    if (currentSession?.isPlaying) {
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [currentSession?.isPlaying, currentSession?.playbackSpeed]);

  const handleSessionSelect = () => {
    setFullScreen(true);
    setActiveTab('sessions');
  };

  const isImmersiveSession = activeTab === 'sessions' && currentSessionId && isFullScreen;
  const showAppChrome = !isImmersiveSession;

  return (
    <div className={`app-backdrop relative flex min-h-screen h-screen overflow-hidden text-[var(--text-primary)] font-sans${sidebarHidden ? ' sidebar-hidden' : ''}`}>
      <div aria-hidden className="film-grain" />
      {showAppChrome && (
        <>
          <div className="aura-orbit -left-40 -top-48" />
          <div className="aura-orbit -right-48 top-8 [animation-delay:1.8s]" />
        </>
      )}
      {showAppChrome && !sidebarHidden && (
        <AppSidebar
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          onHide={() => setSidebarHidden(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenArchive={handleOpenArchive}
          onOpenDriveModal={() => setDriveModalOpen(true)}
          onOpenLocalBackup={() => setLocalBackupOpen(true)}
        />
      )}

      {showAppChrome && sidebarHidden && (
        <button
          onClick={() => setSidebarHidden(false)}
          className="surface-panel absolute left-3 top-3 z-[60] flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--text-secondary)] shadow-md transition hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
          title="Show sidebar"
        >
          <ChevronRight size={18} />
        </button>
      )}

      {showAppChrome && (isLoading || error) && (
        <div className="absolute right-3 top-[50px] z-[60] flex items-center gap-2">
          {isLoading && (
            <div className="surface-panel inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-[11px] text-[var(--text-secondary)] shadow-md">
              <LoaderCircle size={14} className="animate-spin text-[var(--accent-2)]" />
              <span>{isInteractive ? `${getLoadLabel()}: ${Math.round(progress)}%` : `${getLoadLabel()}...`}</span>
              <button
                type="button"
                onClick={cancelLoad}
                className="ml-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-3)] hover:bg-[var(--surface-2)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
              >
                Cancel
              </button>
            </div>
          )}
          {error && (
            <div className="inline-flex items-center gap-2 rounded-2xl border border-rose-300/40 bg-rose-100/80 px-3 py-2 text-[11px] text-rose-700 shadow-md">
              <X size={13} />
              <span>{error}</span>
              <button
                onClick={retry}
                className="rounded-lg border border-rose-400/30 bg-white/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white/80"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {showAppChrome && !isLoading && !error && userMessage && (
        <div className="absolute right-3 top-[50px] z-[60]">
          <div className="surface-panel inline-flex max-w-xs items-center gap-2 rounded-2xl px-3 py-2 text-[11px] text-[var(--text-secondary)] shadow-md">
            <span>{userMessage}</span>
            <button
              type="button"
              onClick={() => {
                const sid = currentSession?.id;
                if (sid) useSimulatorStore.getState().patchDataState({ userMessage: null }, sid);
              }}
              className="ml-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-3)] hover:bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              aria-label="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}
      
      <div className="relative flex-1 flex flex-col h-full min-h-0 overflow-hidden">
        {/* Main Content Area */}
        {activeTab === 'dashboard' && <DashboardViewNew onSessionSelect={handleSessionSelect} />}
        
        {activeTab === 'analytics' && (
          <ViewErrorBoundary viewName="Analytics" onRecover={() => handleTabChange('dashboard')}>
            <Suspense fallback={<div className="flex flex-1 items-center justify-center bg-transparent text-[var(--text-muted)]">Loading analytics...</div>}>
              <AnalyticsView />
            </Suspense>
          </ViewErrorBoundary>
        )}

        {activeTab === 'journal' && (
          <ViewErrorBoundary viewName="Journal" onRecover={() => handleTabChange('dashboard')}>
            <Suspense fallback={<div className="flex flex-1 items-center justify-center bg-transparent text-[var(--text-muted)]">Loading journal...</div>}>
              <JournalView archiveNonce={journalArchiveNonce} />
            </Suspense>
          </ViewErrorBoundary>
        )}

        {activeTab === 'checklists' && (
          <ViewErrorBoundary viewName="Checklists" onRecover={() => handleTabChange('dashboard')}>
            <Suspense fallback={<div className="flex flex-1 items-center justify-center bg-transparent text-[var(--text-muted)]">Loading checklists...</div>}>
              <ChecklistsView />
            </Suspense>
          </ViewErrorBoundary>
        )}
        
        {activeTab === 'sessions' && (
          currentSessionId ? (
            <ViewErrorBoundary viewName="Session" onRecover={() => handleTabChange('dashboard')}>
              <Suspense fallback={<div className="flex flex-1 items-center justify-center bg-transparent text-[var(--text-muted)]">Loading session...</div>}>
                <SessionView onOpenJournal={() => handleTabChange('journal')} onOpenSettings={() => setSettingsOpen(true)} />
              </Suspense>
            </ViewErrorBoundary>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-transparent">
              <div className="surface-panel-strong rounded-2xl px-8 py-10 text-center">
                <h2 className="mb-2 text-xl">No active session</h2>
                <p className="mb-6 text-sm text-[var(--text-secondary)]">Select a session from the dashboard or create a new one.</p>
                <button 
                  onClick={() => handleTabChange('dashboard')}
                  className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-3)]"
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          )
        )}
        
        {activeTab === 'trades' && (
          <ViewErrorBoundary viewName="Trade Log" onRecover={() => handleTabChange('dashboard')}>
            <Suspense fallback={<div className="flex flex-1 items-center justify-center bg-transparent text-[var(--text-muted)]">Loading trade log...</div>}>
              <TradeLogView />
            </Suspense>
          </ViewErrorBoundary>
        )}

        {activeTab !== 'dashboard' && activeTab !== 'sessions' && activeTab !== 'trades' && activeTab !== 'analytics' && activeTab !== 'journal' && activeTab !== 'checklists' && (
          <div className="flex flex-1 items-center justify-center bg-transparent text-[var(--text-muted)]">
            <h2 className="text-xl font-semibold">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} - Coming Soon</h2>
          </div>
        )}
      </div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CloudBackupModal isOpen={driveModalOpen} onClose={() => setDriveModalOpen(false)} />
      <LocalBackupModal isOpen={localBackupOpen} onClose={() => setLocalBackupOpen(false)} />
    </div>
  );
}

export default App;

