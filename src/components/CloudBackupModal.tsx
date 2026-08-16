import React, { useState, useRef } from "react";
import {
  Cloud,
  CloudCheck,
  CloudOff,
  CloudUpload,
  RefreshCw,
  LogOut,
  X,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  ShieldCheck,
  Mail,
  Lock,
  UserCheck,
  Download,
  Upload,
  FileJson,
  Info,
} from "lucide-react";
import { useFirebaseSync } from "../hooks/useFirebaseSync";
import { useSimulatorStore } from "../store/useSimulatorStore";
import { motion, AnimatePresence } from "motion/react";

interface CloudBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudBackupModal: React.FC<CloudBackupModalProps> = ({ isOpen, onClose }) => {
  const {
    isConnected,
    user,
    syncState,
    lastSyncAt,
    lastSyncError,
    cloudBackupExists,
    cloudUpdatedAt,
    cloudBackupSize,
    autoSyncEnabled,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInAsGuest,
    signOut,
    triggerSync,
    restoreFromCloud,
    setAutoSyncEnabled,
  } = useFirebaseSync();

  const sessions = useSimulatorStore((s) => s.sessions);
  const archivedSessions = useSimulatorStore((s) => s.archivedSessions);
  const strategies = useSimulatorStore((s) => s.strategies);

  const [authMode, setAuthMode] = useState<"options" | "email_signin" | "email_signup">("options");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const totalSessions = sessions.length + archivedSessions.length;
  const totalTrades =
    sessions.reduce((acc, s) => acc + (s.trades?.length || 0), 0) +
    archivedSessions.reduce((acc, s) => acc + (s.trades?.length || 0), 0);

