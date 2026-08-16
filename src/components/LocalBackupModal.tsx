import React, { useState, useRef } from "react";
import {
  Download,
  Upload,
  HardDrive,
  FileCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  Database,
  Layers,
  ShieldCheck,
  Clock,
  ArrowDownToLine,
  FileUp,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useSimulatorStore } from "../store/useSimulatorStore";
import {
  exportWorkspaceArchive,
  triggerDownloadBackup,
  validateBackupFile,
  importWorkspaceArchive,
  ValidationResult,
  RestoreMode,
  BACKUP_FILE_EXTENSION,
} from "../services/localBackupService";

interface LocalBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LocalBackupModal: React.FC<LocalBackupModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<"export" | "import">("export");
  const sessions = useSimulatorStore((s) => s.sessions);
  const archivedSessions = useSimulatorStore((s) => s.archivedSessions);
  const strategies = useSimulatorStore((s) => s.strategies);

  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // Import states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("replace");
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  if (!isOpen) return null;

  const totalSessions = sessions.length + archivedSessions.length;
  const totalTrades =
    sessions.reduce((acc, s) => acc + (s.trades?.length || 0), 0) +
    archivedSessions.reduce((acc, s) => acc + (s.trades?.length || 0), 0);
  const totalJournalEntries =
    sessions.reduce((acc, s) => acc + (s.journalEntries?.length || 0), 0) +
    archivedSessions.reduce((acc, s) => acc + (s.journalEntries?.length || 0), 0);

  const lastExportAt = localStorage.getItem("replayx_last_export_at");
  const lastImportAt = localStorage.getItem("replayx_last_import_at");

  const formatTime = (tsStr?: string | null) => {
    if (!tsStr) return "Never";
    const ts = parseInt(tsStr, 10);
    if (isNaN(ts)) return "Never";
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccessMsg(null);
    try {
      const { jsonString, filename } = await exportWorkspaceArchive();
      triggerDownloadBackup(jsonString, filename);
      setExportSuccessMsg(`Exported ${filename}`);
      setTimeout(() => setExportSuccessMsg(null), 5000);
    } catch (err: any) {
      alert("Failed to create backup: " + (err?.message || "Unknown error"));
    } finally {
      setIsExporting(false);
    }
  };

  const processSelectedFile = async (file: File) => {
    setSelectedFileName(file.name);
    setValidating(true);
    setValidationResult(null);
    setConfirmReplace(false);

    try {
      const content = await file.text();
      const result = await validateBackupFile(content);
      setValidationResult(result);
    } catch (err: any) {
      setValidationResult({
        valid: false,
        error: "Failed to read file: " + (err?.message || "File error"),
      });
    } finally {
      setValidating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processSelectedFile(file);
  };

  const executeRestore = async () => {
    if (!validationResult?.archive) return;

    setIsRestoring(true);
    setConfirmReplace(false);
    setRestoreSuccessMsg(null);

    const result = await importWorkspaceArchive(validationResult.archive, restoreMode);
    setIsRestoring(false);

    if (result.success) {
      setRestoreSuccessMsg("Workspace restored successfully!");
      setValidationResult(null);
      setSelectedFileName(null);
      setTimeout(() => setRestoreSuccessMsg(null), 5000);
    } else {
      alert("Import failed: " + result.error);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] shadow-2xl text-[var(--text-primary)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-3.5 bg-[var(--surface-ghost)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-1)]/15 text-[var(--accent-1)]">
              <HardDrive size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] leading-none">Local Workspace Backup</h3>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Export or restore self-contained backup files</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-3">
          <div className="flex rounded-xl bg-[var(--surface-2)] p-1 border border-[var(--border-soft)]">
            <button
              type="button"
              onClick={() => setActiveTab("export")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "export"
                  ? "bg-[var(--surface-1)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <ArrowDownToLine size={14} className={activeTab === "export" ? "text-[var(--accent-1)]" : ""} />
              <span>Export File</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("import")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "import"
                  ? "bg-[var(--surface-1)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <FileUp size={14} className={activeTab === "import" ? "text-[#089981]" : ""} />
              <span>Restore File</span>
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Notifications */}
          {exportSuccessMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-[#089981]/15 border border-[#089981]/30 p-2.5 text-xs font-medium text-[#089981]">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>{exportSuccessMsg}</span>
            </div>
          )}

          {restoreSuccessMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-[#089981]/15 border border-[#089981]/30 p-2.5 text-xs font-medium text-[#089981]">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>{restoreSuccessMsg}</span>
            </div>
          )}

          {/* EXPORT TAB */}
          {activeTab === "export" && (
            <div className="space-y-3">
              {/* Summary Stats Row */}
              <div className="flex items-center justify-between rounded-xl bg-[var(--surface-2)] border border-[var(--border-soft)] px-4 py-3 text-xs">
                <div className="space-y-0.5">
                  <div className="text-[var(--text-muted)] text-[11px]">Workspace Snapshot</div>
                  <div className="font-semibold text-[var(--text-primary)]">
                    {totalSessions} Sessions · {totalTrades} Trades · {totalJournalEntries} Journal Logs · {strategies.length} Strategies
                  </div>
                </div>
                <div className="text-right text-[11px] text-[var(--text-muted)]">
                  <div className="flex items-center gap-1 justify-end">
                    <Clock size={11} />
                    <span>Last Export</span>
                  </div>
                  <div className="font-mono text-[var(--text-primary)]">{formatTime(lastExportAt)}</div>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-overlay)] p-4 text-center space-y-3">
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Downloads a portable <code className="font-mono text-[var(--accent-1)] font-semibold">{BACKUP_FILE_EXTENSION}</code> file containing your complete charts, drawings, journal notes, trades, and strategies.
                </p>

                <button
                  type="button"
                  onClick={handleExport}
                  disabled={isExporting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-1)] hover:bg-[var(--accent-1)]/90 disabled:opacity-50 text-[var(--accent-contrast)] text-xs font-bold py-2.5 px-4 transition-all shadow-sm cursor-pointer"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Creating File...</span>
                    </>
                  ) : (
                    <>
                      <Download size={15} />
                      <span>Download Backup File</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* IMPORT / RESTORE TAB */}
          {activeTab === "import" && (
            <div className="space-y-3">
              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                  isDragOver
                    ? "border-[#089981] bg-[#089981]/10"
                    : "border-[var(--border-soft)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".replayx,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <FileCheck className="mx-auto h-6 w-6 text-[var(--text-muted)] mb-1" />
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  {selectedFileName ? selectedFileName : "Choose or drop .replayx backup file"}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  Last restore: {formatTime(lastImportAt)}
                </div>
              </div>

              {validating && (
                <div className="flex items-center gap-2 text-xs font-semibold text-[#2962ff] bg-[#2962ff]/10 border border-[#2962ff]/20 rounded-xl p-2.5">
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Validating file structure...</span>
                </div>
              )}

              {validationResult && !validating && (
                <div className="space-y-3">
                  {validationResult.valid ? (
                    <div className="rounded-xl border border-[#089981]/30 bg-[#089981]/10 p-3 space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-[#089981]">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 size={15} /> Valid Backup File (v{validationResult.schemaVersion})
                        </span>
                        <span className="text-[11px] font-mono opacity-80">
                          {(validationResult.summary?.sessionCount || 0) + (validationResult.summary?.archivedSessionCount || 0)} sessions · {validationResult.summary?.tradeCount || 0} trades
                        </span>
                      </div>

                      {/* Restore Mode */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setRestoreMode("replace")}
                          className={`rounded-lg border p-2 text-left text-xs transition-all ${
                            restoreMode === "replace"
                              ? "border-[#089981] bg-[#089981]/20 font-bold text-[var(--text-primary)]"
                              : "border-[var(--border-soft)] bg-[var(--surface-1)] text-[var(--text-muted)]"
                          }`}
                        >
                          <div className="font-semibold flex items-center gap-1 text-[var(--text-primary)] text-[11px]">
                            <Database size={12} className="text-[#089981]" /> Replace All
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                            Overwrites workspace
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setRestoreMode("merge")}
                          className={`rounded-lg border p-2 text-left text-xs transition-all ${
                            restoreMode === "merge"
                              ? "border-[#2962ff] bg-[#2962ff]/20 font-bold text-[var(--text-primary)]"
                              : "border-[var(--border-soft)] bg-[var(--surface-1)] text-[var(--text-muted)]"
                          }`}
                        >
                          <div className="font-semibold flex items-center gap-1 text-[var(--text-primary)] text-[11px]">
                            <Layers size={12} className="text-[#2962ff]" /> Merge / Append
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                            Appends to current data
                          </div>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => restoreMode === "replace" ? setConfirmReplace(true) : executeRestore()}
                        disabled={isRestoring}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#089981] hover:bg-[#067a67] text-white text-xs font-bold py-2 px-4 transition-colors disabled:opacity-50"
                      >
                        {isRestoring ? (
                          <>
                            <RefreshCw size={13} className="animate-spin" />
                            <span>Restoring...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={13} />
                            <span>Confirm & Restore Workspace</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[#f23645]/30 bg-[#f23645]/10 p-2.5 text-xs text-[#f23645] flex items-center gap-2">
                      <AlertTriangle size={15} className="shrink-0" />
                      <span>{validationResult.error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Privacy Note */}
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] pt-1">
            <ShieldCheck size={13} className="text-[#089981] shrink-0" />
            <span>Files are processed purely in your local browser without external servers.</span>
          </div>
        </div>

        {/* Confirmation Modal for Replace Mode */}
        <AnimatePresence>
          {confirmReplace && (
            <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                className="w-full max-w-sm rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] p-4 space-y-3 shadow-2xl text-[var(--text-primary)]"
              >
                <div className="flex items-center gap-2 text-[#eab308]">
                  <AlertTriangle size={18} />
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">Overwrite Workspace?</h4>
                </div>

                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Restoring will overwrite your current sessions, drawings, and notes with the backup contents.
                </p>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-soft)]">
                  <button
                    type="button"
                    onClick={() => setConfirmReplace(false)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={executeRestore}
                    className="flex items-center gap-1 rounded-lg bg-[#089981] hover:bg-[#067a67] text-white text-xs font-bold px-3 py-1.5 transition-colors"
                  >
                    <CheckCircle2 size={13} />
                    <span>Proceed</span>
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
