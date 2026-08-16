import { useSimulatorStore } from "../store/useSimulatorStore";
import type { NewsImpactFilter } from "../lib/news";

// ---------------------------------------------------------------------------
// ReplayX Archive Schema Specification (v1)
// ---------------------------------------------------------------------------

export const CURRENT_SCHEMA_VERSION = 1;
export const BACKUP_FILE_EXTENSION = ".replayx";

export interface BackupAssetV1 {
  id: string;
  entityType: "journal_screenshot" | "attachment" | "other";
  entityId: string;
  filename?: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
}

export interface WorkspaceSettingsV1 {
  theme: "dark" | "light";
  chartTimezone: string;
  chartColors: any;
  useSyntheticSeconds: boolean;
  newsImpactFilter: NewsImpactFilter;
  newsLineOpacity: number;
  gridVertLinesVisible: boolean;
  gridHorzLinesVisible: boolean;
  hotkeyBindings: any;
  autoScreenshotEnabled?: boolean;
  autoScreenshotTimeframes?: Record<string, boolean>;
  autoScreenshotSaveToJournal?: boolean;
  autoOpenLastTradeScreenshots?: boolean;
}

export interface ReplayXBackupArchiveV1 {
  meta: {
    format: "replayx_archive";
    schemaVersion: number;
    appVersion: string;
    exportedAt: number;
    checksum: string;
    sourceDeviceId?: string;
    summary: {
      sessionCount: number;
      archivedSessionCount: number;
      tradeCount: number;
      journalCount: number;
      screenshotCount: number;
      strategyCount: number;
      totalSizeBytes: number;
    };
  };
  workspace: {
    sessions: any[];
    archivedSessions: any[];
    currentSessionId: string | null;
    strategies: any[];
    settings: WorkspaceSettingsV1;
  };
  assets: BackupAssetV1[];
  extra?: Record<string, any>; // Forward compatibility placeholder for future fields
}

export interface ValidationResult {
  valid: boolean;
  schemaVersion?: number;
  exportedAt?: number;
  summary?: ReplayXBackupArchiveV1["meta"]["summary"];
  error?: string;
  warnings?: string[];
  archive?: ReplayXBackupArchiveV1;
}

export type RestoreMode = "replace" | "merge";

// ---------------------------------------------------------------------------
// Helper Utilities: Cryptographic Checksum & File Helpers
// ---------------------------------------------------------------------------