  const formatSize = (bytes?: number) => {
    if (!bytes) return "0 KB";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatTime = (ts?: number | null) => {
    if (!ts) return "Never";
    const date = new Date(ts);
    if (isNaN(date.getTime())) return "Never";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleGoogleSignIn = async () => {
    setActionError(null);
    const res = await signInWithGoogle();
    if (!res.success && res.error) setActionError(res.error);
  };

  const handleGuestSignIn = async () => {
    setActionError(null);
    const res = await signInAsGuest();
    if (!res.success && res.error) setActionError(res.error);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!email || !password) {
      setActionError("Please enter both email and password.");
      return;
    }

    if (authMode === "email_signup") {
      const res = await signUpWithEmail(email, password);
      if (!res.success && res.error) setActionError(res.error);
    } else {
      const res = await signInWithEmail(email, password);
      if (!res.success && res.error) setActionError(res.error);
    }
  };

  const handleSyncNow = async () => {
    setActionError(null);
    const res = await triggerSync(true);
    if (!res.success && res.error) {
      setActionError(res.error);
    } else {
      setRestoreSuccessMsg("Workspace successfully synced to Firebase Cloud!");
      setTimeout(() => setRestoreSuccessMsg(null), 3500);
    }
  };

  const handleConfirmRestore = async () => {
    setIsRestoring(true);
    setRestoreSuccessMsg(null);
    setActionError(null);
    const result = await restoreFromCloud();
    setIsRestoring(false);
    setShowRestoreConfirm(false);

    if (result.success) {
      setRestoreSuccessMsg("Workspace restored from Cloud!");
      setTimeout(() => setRestoreSuccessMsg(null), 4000);
    } else if (result.error) {
      setActionError(result.error);
    }
  };

  const handleExportJSON = () => {
    try {
      const state = useSimulatorStore.getState();
      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        appName: "ReplayX Workspace",
        sessions: state.sessions,
        archivedSessions: state.archivedSessions,
        strategies: state.strategies,
        chartColors: state.chartColors,
        theme: state.theme,
        newsImpactFilter: state.newsImpactFilter,
      };
      const jsonBlob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(jsonBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `replayx-workspace-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setRestoreSuccessMsg("Workspace JSON backup file downloaded!");
      setTimeout(() => setRestoreSuccessMsg(null), 3000);
    } catch (err: any) {
      setActionError("Failed to export JSON: " + err.message);
    }
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);
        if (!data.sessions && !data.strategies) {
          throw new Error("Invalid workspace JSON format");
        }
        useSimulatorStore.setState((prev) => ({
          sessions: data.sessions || prev.sessions,
          archivedSessions: data.archivedSessions || prev.archivedSessions,
          strategies: data.strategies || prev.strategies,
          chartColors: data.chartColors || prev.chartColors,
          theme: data.theme || prev.theme,
        }));
        setRestoreSuccessMsg(`Import successful: ${data.sessions?.length || 0} sessions loaded!`);
        setTimeout(() => setRestoreSuccessMsg(null), 4000);
      } catch (err: any) {
        setActionError("Failed to import JSON: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] shadow-2xl text-[var(--text-primary)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-3.5 bg-[var(--surface-ghost)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-1)]/15 text-[var(--accent-1)]">
              <Cloud size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] leading-none">Cloud Backup & Sync</h3>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Continuous auto-sync across all devices</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-3.5 max-h-[72vh] overflow-y-auto">
          {/* Success Banner */}
          {restoreSuccessMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-[#089981]/15 border border-[#089981]/30 p-2.5 text-xs font-medium text-[#089981]">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>{restoreSuccessMsg}</span>
            </div>
          )}

          {/* Error Banner */}
          {actionError && (
            <div className="flex items-center gap-2 rounded-xl bg-[#f23645]/15 border border-[#f23645]/30 p-2.5 text-xs font-medium text-[#f23645]">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* NOT CONNECTED STATE */}
          {!isConnected ? (
            <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-overlay)] p-4 text-center space-y-3">
              <div>
                <h4 className="text-xs font-bold text-[var(--text-primary)]">Connect Cloud Account</h4>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Sign in to automatically sync your charts, drawings, journal notes, and strategies.
                </p>
              </div>

              {authMode === "options" && (
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={handleGuestSignIn}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#089981] hover:bg-[#067d69] px-4 py-2.5 text-xs font-bold text-white transition-all cursor-pointer shadow-sm active:scale-[0.99]"
                  >
                    <CloudUpload size={14} />
                    <span>1-Click Cloud Sync (Instant)</span>
                  </button>

                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-[var(--border-soft)]"></div>
                    <span className="flex-shrink mx-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">or sign in with</span>
                    <div className="flex-grow border-t border-[var(--border-soft)]"></div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#2962ff] hover:bg-[#1e4bd8] px-4 py-2 text-xs font-bold text-white transition-colors cursor-pointer shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Sign in with Google</span>
                  </button>

                  <div className="flex gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setAuthMode("email_signin")}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-soft)] py-1.5 text-[11px] font-medium text-[var(--text-secondary)]"
                    >
                      <Mail size={12} />
                      <span>Email Login</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode("email_signup")}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-soft)] py-1.5 text-[11px] font-medium text-[var(--text-secondary)]"
                    >
                      <UserCheck size={12} />
                      <span>Register</span>
                    </button>
                  </div>
                </div>
              )}

              {(authMode === "email_signin" || authMode === "email_signup") && (
                <form onSubmit={handleEmailAuth} className="space-y-2.5 text-left pt-1">
                  <div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address"
                      className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-1)]"
                    />
                  </div>

                  <div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-1)]"
                    />
                  </div>

                  <div className="flex gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => { setAuthMode("options"); setActionError(null); }}
                      className="rounded-lg bg-[var(--surface-2)] border border-[var(--border-soft)] px-3 py-1.5 text-xs text-[var(--text-muted)]"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="flex-1 rounded-lg bg-[var(--accent-1)] text-[var(--accent-contrast)] px-3 py-1.5 text-xs font-bold transition-colors"
                    >
                      {authMode === "email_signup" ? "Create Account" : "Sign In"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* CONNECTED USER CARD */
            <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-overlay)] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Avatar" className="h-7 w-7 rounded-full border border-[var(--border-soft)]" />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-1)]/20 text-[var(--accent-1)] font-bold text-xs">
                      {user?.email?.charAt(0).toUpperCase() || "U"}
                    </div>
                  )}
                  <div className="leading-tight">
                    <div className="text-xs font-bold text-[var(--text-primary)]">{user?.displayName || user?.email}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{user?.email}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={signOut}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[#f23645] hover:bg-[#f23645]/10 transition-colors"
                >
                  <LogOut size={12} />
                  <span>Logout</span>
                </button>
              </div>

              {/* Status Row */}
              <div className="flex items-center justify-between rounded-lg bg-[var(--surface-1)] border border-[var(--border-soft)] px-3 py-2 text-xs">
                <div className="flex items-center gap-1.5">
                  {syncState === "synced" && (
                    <span className="flex items-center gap-1.5 font-semibold text-[#089981]">
                      <CloudCheck size={14} /> Synchronized
                    </span>
                  )}
                  {syncState === "syncing" && (
                    <span className="flex items-center gap-1.5 font-semibold text-[#2962ff]">
                      <RefreshCw size={13} className="animate-spin" /> Syncing...
                    </span>
                  )}
                  {syncState === "pending" && (
                    <span className="flex items-center gap-1.5 font-semibold text-[#eab308]">
                      <CloudUpload size={13} /> Pending Sync
                    </span>
                  )}
                  {syncState === "error" && (
                    <span className="flex items-center gap-1.5 font-semibold text-[#f23645]">
                      <AlertTriangle size={13} /> Error
                    </span>
                  )}
                  {syncState === "offline" && (
                    <span className="flex items-center gap-1.5 font-semibold text-[var(--text-muted)]">
                      <CloudOff size={13} /> Offline
                    </span>
                  )}
                </div>

                <div className="text-[10px] text-[var(--text-muted)] font-mono">
                  {formatTime(lastSyncAt)}
                </div>
              </div>

              {lastSyncError && (
                <div className="text-[11px] text-[#f23645] bg-[#f23645]/10 border border-[#f23645]/20 rounded-lg p-2">
                  {lastSyncError}
                </div>
              )}
            </div>
          )}

          {/* STORAGE & WORKSPACE OVERVIEW */}
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-overlay)] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <HardDrive size={13} className="text-[var(--accent-1)]" /> Cloud & Local Storage
              </span>
              <span className="text-[11px] font-mono text-[#089981] font-semibold">
                {((1024 * 1024 * 1024 - (cloudBackupSize || 0)) / (1024 * 1024)).toFixed(1)} MB Free
              </span>
            </div>

            {/* Clean Progress Bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
              <div
                className="h-full bg-[var(--accent-1)] transition-all duration-300 rounded-full"
                style={{
                  width: `${Math.max(1, Math.min(100, (((cloudBackupSize || 1024) / (1024 * 1024 * 1024)) * 100)))}%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-0.5">
              <span>{totalSessions} Sessions · {totalTrades} Trades · {strategies.length} Strategies</span>
              <span className="font-mono">{formatSize(cloudBackupSize)} / 1 GB</span>
            </div>
          </div>

          {/* LOCAL FILE EXPORT & IMPORT BACKUP */}
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-overlay)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                <FileJson size={13} className="text-[var(--accent-1)]" />
                <span>Instant File Backup</span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">Zero-config offline export</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleExportJSON}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-soft)] text-xs font-semibold text-[var(--text-primary)] py-2 transition-all cursor-pointer"
              >
                <Download size={13} className="text-[#089981]" />
                <span>Export JSON</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-soft)] text-xs font-semibold text-[var(--text-primary)] py-2 transition-all cursor-pointer"
              >
                <Upload size={13} className="text-[#2962ff]" />
                <span>Import JSON</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
            </div>
          </div>

