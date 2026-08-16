import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInAnonymously,
  signOut, 
  onAuthStateChanged,
  User 
} from "firebase/auth";
import { 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  serverTimestamp 
} from "firebase/firestore";
import { auth, db, googleAuthProvider, browserPopupRedirectResolver } from "../lib/firebase";
import { useSimulatorStore } from "../store/useSimulatorStore";

export type FirebaseSyncState = "idle" | "syncing" | "synced" | "pending" | "error" | "offline";

export interface FirebaseUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous?: boolean;
}

export interface FirebaseSyncStatus {
  isConnected: boolean;
  user: FirebaseUserInfo | null;
  syncState: FirebaseSyncState;
  lastSyncAt: number | null;
  lastSyncError: string | null;
  autoSyncEnabled: boolean;
  pendingCount: number;
  cloudBackupExists: boolean;
  cloudUpdatedAt: number | null;
  cloudBackupSize?: number;
}

type FirebaseSyncListener = (status: FirebaseSyncStatus) => void;

class FirebaseSyncService {
  private status: FirebaseSyncStatus = {
    isConnected: false,
    user: null,
    syncState: "idle",
    lastSyncAt: null,
    lastSyncError: null,
    autoSyncEnabled: true,
    pendingCount: 0,
    cloudBackupExists: false,
    cloudUpdatedAt: null,
  };

