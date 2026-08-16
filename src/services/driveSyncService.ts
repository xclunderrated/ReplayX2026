import { useSimulatorStore } from "../store/useSimulatorStore";

export type SyncState = "idle" | "syncing" | "synced" | "pending" | "error" | "offline";

export interface DriveUserInfo {
  email: string;
  name?: string;
  picture?: string;
}

export interface BackupMetadata {
  exists: boolean;
  fileId?: string;
  modifiedTime?: string;
  size?: number;
}

export interface DriveSyncStatus {
  isConnected: boolean;
  user: DriveUserInfo | null;
  syncState: SyncState;
  lastSyncAt: number | null;
  lastSyncError: string | null;
  backupInfo: BackupMetadata | null;
  autoSyncEnabled: boolean;
  pendingCount: number;
}

type SyncListener = (status: DriveSyncStatus) => void;

class DriveSyncService {
  private status: DriveSyncStatus = {
    isConnected: false,
    user: null,
    syncState: "idle",
    lastSyncAt: null,
    lastSyncError: null,
    backupInfo: null,
    autoSyncEnabled: true,
    pendingCount: 0,
  };

  private listeners: Set<SyncListener> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSyncedHash: string | null = null;
  private deviceId: string;
  private isInitializing = false;
  private unsubscribeStore: (() => void) | null = null;

  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
    const savedAutoSync = localStorage.getItem("replayx_drive_autosync");
    if (savedAutoSync !== null) {
      this.status.autoSyncEnabled = savedAutoSync === "true";
    }
  }

  public init() {
    if (this.isInitializing) return;
    this.isInitializing = true;

    // Check initial connection status
    this.checkStatus();

    // Listen for window online / offline events
    window.addEventListener("online", () => this.handleNetworkChange(true));
    window.addEventListener("offline", () => this.handleNetworkChange(false));

    // Listen for OAuth success popup messages
    window.addEventListener("message", (event) => {
      if (event.data?.type === "REPLAYX_GOOGLE_AUTH_SUCCESS") {
        this.checkStatus().then(() => {
          this.triggerSync(true);
        });
      }
    });

    // Subscribe to store changes for automatic backup
    this.unsubscribeStore = useSimulatorStore.subscribe((state) => {
      this.handleStoreChange(state);
    });
  }

  public destroy() {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  }

  private getOrCreateDeviceId(): string {
    let id = localStorage.getItem("replayx_device_id");
    if (!id) {
      id = "device_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
      localStorage.setItem("replayx_device_id", id);
    }
    return id;
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  public getStatus(): DriveSyncStatus {
    return { ...this.status };
  }

  private updateStatus(patch: Partial<DriveSyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((fn) => fn(this.status));
  }

  public setAutoSyncEnabled(enabled: boolean) {
    localStorage.setItem("replayx_drive_autosync", enabled ? "true" : "false");
    this.updateStatus({ autoSyncEnabled: enabled });
    if (enabled && this.status.isConnected) {
      this.triggerSync();
    }
  }

  public async checkStatus(): Promise<void> {
    try {
      const res = await fetch("/api/auth/google/status");
      if (!res.ok) throw new Error("Failed to fetch Google auth status");
      const data = await res.json();

      if (data.connected) {
        this.updateStatus({
          isConnected: true,
          user: data.user || { email: "Google User" },
          lastSyncAt: data.lastSyncAt || this.status.lastSyncAt,
          backupInfo: data.backupInfo || null,
          syncState: this.status.syncState === "error" ? "idle" : this.status.syncState,
        });
      } else {
        this.updateStatus({
          isConnected: false,
          user: null,
          syncState: "idle",
        });
      }
    } catch (err: any) {
      console.warn("[DriveSyncService] checkStatus error:", err);
      if (!navigator.onLine) {
        this.updateStatus({ syncState: "offline" });
      }
    }
  }

  public connectGoogle() {
    const width = 520;
    const height = 620;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;

    const popup = window.open(
      "/api/auth/google/login",
      "ConnectGoogleDrive",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
    );

    if (!popup) {
      // Fallback to full redirect if popup blocked
      window.location.href = "/api/auth/google/login?mode=redirect";
    }
  }

  public async disconnectGoogle(): Promise<void> {
    try {
      await fetch("/api/auth/google/logout", { method: "POST" });
    } catch (e) {
      console.warn("[DriveSyncService] disconnect error:", e);
    }
    this.updateStatus({
      isConnected: false,
      user: null,
      syncState: "idle",
      lastSyncAt: null,
      backupInfo: null,
      lastSyncError: null,
      pendingCount: 0,
    });
  }

  private extractWorkspacePayload(state: any): any {
    return {
      sessions: (state.sessions || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        initialBalance: s.initialBalance,
        balance: s.balance,
        instrument: s.instrument,
        timeframe: s.timeframe,
        startDate: s.startDate,
        endDate: s.endDate,
        trades: s.trades || [],
        currentIndex: s.currentIndex || 0,
        targetTimestamp: s.targetTimestamp,
        lastReplayTimestamp: s.lastReplayTimestamp,
        playbackSpeed: s.playbackSpeed || 1,
        indicators: s.indicators || [],
        journalEntries: s.journalEntries || [],
        checklistCheckedItems: s.checklistCheckedItems || {},
        timeframePanes: s.timeframePanes || [],
        mtfLayout: s.mtfLayout || "horizontal",
        compressGaps: s.compressGaps,
        drawingDocument: s.drawingDocument || null,
      })),
      archivedSessions: state.archivedSessions || [],
      currentSessionId: state.currentSessionId || null,
      strategies: state.strategies || [],
      chartColors: state.chartColors || null,
      chartTimezone: state.chartTimezone || "UTC",
      theme: state.theme || "dark",
      useSyntheticSeconds: state.useSyntheticSeconds ?? false,
      newsImpactFilter: state.newsImpactFilter || "all",
      newsLineOpacity: state.newsLineOpacity ?? 0.5,
      gridVertLinesVisible: state.gridVertLinesVisible ?? true,
      gridHorzLinesVisible: state.gridHorzLinesVisible ?? true,
      hotkeyBindings: state.hotkeyBindings || null,
    };
  }

  private computeHash(obj: any): string {
    return JSON.stringify(obj);
  }

  private handleStoreChange(state: any) {
    if (!this.status.isConnected || !this.status.autoSyncEnabled) return;

    // Skip during active playback ticks
    const isPlaying = Array.isArray(state.sessions) && state.sessions.some((s: any) => s?.isPlaying);
    if (isPlaying) return;

    const payload = this.extractWorkspacePayload(state);
    const hash = this.computeHash(payload);

    if (this.lastSyncedHash === null) {
      this.lastSyncedHash = hash;
      return;
    }

    if (hash === this.lastSyncedHash) {
      return;
    }

    // Changes detected
    this.updateStatus({
      syncState: "pending",
      pendingCount: (this.status.pendingCount || 0) + 1,
    });

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.triggerSync();
    }, 3500);
  }

  private handleNetworkChange(isOnline: boolean) {
    if (!isOnline) {
      this.updateStatus({ syncState: "offline" });
    } else {
      if (this.status.isConnected && this.status.syncState === "offline") {
        this.updateStatus({ syncState: "pending" });
        this.triggerSync();
      }
    }
  }

  public async triggerSync(force = false): Promise<boolean> {
    if (!this.status.isConnected) return false;
    if (!navigator.onLine) {
      this.updateStatus({ syncState: "offline" });
      return false;
    }

    const state = useSimulatorStore.getState();
    const payload = this.extractWorkspacePayload(state);
    const currentHash = this.computeHash(payload);

    if (!force && this.lastSyncedHash === currentHash && this.status.syncState === "synced") {
      return true;
    }

    this.updateStatus({ syncState: "syncing", lastSyncError: null });

    try {
      const res = await fetch("/api/drive/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceState: payload,
          deviceId: this.deviceId,
          clientUpdatedAt: this.status.lastSyncAt || Date.now(),
          force,
        }),
      });

      if (res.status === 409) {
        // Multi-device conflict!
        const conflictData = await res.json();
        this.updateStatus({
          syncState: "error",
          lastSyncError: "Conflict: Newer backup exists on Google Drive from another device.",
        });
        return false;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Sync failed with status ${res.status}`);
      }

      const result = await res.json();
      this.lastSyncedHash = currentHash;

      this.updateStatus({
        syncState: "synced",
        lastSyncAt: result.syncedAt,
        lastSyncError: null,
        pendingCount: 0,
        backupInfo: {
          exists: true,
          fileId: result.fileId,
          modifiedTime: new Date(result.syncedAt).toISOString(),
          size: result.size,
        },
      });

      return true;
    } catch (err: any) {
      console.error("[DriveSyncService] triggerSync error:", err);
      this.updateStatus({
        syncState: "error",
        lastSyncError: err?.message || "Failed to sync to Google Drive.",
      });
      return false;
    }
  }

  public async restoreFromDrive(): Promise<{ success: boolean; error?: string }> {
    if (!this.status.isConnected) {
      return { success: false, error: "Google Drive is not connected." };
    }

    this.updateStatus({ syncState: "syncing", lastSyncError: null });

    try {
      const res = await fetch("/api/drive/restore");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Restore failed with status ${res.status}`);
      }

      const data = await res.json();
      const ws = data.workspaceState;

      if (!ws || !Array.isArray(ws.sessions)) {
        throw new Error("Invalid workspace payload structure from Google Drive.");
      }

      // Hydrate Zustand store safely
      useSimulatorStore.setState((state) => ({
        ...state,
        sessions: ws.sessions.map((s: any) => ({
          ...s,
          data: [], // raw candles are re-downloaded on demand
          isPlaying: false,
          dataState: {
            isLoading: false,
            isHydrating: false,
            isViewportLoading: false,
            progress: 0,
            activeLoadKind: null,
            error: null,
          },
        })),
        archivedSessions: ws.archivedSessions || [],
        currentSessionId: ws.currentSessionId || (ws.sessions[0]?.id ?? null),
        strategies: ws.strategies || state.strategies,
        chartColors: ws.chartColors || state.chartColors,
        chartTimezone: ws.chartTimezone || state.chartTimezone,
        theme: ws.theme || state.theme,
        useSyntheticSeconds: ws.useSyntheticSeconds ?? state.useSyntheticSeconds,
        newsImpactFilter: ws.newsImpactFilter || state.newsImpactFilter,
        newsLineOpacity: ws.newsLineOpacity ?? state.newsLineOpacity,
        gridVertLinesVisible: ws.gridVertLinesVisible ?? state.gridVertLinesVisible,
        gridHorzLinesVisible: ws.gridHorzLinesVisible ?? state.gridHorzLinesVisible,
        ...(ws.hotkeyBindings ? { hotkeyBindings: ws.hotkeyBindings } : {}),
      }));

      // Update last synced hash to match restored state
      const newPayload = this.extractWorkspacePayload(useSimulatorStore.getState());
      this.lastSyncedHash = this.computeHash(newPayload);

      const now = Date.now();
      this.updateStatus({
        syncState: "synced",
        lastSyncAt: now,
        lastSyncError: null,
        pendingCount: 0,
      });

      return { success: true };
    } catch (err: any) {
      console.error("[DriveSyncService] restoreFromDrive error:", err);
      this.updateStatus({
        syncState: "error",
        lastSyncError: err?.message || "Failed to restore workspace from Google Drive.",
      });
      return { success: false, error: err?.message || "Failed to restore backup." };
    }
  }
}

export const driveSyncService = new DriveSyncService();