          {/* CONTROLS */}
          {isConnected && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-soft)] bg-[var(--surface-overlay)] px-3 py-2">
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">Auto-Sync Changes</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Real-time background backup</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoSyncEnabled}
                  onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                    autoSyncEnabled ? "bg-[var(--accent-1)]" : "bg-[var(--surface-3)]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                      autoSyncEnabled ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={syncState === "syncing"}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-1)] hover:bg-[var(--accent-1)]/90 disabled:opacity-50 text-[var(--accent-contrast)] text-xs font-bold py-2 transition-all cursor-pointer shadow-sm"
                >
                  <RefreshCw size={13} className={syncState === "syncing" ? "animate-spin" : ""} />
                  <span>{syncState === "syncing" ? "Syncing..." : "Sync Now"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowRestoreConfirm(true)}
                  disabled={syncState === "syncing" || !cloudBackupExists}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border-soft)] text-xs font-bold text-[var(--text-primary)] disabled:opacity-50 py-2 transition-all cursor-pointer"
                >
                  <HardDrive size={13} className="text-[#089981]" />
                  <span>Restore</span>
                </button>
              </div>
            </div>
          )}

          {/* Privacy Note */}
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] pt-0.5">
            <ShieldCheck size={12} className="text-[#089981] shrink-0" />
            <span>Private Firestore cloud storage protected by authentication rules.</span>
          </div>
        </div>

        {/* Confirmation Modal */}
        <AnimatePresence>
          {showRestoreConfirm && (
            <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                className="w-full max-w-sm rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] p-4 space-y-3 shadow-2xl text-[var(--text-primary)]"
              >
                <div className="flex items-center gap-2 text-[#eab308]">
                  <AlertTriangle size={18} />
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">Restore Cloud Backup?</h4>
                </div>

                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  This will restore your sessions, drawings, and notes from {formatTime(cloudUpdatedAt || lastSyncAt)}.
                </p>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-soft)]">
                  <button
                    type="button"
                    onClick={() => setShowRestoreConfirm(false)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRestore}
                    disabled={isRestoring}
                    className="flex items-center gap-1 rounded-lg bg-[#089981] hover:bg-[#067a67] text-white text-xs font-bold px-3 py-1.5 transition-colors disabled:opacity-50"
                  >
                    {isRestoring ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    <span>Confirm</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