async function computeChecksum(payloadString: string): Promise<string> {
  try {
    if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(payloadString);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (e) {
    console.warn("[LocalBackupService] SHA-256 calculation failed, falling back to simple hash:", e);
  }
  // Simple fallback hash algorithm
  let hash = 0;
  for (let i = 0; i < payloadString.length; i++) {
    const char = payloadString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return "crc32_" + Math.abs(hash).toString(16);
}

function estimateBase64SizeBytes(dataUrl: string): number {
  if (!dataUrl) return 0;
  const base64Str = dataUrl.split(",")[1] || dataUrl;
  return Math.round((base64Str.length * 3) / 4);
}

// ---------------------------------------------------------------------------
// Core Export Implementation
// ---------------------------------------------------------------------------

export async function exportWorkspaceArchive(): Promise<{
  archive: ReplayXBackupArchiveV1;
  jsonString: string;
  filename: string;
}> {
  const state = useSimulatorStore.getState();

  // Extract assets (screenshots, attached images)
  const assets: BackupAssetV1[] = [];
  let screenshotCount = 0;

  const processSessionForAssets = (session: any) => {
    if (Array.isArray(session.journalEntries)) {
      session.journalEntries.forEach((journal: any) => {
        if (journal.imageDataUrl) {
          screenshotCount++;
          const assetId = `asset_journal_${journal.id}`;
          const sizeBytes = estimateBase64SizeBytes(journal.imageDataUrl);
          
          // Deduplicate if already processed
          if (!assets.some((a) => a.id === assetId)) {
            assets.push({
              id: assetId,
              entityType: "journal_screenshot",
              entityId: journal.id,
              mimeType: journal.imageDataUrl.startsWith("data:image/png")
                ? "image/png"
                : "image/jpeg",
              dataUrl: journal.imageDataUrl,
              sizeBytes,
            });
          }
        }
      });
    }
  };

  const sessions = (state.sessions || []).map((s) => {
    processSessionForAssets(s);
    return {
      ...s,
      data: [], // Do not dump massive raw candles array, keeping backup portable and light
      isPlaying: false,
    };
  });

  const archivedSessions = (state.archivedSessions || []).map((s) => {
    processSessionForAssets(s);
    return {
      ...s,
      data: [],
      isPlaying: false,
    };
  });

  const totalTrades =
    sessions.reduce((acc, s) => acc + (s.trades?.length || 0), 0) +
    archivedSessions.reduce((acc, s) => acc + (s.trades?.length || 0), 0);

  const totalJournals =
    sessions.reduce((acc, s) => acc + (s.journalEntries?.length || 0), 0) +
    archivedSessions.reduce((acc, s) => acc + (s.journalEntries?.length || 0), 0);

  const settings: WorkspaceSettingsV1 = {
    theme: state.theme || "dark",
    chartTimezone: state.chartTimezone || "UTC",
    chartColors: state.chartColors || null,
    useSyntheticSeconds: state.useSyntheticSeconds ?? false,
    newsImpactFilter: state.newsImpactFilter || "all",
    newsLineOpacity: state.newsLineOpacity ?? 0.5,
    gridVertLinesVisible: state.gridVertLinesVisible ?? true,
    gridHorzLinesVisible: state.gridHorzLinesVisible ?? true,
    hotkeyBindings: (state as any).hotkeyBindings || null,
    autoScreenshotEnabled: state.autoScreenshotEnabled ?? true,
    autoScreenshotTimeframes: state.autoScreenshotTimeframes || null,
    autoScreenshotSaveToJournal: state.autoScreenshotSaveToJournal ?? true,
    autoOpenLastTradeScreenshots: state.autoOpenLastTradeScreenshots ?? true,
  };

  const workspacePayload = {
    sessions,
    archivedSessions,
    currentSessionId: state.currentSessionId || null,
    strategies: state.strategies || [],
    settings,
  };

  const tempPayloadString = JSON.stringify({ workspacePayload, assets });
  const checksum = await computeChecksum(tempPayloadString);
  const deviceId = localStorage.getItem("replayx_device_id") || undefined;
  const now = Date.now();

  const archive: ReplayXBackupArchiveV1 = {
    meta: {
      format: "replayx_archive",
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: "1.0.0",
      exportedAt: now,
      checksum,
      sourceDeviceId: deviceId,
      summary: {
        sessionCount: sessions.length,
        archivedSessionCount: archivedSessions.length,
        tradeCount: totalTrades,
        journalCount: totalJournals,
        screenshotCount,
        strategyCount: (state.strategies || []).length,
        totalSizeBytes: tempPayloadString.length,
      },
    },
    workspace: workspacePayload,
    assets,
  };

  const finalJsonString = JSON.stringify(archive, null, 2);
  const dateStr = new Date(now).toISOString().slice(0, 10);
  const filename = `ReplayX-Backup-${dateStr}${BACKUP_FILE_EXTENSION}`;

  // Record last export date in localStorage
  localStorage.setItem("replayx_last_export_at", now.toString());

  return {
    archive,
    jsonString: finalJsonString,
    filename,
  };
}

export function triggerDownloadBackup(jsonString: string, filename: string) {
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Validation & Schema Migration Pipeline
// ---------------------------------------------------------------------------

export async function validateBackupFile(fileContent: string): Promise<ValidationResult> {
  if (!fileContent || typeof fileContent !== "string") {
    return { valid: false, error: "File is empty or not readable text." };
  }

  let data: any;
  try {
    data = JSON.parse(fileContent);
  } catch (e: any) {
    return { valid: false, error: "Invalid JSON format: " + (e?.message || "Syntax error") };
  }

  // Support legacy or direct raw backup compatibility if user uploads an older format
  if (!data.meta && data.workspaceState) {
    console.warn("[LocalBackupService] Legacy workspace payload detected, wrapping into archive v1 format...");
    data = wrapLegacyPayloadToArchiveV1(data);
  }

  if (!data || typeof data !== "object") {
    return { valid: false, error: "File content is not a valid JSON object." };
  }

  if (data.meta?.format !== "replayx_archive") {
    return { valid: false, error: "Selected file is not a valid ReplayX backup archive." };
  }

  const schemaVersion = data.meta.schemaVersion;
  if (typeof schemaVersion !== "number" || schemaVersion < 1) {
    return { valid: false, error: "Invalid or missing backup schema version." };
  }

  if (!data.workspace || typeof data.workspace !== "object") {
    return { valid: false, error: "Backup archive is missing workspace data." };
  }

  const warnings: string[] = [];

  // Check checksum if present
  if (data.meta.checksum && data.workspace && data.assets) {
    const tempPayloadString = JSON.stringify({
      workspacePayload: data.workspace,
      assets: data.assets,
    });
    const expectedChecksum = await computeChecksum(tempPayloadString);
    if (data.meta.checksum !== expectedChecksum) {
      warnings.push("Checksum mismatch detected. Some data inside the backup file may have been modified manually or truncated.");
    }
  }

  // Schema migration check
  let archive = data as ReplayXBackupArchiveV1;
  if (archive.meta.schemaVersion < CURRENT_SCHEMA_VERSION) {
    archive = migrateArchiveToCurrent(archive);
  }

  return {
    valid: true,
    schemaVersion: archive.meta.schemaVersion,
    exportedAt: archive.meta.exportedAt,
    summary: archive.meta.summary,
    warnings: warnings.length > 0 ? warnings : undefined,
    archive,
  };
}

function wrapLegacyPayloadToArchiveV1(legacy: any): ReplayXBackupArchiveV1 {
  const ws = legacy.workspaceState || legacy;
  const sessions = Array.isArray(ws.sessions) ? ws.sessions : [];
  const archivedSessions = Array.isArray(ws.archivedSessions) ? ws.archivedSessions : [];

  return {
    meta: {
      format: "replayx_archive",
      schemaVersion: 1,
      appVersion: "1.0.0-legacy",
      exportedAt: legacy.updatedAt || Date.now(),
      checksum: "",
      summary: {
        sessionCount: sessions.length,
        archivedSessionCount: archivedSessions.length,
        tradeCount: 0,
        journalCount: 0,
        screenshotCount: 0,
        strategyCount: (ws.strategies || []).length,
        totalSizeBytes: 0,
      },
    },
    workspace: {
      sessions,
      archivedSessions,
      currentSessionId: ws.currentSessionId || null,
      strategies: ws.strategies || [],
      settings: {
        theme: ws.theme || "dark",
        chartTimezone: ws.chartTimezone || "UTC",
        chartColors: ws.chartColors || null,
        useSyntheticSeconds: ws.useSyntheticSeconds ?? false,
        newsImpactFilter: ws.newsImpactFilter || "all",
        newsLineOpacity: ws.newsLineOpacity ?? 0.5,
        gridVertLinesVisible: ws.gridVertLinesVisible ?? true,
        gridHorzLinesVisible: ws.gridHorzLinesVisible ?? true,
        hotkeyBindings: ws.hotkeyBindings || null,
      },
    },
    assets: [],
  };
}

function migrateArchiveToCurrent(archive: any): ReplayXBackupArchiveV1 {
  let version = archive.meta.schemaVersion;

  // Pipeline for future schema upgrades (e.g. v1 -> v2)
  while (version < CURRENT_SCHEMA_VERSION) {
    if (version === 1) {
      // Future v1 -> v2 migration logic goes here
      version = 2;
    } else {
      break;
    }
  }

  archive.meta.schemaVersion = CURRENT_SCHEMA_VERSION;
  return archive;
}

// ---------------------------------------------------------------------------
// Import Restoration Engine
// ---------------------------------------------------------------------------

export async function importWorkspaceArchive(
  archive: ReplayXBackupArchiveV1,
  mode: RestoreMode
): Promise<{ success: boolean; error?: string; restoredSummary?: any }> {
  try {
    const state = useSimulatorStore.getState();
    const ws = archive.workspace;
    const assetsMap = new Map<string, BackupAssetV1>();

    if (Array.isArray(archive.assets)) {
      archive.assets.forEach((asset) => {
        if (asset.id) {
          assetsMap.set(asset.id, asset);
        }
      });
    }

    // Re-bind assets into journal entries if dataUrl was stored separately
    const restoreSessionAssets = (session: any) => {
      if (!session) return session;
      const journalEntries = (session.journalEntries || []).map((j: any) => {
        const assetKey = `asset_journal_${j.id}`;
        if (assetsMap.has(assetKey)) {
          return {
            ...j,
            imageDataUrl: assetsMap.get(assetKey)!.dataUrl,
          };
        }
        return j;
      });
      return {
        ...session,
        id: session.id || `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: session.name || "Restored Session",
        initialBalance: session.initialBalance ?? 10000,
        balance: session.balance ?? session.initialBalance ?? 10000,
        instrument: session.instrument || "EURUSD",
        timeframe: session.timeframe || "1m",
        startDate: session.startDate || "2024-01-01",
        endDate: session.endDate || "2024-01-05",
        trades: session.trades || [],
        data: Array.isArray(session.data) && session.data.length > 0 ? session.data : [],
        currentIndex: session.currentIndex ?? 0,
        isPlaying: false,
        playbackSpeed: session.playbackSpeed || 1,
        indicators: session.indicators || [],
        journalEntries,
        dataState: undefined,
        checklistCheckedItems: session.checklistCheckedItems || {},
        timeframePanes: session.timeframePanes || [session.timeframe || "1m"],
        mtfLayout: session.mtfLayout || "horizontal",
        compressGaps: session.compressGaps ?? false,
        drawingDocument: session.drawingDocument || null,
        targetTimestamp: session.targetTimestamp ?? null,
        lastReplayTimestamp: session.lastReplayTimestamp ?? null,
      };
    };

    const restoredActive = (ws.sessions || []).map(restoreSessionAssets);
    const restoredArchived = (ws.archivedSessions || []).map(restoreSessionAssets);
    const restoredStrategies = ws.strategies || [];
    const settings: Partial<WorkspaceSettingsV1> = ws.settings || {};

    if (mode === "replace") {
      // Safely replace current store state
      useSimulatorStore.setState({
        sessions: restoredActive,
        archivedSessions: restoredArchived,
        currentSessionId: ws.currentSessionId || (restoredActive[0]?.id ?? null),
        strategies: restoredStrategies,
        ...(settings.chartColors ? { chartColors: settings.chartColors } : {}),
        ...(settings.chartTimezone ? { chartTimezone: settings.chartTimezone } : {}),
        ...(settings.theme ? { theme: settings.theme } : {}),
        useSyntheticSeconds: settings.useSyntheticSeconds ?? state.useSyntheticSeconds,
        ...(settings.newsImpactFilter ? { newsImpactFilter: settings.newsImpactFilter as NewsImpactFilter } : {}),
        newsLineOpacity: settings.newsLineOpacity ?? state.newsLineOpacity,
        gridVertLinesVisible: settings.gridVertLinesVisible ?? state.gridVertLinesVisible,
        gridHorzLinesVisible: settings.gridHorzLinesVisible ?? state.gridHorzLinesVisible,
        ...(settings.hotkeyBindings ? { hotkeyBindings: settings.hotkeyBindings } : {}),
        autoScreenshotEnabled: settings.autoScreenshotEnabled ?? state.autoScreenshotEnabled,
        ...(settings.autoScreenshotTimeframes ? { autoScreenshotTimeframes: settings.autoScreenshotTimeframes } : {}),
        autoScreenshotSaveToJournal: settings.autoScreenshotSaveToJournal ?? state.autoScreenshotSaveToJournal,
        autoOpenLastTradeScreenshots: settings.autoOpenLastTradeScreenshots ?? state.autoOpenLastTradeScreenshots,
      });
    } else {
      // Merge mode: Generate unique IDs for imported items if conflicts exist
      const existingSessionIds = new Set([
        ...state.sessions.map((s) => s.id),
        ...state.archivedSessions.map((s) => s.id),
      ]);

      const deduplicatedSessions = restoredActive.map((s) => {
        if (existingSessionIds.has(s.id)) {
          const newId = `session_imported_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          return { ...s, id: newId, name: `${s.name} (Imported)` };
        }
        return s;
      });

      const deduplicatedArchived = restoredArchived.map((s) => {
        if (existingSessionIds.has(s.id)) {
          const newId = `session_imported_arch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          return { ...s, id: newId, name: `${s.name} (Imported)` };
        }
        return s;
      });

      const existingStratIds = new Set((state.strategies || []).map((st) => st.id));
      const deduplicatedStrategies = restoredStrategies.map((st) => {
        if (existingStratIds.has(st.id)) {
          return { ...st, id: `strat_imported_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` };
        }
        return st;
      });

      useSimulatorStore.setState({
        sessions: [...state.sessions, ...deduplicatedSessions],
        archivedSessions: [...state.archivedSessions, ...deduplicatedArchived],
        strategies: [...(state.strategies || []), ...deduplicatedStrategies],
        currentSessionId: state.currentSessionId || deduplicatedSessions[0]?.id || null,
      });
    }

    // Record last import date
    localStorage.setItem("replayx_last_import_at", Date.now().toString());

    return {
      success: true,
      restoredSummary: {
        sessionsCount: restoredActive.length,
        archivedCount: restoredArchived.length,
        strategiesCount: restoredStrategies.length,
        mode,
      },
    };
  } catch (err: any) {
    console.error("[LocalBackupService] Import error:", err);
    return { success: false, error: err?.message || "Failed to restore workspace from backup file." };
  }
}
