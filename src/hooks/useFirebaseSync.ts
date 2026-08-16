import { useEffect, useState } from "react";
import { firebaseSyncService, FirebaseSyncStatus } from "../services/firebaseSyncService";

export function useFirebaseSync(): FirebaseSyncStatus & {
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  signInWithEmail: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  signUpWithEmail: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  signInAsGuest: () => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  triggerSync: (force?: boolean) => Promise<{ success: boolean; error?: string }>;
  restoreFromCloud: () => Promise<{ success: boolean; error?: string }>;
  setAutoSyncEnabled: (enabled: boolean) => void;
} {
  const [status, setStatus] = useState<FirebaseSyncStatus>(() => firebaseSyncService.getStatus());

  useEffect(() => {
    firebaseSyncService.init();
    const unsubscribe = firebaseSyncService.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return {
    ...status,
    signInWithGoogle: () => firebaseSyncService.signInWithGoogle(),
    signInWithEmail: (email: string, pass: string) => firebaseSyncService.signInWithEmail(email, pass),
    signUpWithEmail: (email: string, pass: string) => firebaseSyncService.signUpWithEmail(email, pass),
    signInAsGuest: () => firebaseSyncService.signInAsGuest(),
    signOut: () => firebaseSyncService.signOut(),
    triggerSync: (force?: boolean) => firebaseSyncService.triggerSync(force),
    restoreFromCloud: () => firebaseSyncService.restoreFromCloud(),
    setAutoSyncEnabled: (enabled: boolean) => firebaseSyncService.setAutoSyncEnabled(enabled),
  };
}