  private listeners: Set<FirebaseSyncListener> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSyncedHash: string | null = null;
  private isInitializing = false;
  private unsubscribeStore: (() => void) | null = null;
  private unsubscribeFirestoreDoc: (() => void) | null = null;
  private deviceId: string;

  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
    const savedAutoSync = localStorage.getItem("replayx_firebase_autosync");
    if (savedAutoSync !== null) {
      this.status.autoSyncEnabled = savedAutoSync === "true";
    }
  }

  public init() {
    if (this.isInitializing) return;
    this.isInitializing = true;

    // Listen to Firebase Auth state
    try {
      onAuthStateChanged(
        auth,
        (user) => {
          this.handleAuthChange(user);
        },
        (error) => {
          console.warn("[FirebaseSync] onAuthStateChanged error:", error);
        }
      );
    } catch (err) {
      console.warn("[FirebaseSync] Failed to register onAuthStateChanged:", err);
    }

    // Listen for network changes
    window.addEventListener("online", () => this.handleNetworkChange(true));
    window.addEventListener("offline", () => this.handleNetworkChange(false));

    // Subscribe to local store changes for auto-sync
    this.unsubscribeStore = useSimulatorStore.subscribe((state) => {
      this.handleStoreChange(state);
    });
  }

  public destroy() {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    if (this.unsubscribeFirestoreDoc) {
      this.unsubscribeFirestoreDoc();
      this.unsubscribeFirestoreDoc = null;
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

  public subscribe(listener: FirebaseSyncListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  public getStatus(): FirebaseSyncStatus {
    return { ...this.status };
  }

  private updateStatus(patch: Partial<FirebaseSyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((fn) => fn(this.status));
  }

  public setAutoSyncEnabled(enabled: boolean) {
    localStorage.setItem("replayx_firebase_autosync", enabled ? "true" : "false");
    this.updateStatus({ autoSyncEnabled: enabled });
    if (enabled && this.status.isConnected) {
      this.triggerSync();
    }
  }

  private handleNetworkChange(online: boolean) {
    if (!online) {
      this.updateStatus({ syncState: "offline" });
    } else {
      if (this.status.syncState === "offline") {
        this.updateStatus({ syncState: "idle" });
        if (this.status.isConnected && this.status.autoSyncEnabled) {
          this.triggerSync();
        }
      }
    }
  }

  private async handleAuthChange(user: User | null) {
    if (this.unsubscribeFirestoreDoc) {
      this.unsubscribeFirestoreDoc();
      this.unsubscribeFirestoreDoc = null;
    }

    if (user) {
      const isAnon = Boolean(user.isAnonymous);
      const userInfo: FirebaseUserInfo = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || (isAnon ? "Guest Trader (Cloud Sync)" : user.email?.split("@")[0] || "Trader"),
        photoURL: user.photoURL,
        isAnonymous: isAnon,
      };

      this.updateStatus({
        isConnected: true,
        user: userInfo,
        syncState: "idle",
        lastSyncError: null,
      });

      // Check for existing cloud backup
      this.checkCloudBackupStatus(user.uid);
    } else {
      this.updateStatus({
        isConnected: false,
        user: null,
        syncState: "idle",
        lastSyncAt: null,
        lastSyncError: null,
        cloudBackupExists: false,
        cloudUpdatedAt: null,
        pendingCount: 0,
      });
      this.lastSyncedHash = null;
    }
  }

  public async signInAsGuest(): Promise<{ success: boolean; error?: string }> {
    try {
      this.updateStatus({ syncState: "syncing", lastSyncError: null });
      await signInAnonymously(auth);
      return { success: true };
    } catch (err: any) {
      console.error("[FirebaseSync] Guest sign-in error:", err);
      let errorMsg = err.message || "Failed to initialize guest cloud sync";
      if (err.code === "auth/admin-restricted-operation" || err.message?.includes("admin-restricted-operation")) {
        errorMsg = "Anonymous sign-in is not enabled in Firebase Console. Please use Email Login / Register below, or use the Instant File / Local Backup.";
      } else if (err.code === "auth/operation-not-allowed") {
        errorMsg = "Anonymous sign-in provider is disabled. Please use Email Login below.";
      }
      this.updateStatus({ syncState: "error", lastSyncError: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  public async signInWithGoogle(): Promise<{ success: boolean; error?: string }> {
    try {
      this.updateStatus({ syncState: "syncing", lastSyncError: null });
      await signInWithPopup(auth, googleAuthProvider, browserPopupRedirectResolver);
      return { success: true };
    } catch (err: any) {
      console.error("[FirebaseSync] Sign in error:", err);
      let errorMsg = err.message || "Failed to sign in with Google";
      if (err.code === "auth/unauthorized-domain" || err.message?.includes("unauthorized-domain")) {
        errorMsg = `Current domain (${window.location.hostname}) is not in Firebase Auth's Authorized Domains list. Please use Email Login / Register below, which works immediately without domain whitelisting!`;
      } else if (err.code === "auth/network-request-failed" || err.message?.includes("network-request-failed")) {
        errorMsg = "Google popup connection was blocked by browser iframe security. Please use Email Login / Register below or open the app in a new tab.";
      } else if (err.code === "auth/popup-blocked") {
        errorMsg = "Popup was blocked by your browser. Please allow popups or use Email Login below.";
      } else if (err.code === "auth/cancelled-popup-request" || err.code === "auth/popup-closed-by-user") {
        errorMsg = "Sign-in was cancelled.";
      }
      this.updateStatus({ syncState: "error", lastSyncError: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  public async signInWithEmail(email: string, pass: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.updateStatus({ syncState: "syncing", lastSyncError: null });
      await signInWithEmailAndPassword(auth, email, pass);
      return { success: true };
    } catch (err: any) {
      console.error("[FirebaseSync] Email sign in error:", err);
      let errorMsg = err.message || "Failed to sign in with email";
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        errorMsg = "Invalid email or password. If you don't have an account yet, click 'Register' to create one instantly.";
      } else if (err.code === "auth/invalid-email") {
        errorMsg = "Please enter a valid email address.";
      } else if (err.code === "auth/operation-not-allowed") {
        errorMsg = "Email/Password sign-in provider is disabled in Firebase Console.";
      }
      this.updateStatus({ syncState: "error", lastSyncError: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  public async signUpWithEmail(email: string, pass: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.updateStatus({ syncState: "syncing", lastSyncError: null });
      await createUserWithEmailAndPassword(auth, email, pass);
      return { success: true };
    } catch (err: any) {
      console.error("[FirebaseSync] Email sign up error:", err);
      let errorMsg = err.message || "Failed to create account";
      if (err.code === "auth/email-already-in-use") {
        errorMsg = "An account with this email already exists. Click 'Email Login' to sign in.";
      } else if (err.code === "auth/weak-password") {
        errorMsg = "Password should be at least 6 characters long.";
      } else if (err.code === "auth/invalid-email") {
        errorMsg = "Please enter a valid email address.";
      } else if (err.code === "auth/operation-not-allowed") {
        errorMsg = "Email/Password sign-in provider is disabled in Firebase Console.";
      }
      this.updateStatus({ syncState: "error", lastSyncError: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  public async signOut(): Promise<void> {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("[FirebaseSync] Sign out error:", err);
    }
  }

  private async checkCloudBackupStatus(uid: string) {
    try {
      const docRef = doc(db, "users", uid, "workspaces", "default");
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data();
        const updatedAt = data.updatedAtMs || (data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now());
        const jsonStr = JSON.stringify(data);
        this.updateStatus({
          cloudBackupExists: true,
          cloudUpdatedAt: updatedAt,
          cloudBackupSize: jsonStr.length,
          lastSyncAt: updatedAt,
        });
      } else {
        this.updateStatus({
          cloudBackupExists: false,
          cloudUpdatedAt: null,
        });
      }
    } catch (err: any) {
      console.warn("[FirebaseSync] checkCloudBackupStatus error:", err);
    }
  }

  private sanitizeForFirestore(obj: any): any {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeForFirestore(item));
    }
    const cleanObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleanObj[key] = this.sanitizeForFirestore(value);
      }
    }
    return cleanObj;
  }

  public extractWorkspacePayload(state: any): any {
    const raw = {
      sessions: (state.sessions || []).map((s: any) => ({
        id: s.id,
        name: s.name || "Default Session",
        initialBalance: s.initialBalance ?? 10000,
        balance: s.balance ?? 10000,
        instrument: s.instrument || "EURUSD",
        timeframe: s.timeframe || "1m",
        startDate: s.startDate || null,
        endDate: s.endDate || null,
        trades: s.trades || [],
        currentIndex: s.currentIndex || 0,
        targetTimestamp: s.targetTimestamp ?? null,
        lastReplayTimestamp: s.lastReplayTimestamp ?? null,
        playbackSpeed: s.playbackSpeed || 1,
        indicators: s.indicators || [],
        journalEntries: s.journalEntries || [],
        checklistCheckedItems: s.checklistCheckedItems || {},
        timeframePanes: s.timeframePanes || [],
        mtfLayout: s.mtfLayout || "horizontal",
        compressGaps: s.compressGaps ?? false,
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
    };

    return this.sanitizeForFirestore(raw);
  }

  private computeHash(obj: any): string {
    return JSON.stringify(obj);
  }

  private handleStoreChange(state: any) {
    if (!this.status.isConnected || !this.status.autoSyncEnabled || !this.status.user) return;

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

    this.updateStatus({
      syncState: "pending",
      pendingCount: (this.status.pendingCount || 0) + 1,
    });

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Debounce to batch multiple consecutive edits (e.g. dragging drawings or rapid notes)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.triggerSync();
    }, 2500);
  }

  public async triggerSync(force = false): Promise<{ success: boolean; error?: string }> {
    if (!this.status.isConnected || !this.status.user) {
      return { success: false, error: "Not logged in" };
    }

    if (!navigator.onLine) {
      this.updateStatus({ syncState: "offline" });
      return { success: false, error: "Internet connection offline" };
    }

    const state = useSimulatorStore.getState();
    const payload = this.extractWorkspacePayload(state);
    const hash = this.computeHash(payload);

    if (!force && hash === this.lastSyncedHash && this.status.lastSyncAt !== null) {
      this.updateStatus({ syncState: "synced", pendingCount: 0 });
      return { success: true };
    }

    this.updateStatus({ syncState: "syncing", lastSyncError: null });

    try {
      const now = Date.now();
      const docRef = doc(db, "users", this.status.user.uid, "workspaces", "default");
      
      await setDoc(docRef, {
        version: 1,
        appName: "ReplayX Workspace",
        updatedAt: serverTimestamp(),
        updatedAtMs: now,
        deviceId: this.deviceId,
        workspaceState: payload,
      });

      this.lastSyncedHash = hash;
      this.updateStatus({
        syncState: "synced",
        lastSyncAt: now,
        lastSyncError: null,
        pendingCount: 0,
        cloudBackupExists: true,
        cloudUpdatedAt: now,
        cloudBackupSize: JSON.stringify(payload).length,
      });

      return { success: true };
    } catch (err: any) {
      console.error("[FirebaseSync] Sync failed:", err);
      const errorMsg = err.message || "Failed to save workspace to Firebase";
      this.updateStatus({
        syncState: "error",
        lastSyncError: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  }

  public async restoreFromCloud(): Promise<{ success: boolean; error?: string }> {
    if (!this.status.isConnected || !this.status.user) {
      return { success: false, error: "Not logged in" };
    }

    this.updateStatus({ syncState: "syncing", lastSyncError: null });

    try {
      const docRef = doc(db, "users", this.status.user.uid, "workspaces", "default");
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        this.updateStatus({ syncState: "error", lastSyncError: "No cloud backup found" });
        return { success: false, error: "No cloud backup found on your account." };
      }

      const data = snap.data();
      const workspace = data.workspaceState;

      if (!workspace) {
        throw new Error("Cloud backup data structure is missing workspaceState");
      }

      const store = useSimulatorStore.getState();

      // Apply restored workspace
      useSimulatorStore.setState({
        sessions: workspace.sessions || store.sessions,
        archivedSessions: workspace.archivedSessions || store.archivedSessions,
        currentSessionId: workspace.currentSessionId || store.currentSessionId,
        strategies: workspace.strategies || store.strategies,
        chartColors: workspace.chartColors || store.chartColors,
        chartTimezone: workspace.chartTimezone || store.chartTimezone,
        theme: workspace.theme || store.theme,
        useSyntheticSeconds: workspace.useSyntheticSeconds ?? store.useSyntheticSeconds,
        newsImpactFilter: workspace.newsImpactFilter || store.newsImpactFilter,
        newsLineOpacity: workspace.newsLineOpacity ?? store.newsLineOpacity,
        gridVertLinesVisible: workspace.gridVertLinesVisible ?? store.gridVertLinesVisible,
        gridHorzLinesVisible: workspace.gridHorzLinesVisible ?? store.gridHorzLinesVisible,
      });

      this.lastSyncedHash = this.computeHash(workspace);
      const restoredAt = data.updatedAtMs || Date.now();

      this.updateStatus({
        syncState: "synced",
        lastSyncAt: restoredAt,
        lastSyncError: null,
        pendingCount: 0,
        cloudBackupExists: true,
        cloudUpdatedAt: restoredAt,
      });

      return { success: true };
    } catch (err: any) {
      console.error("[FirebaseSync] Restore failed:", err);
      const errorMsg = err.message || "Failed to restore backup from Firebase";
      this.updateStatus({ syncState: "error", lastSyncError: errorMsg });
      return { success: false, error: errorMsg };
    }
  }
}

export const firebaseSyncService = new FirebaseSyncService();
